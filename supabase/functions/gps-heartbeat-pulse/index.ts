// @ts-nocheck
/**
 * gps-heartbeat-pulse
 *
 * Körs av pg_cron varje minut. Hittar alla registrerade device_tokens där
 * senaste GPS-ping är äldre än PULSE_INTERVAL_MIN. Skickar en silent push
 * (data-only, content-available:1) som väcker mobilappen och triggar en
 * forced getCurrentPosition + upload_location_batch med
 * battery_source='gps_pulse'.
 *
 * Ingen workday-gating, ingen aktivitetsgating — alla inloggade enheter
 * pingas så vi alltid har en färsk position på kartan.
 *
 * Loggar varje försök i gps_pulse_log.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PULSE_INTERVAL_MIN = Math.max(20, Number(Deno.env.get('GPS_PULSE_INTERVAL_MIN') ?? '20'))
const PULSE_MAX_BATCH = Math.min(50, Number(Deno.env.get('GPS_PULSE_MAX_BATCH') ?? '50'))
const PULSE_MAX_RUNTIME_MS = 20_000
const ACTIVE_CONTEXT_LOOKBACK_MS = 2 * 60 * 60 * 1000

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

    // 1. Hitta staff med rimlig aktiv kontext:
    //    - aktiv active_time_registration (status='active')
    //    - eller färsk aktivitet senaste 2h där senaste ping är stale
    const activeContextSince = new Date(Date.now() - ACTIVE_CONTEXT_LOOKBACK_MS).toISOString()
    const [{ data: activeRegs }, { data: recentPings }] = await Promise.all([
      supabase
        .from('active_time_registrations')
        .select('staff_id')
        .eq('status', 'active')
        .is('stopped_at', null)
        .limit(PULSE_MAX_BATCH * 2),
      supabase
        .from('staff_location_history')
        .select('staff_id, recorded_at')
        .gte('recorded_at', activeContextSince)
        .order('recorded_at', { ascending: false })
        .limit(PULSE_MAX_BATCH * 4),
    ])

    const activeStaffIds = new Set<string>()
    for (const r of activeRegs ?? []) activeStaffIds.add(r.staff_id as string)
    for (const p of recentPings ?? []) activeStaffIds.add(p.staff_id as string)

    if (activeStaffIds.size === 0) {
      return new Response(JSON.stringify({ pulsed: 0, reason: 'no_active_context', duration_ms: Date.now() - startedAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Hämta tokens för dessa staff
    const { data: tokens, error: tokenErr } = await supabase
      .from('device_tokens')
      .select('id, staff_id, token, platform, organization_id')
      .in('staff_id', Array.from(activeStaffIds))
      .limit(PULSE_MAX_BATCH)
    if (tokenErr) throw new Error(`device_tokens fetch failed: ${tokenErr.message}`)
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ pulsed: 0, reason: 'no_tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Senaste ping per staff (för cutoff)
    const lastPingByStaff = new Map<string, string>()
    for (const row of recentPings ?? []) {
      if (!lastPingByStaff.has(row.staff_id as string)) {
        lastPingByStaff.set(row.staff_id as string, row.recorded_at as string)
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

    for (const c of candidates) {
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

    return new Response(JSON.stringify({
      pulsed: candidates.length,
      ok: okCount,
      failed: failCount,
      tokens: tokens.length,
      platform_ios: candidates.filter(c => (c.platform ?? '').toLowerCase() === 'ios').length,
      platform_android: candidates.filter(c => (c.platform ?? '').toLowerCase() === 'android').length,
      duration_ms: Date.now() - startedAt,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[gps-pulse] error:', err)
    return new Response(JSON.stringify({ error: (err as Error)?.message ?? String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
