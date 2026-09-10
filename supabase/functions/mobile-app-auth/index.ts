// @ts-nocheck
// Lightweight standalone login endpoint for the mobile app.
//
// Why this exists: `mobile-app-api/index.ts` is ~13k lines. Deno parses the
// whole module on every cold boot, which makes login feel like "the app
// hangs ~2 s before any feedback". Background GPS uploads from other phones
// keep poking that big function awake and recycling it, so the login path
// inherits cold starts constantly.
//
// This function ONLY does `login`. No GPS, no time reports, no chat. Cold
// start is in the 50–150 ms range. Everything else still goes to
// mobile-app-api, and mobile-app-api still handles `login` as a fallback
// so existing clients keep working during rollout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import {
  createScannerSignedToken,
  SCANNER_SIGNED_TOKEN_TTL_MS,
  scannerReleaseShaReady,
  scannerSigningSecretReady,
} from '../_shared/scannerSignedAuth.ts'
import {
  preflightsScannerContract,
  requestsScannerContract,
  scannerContractResponseHeaders,
  scannerCorsHeaders,
} from '../_shared/scannerCors.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Must match mobile-app-api token format exactly so tokens issued here
// validate cleanly there.
const TOKEN_EXPIRY_HOURS = 24 * 30

function generateToken(staffId: string, sessionId?: string): string {
  const timestamp = Date.now()
  const expiresAt = timestamp + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
  const payload: Record<string, unknown> = { staffId, timestamp, expiresAt }
  if (sessionId) payload.sessionId = sessionId
  return btoa(JSON.stringify(payload))
}

// Same Base64 scheme used by mobile-app-api.
function verifyPassword(inputPassword: string, storedHash: string): boolean {
  return btoa(inputPassword) === storedHash
}

async function enrichStaffWithRoles(supabase: any, staffMember: any) {
  let app_roles: string[] = []
  if (staffMember?.user_id) {
    const { data: rolesRows, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', staffMember.user_id)
    if (error) {
      console.error('[mobile-app-auth] user_roles lookup failed:', error)
    } else {
      app_roles = (rolesRows || []).map((r: any) => r.role).filter(Boolean)
    }
  }
  return {
    ...staffMember,
    app_roles,
    is_planner: app_roles.length > 0,
  }
}

function json(body: unknown, status = 200, responseHeaders = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, 'Content-Type': 'application/json' },
  })
}

async function handleLogin(
  supabase: any,
  data: { username?: string; password?: string; email?: string },
  responseHeaders: Record<string, string>,
  scannerSigningSecret: string | undefined,
  scannerReleaseSha: string | undefined,
) {
  const issueScannerCredential = scannerSigningSecret != null && scannerReleaseSha != null
  const password = data?.password
  const rawIdentifier = data?.email || data?.username
  if (!rawIdentifier || !password) {
    return json({ error: 'Email/username and password required' }, 400, responseHeaders)
  }

  const normalizedIdentifier = rawIdentifier.trim().toLowerCase()
  const isEmail = normalizedIdentifier.includes('@')
  let account: any = null
  let matchedEmailStaff = false

  if (isEmail) {
    const { data: staffByEmail, error: emailError } = await supabase
      .from('staff_members')
      .select('id')
      .ilike('email', normalizedIdentifier)
      .limit(1)
      .maybeSingle()

    if (emailError) {
      console.error('[mobile-app-auth] email lookup error:', emailError)
      return json({ error: 'Login failed' }, 500, responseHeaders)
    }
    matchedEmailStaff = !!staffByEmail

    if (staffByEmail) {
      const { data: acctByStaff, error: acctError } = await supabase
        .from('staff_accounts')
        .select('staff_id, username, password_hash')
        .eq('staff_id', staffByEmail.id)
        .limit(1)
        .maybeSingle()
      if (acctError) {
        console.error('[mobile-app-auth] account lookup error:', acctError)
        return json({ error: 'Login failed' }, 500, responseHeaders)
      }
      account = acctByStaff
    }

    if (!account) {
      const { data: acctByUsername, error: usernameFallbackError } = await supabase
        .from('staff_accounts')
        .select('staff_id, username, password_hash')
        .eq('username', normalizedIdentifier)
        .limit(1)
        .maybeSingle()
      if (usernameFallbackError) {
        console.error('[mobile-app-auth] username fallback error:', usernameFallbackError)
        return json({ error: 'Login failed' }, 500, responseHeaders)
      }
      account = acctByUsername
    }

    if (!account && matchedEmailStaff) {
      return json(
        { error: 'Kontot saknar inloggning för scanner-appen. Kontakta admin.' },
        403,
        responseHeaders,
      )
    }
  } else {
    const { data: acctByUsername, error: accountError } = await supabase
      .from('staff_accounts')
      .select('staff_id, username, password_hash')
      .eq('username', normalizedIdentifier)
      .limit(1)
      .maybeSingle()
    if (accountError) {
      console.error('[mobile-app-auth] login query error:', accountError)
      return json({ error: 'Login failed' }, 500, responseHeaders)
    }
    account = acctByUsername
  }

  if (!account) return json({ error: 'Invalid email or password' }, 401, responseHeaders)
  if (!verifyPassword(password, account.password_hash)) {
    return json({ error: 'Invalid username or password' }, 401, responseHeaders)
  }

  const { data: staffMember, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate, user_id, organization_id')
    .eq('id', account.staff_id)
    .single()
  if (staffError || !staffMember) {
    console.error('[mobile-app-auth] staff member lookup error:', staffError)
    return json({ error: 'Staff member not found' }, 404, responseHeaders)
  }

  const enriched = await enrichStaffWithRoles(supabase, staffMember)

  const sessionId = crypto.randomUUID()
  let scannerToken: string | undefined
  let scannerTokenExpiresAt: string | undefined
  if (issueScannerCredential) {
    if (!staffMember.organization_id) {
      return json({ error: 'Scanner organization is unavailable' }, 403, responseHeaders)
    }
    try {
      const scannerIssuedAt = Date.now()
      scannerToken = await createScannerSignedToken(
        {
          staffId: account.staff_id,
          organizationId: staffMember.organization_id,
          sessionId,
          releaseSha: scannerReleaseSha,
        },
        scannerSigningSecret,
        scannerIssuedAt,
      )
      scannerTokenExpiresAt = new Date(
        scannerIssuedAt + SCANNER_SIGNED_TOKEN_TTL_MS,
      ).toISOString()
    } catch (error) {
      console.error('[mobile-app-auth] signed scanner credential unavailable:', String(error))
      return json({ error: 'Scanner authentication unavailable' }, 503, responseHeaders)
    }
  }

  // Single-device-per-staff: rotera active_mobile_session_id först när en
  // efterfrågad Scanner-credential faktiskt har signerats. En konfigurations-
  // eller kryptofail får aldrig logga ut en fungerande enhet.
  const { error: sessionUpdateError } = await supabase
    .from('staff_members')
    .update({
      active_mobile_session_id: sessionId,
      active_mobile_session_at: new Date().toISOString(),
    })
    .eq('id', account.staff_id)
  if (sessionUpdateError) {
    console.error('[mobile-app-auth] kunde inte uppdatera active_mobile_session_id:', sessionUpdateError)
    return json({ error: 'Login failed (session)' }, 500, responseHeaders)
  }

  const token = generateToken(account.staff_id, sessionId)
  console.log(
    `[mobile-app-auth] login ok: ${staffMember.name} (planner=${enriched.is_planner}, sessionId=${sessionId})`,
  )
  // `token` behålls oförändrad för Planning-mobilen. Endast den fristående
  // Scannern använder den separata, kortlivade och signerade credentialen.
  return issueScannerCredential
    ? json(
        {
          success: true,
          token,
          scanner_token: scannerToken,
          scanner_token_expires_at: scannerTokenExpiresAt,
          staff: enriched,
        },
        200,
        responseHeaders,
      )
    : json({ success: true, token, staff: enriched }, 200, responseHeaders)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const scannerPreflight = preflightsScannerContract(req)
    const cors = scannerCorsHeaders(
      req.headers.get('Origin'),
      Deno.env.get('SCANNER_ALLOWED_ORIGINS'),
      !scannerPreflight,
    )
    return new Response(cors.allowed ? 'ok' : null, {
      status: cors.allowed ? 200 : 403,
      headers: cors.headers,
    })
  }
  const scannerRequest = requestsScannerContract(req)
  const cors = scannerCorsHeaders(
    req.headers.get('Origin'),
    Deno.env.get('SCANNER_ALLOWED_ORIGINS'),
    !scannerRequest,
  )
  if (!cors.allowed) {
    return json({ error: 'Scanner origin is not allowed' }, 403, cors.headers)
  }
  const scannerSigningSecret = scannerRequest
    ? Deno.env.get('SCANNER_TOKEN_SIGNING_SECRET')
    : undefined
  const scannerReleaseSha = scannerRequest
    ? Deno.env.get('SCANNER_RELEASE_SHA')
    : undefined
  const responseHeaders = scannerRequest
    ? scannerContractResponseHeaders(
        cors.headers,
        scannerReleaseShaReady(scannerReleaseSha) ? scannerReleaseSha : undefined,
      )
    : cors.headers
  if (
    scannerRequest &&
    (!scannerSigningSecretReady(scannerSigningSecret) ||
      !scannerReleaseShaReady(scannerReleaseSha))
  ) {
    console.error('[mobile-app-auth] signed scanner credential release is not configured')
    return json({ error: 'Scanner authentication unavailable' }, 503, responseHeaders)
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, responseHeaders)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, responseHeaders)
  }

  // Accept either `{ action: 'login', data: {...} }` (mobile-app-api shape)
  // or a bare `{ email, password }` payload. This keeps the endpoint a
  // drop-in replacement.
  const action = body?.action ?? 'login'
  if (action !== 'login') {
    return json({ error: 'Only login is supported on this endpoint' }, 400, responseHeaders)
  }
  const data = body?.data ?? body ?? {}
  try {
    return await handleLogin(
      supabase,
      data,
      responseHeaders,
      scannerSigningSecret,
      scannerReleaseSha,
    )
  } catch (err) {
    console.error('[mobile-app-auth] uncaught error:', err)
    return json({ error: 'Internal server error' }, 500, responseHeaders)
  }
})
