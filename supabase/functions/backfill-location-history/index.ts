// @ts-nocheck
/**
 * backfill-location-history
 * ─────────────────────────
 * Engångsjobb som läser Supabase Analytics edge-loggar för
 * `mobile-app-api` (action=report_location) för en given staff + dag,
 * och inserterar de råa GPS-pingsen i `staff_location_history`.
 *
 * Bakgrund: tabellen var typad uuid och tappade tyst alla legacy text-IDs
 * (Raivis m.fl.). Migrationen är gjord — denna funktion fyller på dagens
 * data retroaktivt så länge loggarna fortfarande finns kvar (~7 dygn).
 *
 * Idempotent: använder ON CONFLICT-ish strategi via dedup på
 * (staff_id, recorded_at) inom rimligt fönster.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Body {
  staff_id: string
  date: string // yyyy-MM-dd
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROJECT_REF = (Deno.env.get('SUPABASE_PROJECT_REF') ?? SUPABASE_URL.replace('https://', '').split('.')[0])
// Reserved prefix `SUPABASE_` is blocked for user secrets — use SUPA_MGMT_API_TOKEN.
const MGMT_TOKEN = Deno.env.get('SUPA_MGMT_API_TOKEN') ?? Deno.env.get('SUPABASE_MANAGEMENT_API_TOKEN')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const body: Body = await req.json()
    if (!body?.staff_id || !body?.date) {
      return json({ error: 'staff_id and date required' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

    // Resolve staff org
    const { data: staff, error: staffErr } = await supabase
      .from('staff_members')
      .select('id, organization_id')
      .eq('id', body.staff_id)
      .maybeSingle()
    if (staffErr || !staff) return json({ error: 'Staff not found' }, 404)

    const dayStart = new Date(`${body.date}T00:00:00.000Z`).getTime()
    const dayEnd = new Date(`${body.date}T23:59:59.999Z`).getTime()

    // If management token is configured we can query logs; otherwise fall back to
    // a "no-op" response that explains the situation so the dialog can show it.
    if (!MGMT_TOKEN) {
      return json({
        scanned: 0,
        inserted: 0,
        note: 'SUPABASE_MANAGEMENT_API_TOKEN saknas — kan ej läsa edge-loggar. Lägg till hemligheten för att aktivera log-baserad backfill.',
      })
    }

    // Query analytics: edge function logs for mobile-app-api with body containing report_location
    // Note: log retention is typically ~7 days. Body availability depends on log level.
    const sql = `
      select timestamp, event_message
      from function_logs
      where timestamp >= '${new Date(dayStart).toISOString()}'
        and timestamp <= '${new Date(dayEnd).toISOString()}'
        and event_message like '%report_location%'
        and event_message like '%${body.staff_id}%'
      order by timestamp asc
      limit 5000
    `.trim()

    const analyticsRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/analytics/endpoints/logs.all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MGMT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      }
    )

    if (!analyticsRes.ok) {
      const txt = await analyticsRes.text()
      return json({ error: 'Analytics query failed', detail: txt.slice(0, 500) }, 502)
    }

    const logs = await analyticsRes.json() as { result: Array<{ timestamp: number; event_message: string }> }
    const rows = logs?.result || []

    // Parse lat/lng/timestamp from log lines. We accept several shapes:
    //   "report_location ... lat:59.33 lng:18.06 ts:..."
    //   JSON-blob with {"latitude": 59.33, "longitude": 18.06}
    const parsed: Array<{ lat: number; lng: number; ts: string; accuracy: number | null }> = []
    for (const row of rows) {
      const msg = row.event_message
      let lat: number | null = null
      let lng: number | null = null
      let acc: number | null = null

      // Try JSON
      const jsonMatch = msg.match(/\{[^}]*lat(?:itude)?[^}]+\}/i)
      if (jsonMatch) {
        try {
          const obj = JSON.parse(jsonMatch[0].replace(/'/g, '"'))
          lat = Number(obj.latitude ?? obj.lat)
          lng = Number(obj.longitude ?? obj.lng)
          acc = obj.accuracy != null ? Number(obj.accuracy) : null
        } catch { /* ignore */ }
      }

      // Try key:value
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        const latM = msg.match(/lat(?:itude)?["':\s]+(-?\d+\.\d+)/i)
        const lngM = msg.match(/(?:lng|long|longitude)["':\s]+(-?\d+\.\d+)/i)
        if (latM && lngM) {
          lat = Number(latM[1])
          lng = Number(lngM[1])
        }
        const accM = msg.match(/accuracy["':\s]+(\d+(?:\.\d+)?)/i)
        if (accM) acc = Number(accM[1])
      }

      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue

      const ts = new Date(row.timestamp / 1000).toISOString() // logs are µs
      parsed.push({ lat, lng, ts, accuracy: acc })
    }

    if (parsed.length === 0) {
      return json({ scanned: rows.length, inserted: 0, note: 'Inga GPS-koordinater kunde extraheras från loggarna.' })
    }

    // Dedup against existing history within the day
    const { data: existing } = await supabase
      .from('staff_location_history')
      .select('recorded_at')
      .eq('staff_id', body.staff_id)
      .gte('recorded_at', new Date(dayStart).toISOString())
      .lte('recorded_at', new Date(dayEnd).toISOString())
    const existingSet = new Set((existing || []).map((r: any) => new Date(r.recorded_at).getTime()))

    const fresh = parsed.filter(p => !existingSet.has(new Date(p.ts).getTime()))

    if (fresh.length === 0) {
      return json({ scanned: rows.length, inserted: 0, note: 'Alla extraherade pings finns redan i historiken.' })
    }

    const insertRows = fresh.map(p => ({
      organization_id: staff.organization_id,
      staff_id: body.staff_id,
      lat: p.lat,
      lng: p.lng,
      accuracy: p.accuracy,
      recorded_at: p.ts,
    }))

    const { error: insErr } = await supabase
      .from('staff_location_history')
      .insert(insertRows)

    if (insErr) return json({ error: 'Insert failed', detail: insErr.message }, 500)

    return json({ scanned: rows.length, inserted: insertRows.length })
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
