// @ts-nocheck
/**
 * gps-heartbeat-pulse
 *
 * Körs av pg_cron var 10:e minut. Hämtar alla inloggade device_tokens och
 * skickar en silent push (data-only, content-available:1) till de enheter
 * vars senaste staff_location_history-ping saknas eller är äldre än
 * PULSE_INTERVAL_MIN. Detta väcker mobilappen och triggar en forced
 * getCurrentPosition + upload_location_batch med battery_source='gps_pulse'.
 *
 * INGEN workday-gating. INGEN active_time_registrations-gating. INGEN
 * Time Engine. INGEN staff_day_report_cache. Pulse är endast ett
 * lågintensivt sätt att få färsk råposition från inloggade devices.
 * Arbetstid avgörs senare i Time Engine.
 *
 * Loggar varje försök i gps_pulse_log.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// AKUT STABILISERING 2026-05-26: Min-intervall höjt 20 → 30 min, max batch
// sänkt 50 → 20 enheter per körning. Pulse-cron körs nu var 10:e min (se migration).
const PULSE_INTERVAL_MIN = Math.max(30, Number(Deno.env.get('GPS_PULSE_INTERVAL_MIN') ?? '30'))
const PULSE_MAX_BATCH = Math.min(20, Number(Deno.env.get('GPS_PULSE_MAX_BATCH') ?? '20'))
const PULSE_MAX_RUNTIME_MS = 20_000
const STALE_LOOKBACK_MS = 24 * 60 * 60 * 1000


async function getAccessToken(serviceAccount: any): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const claimSet = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signInput = `${header}.${claimSet}`
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput)
  )
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const jwt = `${header}.${claimSet}.${encodedSignature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenRes.ok) throw new Error(`OAuth token failed: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token
}

function parseServiceAccount(raw: string): any {
  let sa: any = null
  try { sa = JSON.parse(raw) } catch { /* ignore */ }
  if (typeof sa === 'string') {
    try { sa = JSON.parse(sa) } catch { sa = null }
  }
  if (!sa || typeof sa !== 'object') {
    let cleaned = raw.trim()
    while (cleaned.startsWith('"') && cleaned.endsWith('"')) cleaned = cleaned.slice(1, -1)
    cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    try { sa = JSON.parse(cleaned) } catch { /* ignore */ }
  }
  if (!sa || typeof sa !== 'object') {
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) { try { sa = JSON.parse(m[0]) } catch { /* ignore */ } }
  }
  return sa
}

/**
 * Pure selector — exporterad för enhetstest. Returnerar listan av
 * device_tokens vars staff_id har senaste ping äldre än cutoff (eller
 * ingen ping alls). En rad per token (en staff kan ha flera enheter).
 */
export function pickPulseCandidates(
  tokens: Array<{ id: string; staff_id: string; token: string; platform: string | null; organization_id: string }>,
  lastPingByStaff: Map<string, string | null>,
  nowIso: string,
  intervalMinutes: number,
): typeof tokens {
  const nowMs = new Date(nowIso).getTime()
  const cutoffMs = nowMs - intervalMinutes * 60_000
  const out: typeof tokens = []
  for (const t of tokens) {
    const last = lastPingByStaff.get(t.staff_id) ?? null
    if (!last) { out.push(t); continue }
    const lastMs = new Date(last).getTime()
    if (Number.isFinite(lastMs) && lastMs < cutoffMs) out.push(t)
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startedAt = Date.now()
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const firebaseRaw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY')
    if (!firebaseRaw) {
      return new Response(JSON.stringify({ error: 'FIREBASE_SERVICE_ACCOUNT_KEY missing' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const sa = parseServiceAccount(firebaseRaw)
    if (!sa?.client_email || !sa?.private_key || !sa?.project_id) {
      return new Response(JSON.stringify({ error: 'Service account invalid' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Hämta device_tokens för inloggade enheter (de med staff_id satt).
    //    Ingen active_time_registrations-gating. Ingen recentPings-gating.
    const { data: tokens, error: tokenErr } = await supabase
      .from('device_tokens')
      .select('id, staff_id, token, platform, organization_id, refreshed_at, created_at')
      .not('staff_id', 'is', null)
      .order('refreshed_at', { ascending: false, nullsFirst: false })
      .limit(PULSE_MAX_BATCH * 5)
    if (tokenErr) throw new Error(`device_tokens fetch failed: ${tokenErr.message}`)
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ pulsed: 0, reason: 'no_tokens', duration_ms: Date.now() - startedAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Bygg staffIds-set från tokens och hämta senaste ping per staff
    //    inom rimligt fönster (24h) — staff utan rad räknas som stale.
    const staffIds = Array.from(new Set(tokens.map(t => String(t.staff_id)).filter(Boolean)))
    const staleLookbackIso = new Date(Date.now() - STALE_LOOKBACK_MS).toISOString()
    const { data: lastRows } = await supabase
      .from('staff_location_history')
      .select('staff_id, recorded_at')
      .in('staff_id', staffIds)
      .gte('recorded_at', staleLookbackIso)
      .order('recorded_at', { ascending: false })
      .limit(Math.max(PULSE_MAX_BATCH * 20, 200))

    const lastPingByStaff = new Map<string, string>()
    for (const row of lastRows ?? []) {
      const sid = row.staff_id as string
      if (!lastPingByStaff.has(sid)) {
        lastPingByStaff.set(sid, row.recorded_at as string)
      }
    }

    const candidates = pickPulseCandidates(
      tokens as any,
      lastPingByStaff,
      new Date().toISOString(),
      PULSE_INTERVAL_MIN,
    ).slice(0, PULSE_MAX_BATCH)

    if (candidates.length === 0) {
      return new Response(JSON.stringify({
        pulsed: 0, tokens: tokens.length, reason: 'all_fresh', duration_ms: Date.now() - startedAt,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }


    // 3. Hämta access token EN gång och skicka silent push per device
    const accessToken = await getAccessToken(sa)
    const projectId = sa.project_id
    const issuedAt = new Date().toISOString()

    let okCount = 0
    let failCount = 0
    const logRows: any[] = []

    let truncatedByRuntime = false
    for (const c of candidates) {
      if (Date.now() - startedAt > PULSE_MAX_RUNTIME_MS) { truncatedByRuntime = true; break }
      const platform = (c.platform ?? '').toLowerCase()
      const message: any = {
        message: {
          token: c.token,
          // INGEN notification-payload → tyst push.
          data: {
            type: 'gps_pulse',
            issued_at: issuedAt,
          },
          android: {
            priority: 'high',
            // Data-only: lämna notification UR Android-blocket också,
            // annars dyker en synlig notis upp.
          },
          apns: {
            headers: {
              'apns-priority': '5',
              'apns-push-type': 'background',
            },
            payload: {
              aps: {
                'content-available': 1,
              },
            },
          },
        },
      }

      let success = false
      let fcmError: string | null = null
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
          },
        )
        const body = await res.json().catch(() => ({}))
        if (res.ok) {
          success = true
          okCount++
        } else {
          fcmError = JSON.stringify(body).slice(0, 500)
          failCount++
          // Städa kompromisslösa tokens precis som send-push-notification gör
          const errCode = body?.error?.code
          const errStatus = body?.error?.status
          const errorCode = body?.error?.details?.[0]?.errorCode
          const isUnregistered = errorCode === 'UNREGISTERED' || errCode === 404
          const isInvalidArgument =
            errStatus === 'INVALID_ARGUMENT' || errCode === 400 || errorCode === 'INVALID_ARGUMENT'
          if (isUnregistered || isInvalidArgument) {
            await supabase.from('device_tokens').delete().eq('token', c.token)
          }
        }
      } catch (e) {
        fcmError = String((e as Error)?.message ?? e).slice(0, 500)
        failCount++
      }

      logRows.push({
        organization_id: c.organization_id,
        staff_id: c.staff_id,
        device_token_id: c.id,
        sent_at: new Date().toISOString(),
        success,
        fcm_error: fcmError,
      })
    }

    if (logRows.length > 0) {
      const { error: logErr } = await supabase.from('gps_pulse_log').insert(logRows)
      if (logErr) console.warn('[gps-pulse] log insert failed:', logErr.message)
    }

    console.log(`[gps-pulse] pulsed=${okCount}/${candidates.length} failed=${failCount} runtime_ms=${Date.now() - startedAt} truncated=${truncatedByRuntime}`)
    return new Response(JSON.stringify({
      pulsed: candidates.length,
      ok: okCount,
      failed: failCount,
      tokens: tokens.length,
      truncated_by_runtime: truncatedByRuntime,
      duration_ms: Date.now() - startedAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[gps-pulse] error:', err)
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
