// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

import { processGpsTimelineForAutoStart } from '../_shared/time-engine/processGpsTimelineForAutoStart.ts'
import { evaluateAutoStopForActiveDay } from '../_shared/time-engine/evaluateAutoStopForActiveDay.ts'
import { isWarehouseTeam } from '../_shared/warehouseTeam.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // Allow the mobile client to read the rotated-token header from CORS responses.
  'Access-Control-Expose-Headers': 'X-New-Token',
}

// Simple token generation using HMAC-like approach
const TOKEN_SECRET = Deno.env.get('STAFF_SECRET_KEY') || 'default-secret-key'
// Sliding 30-day session. Tokens older than REFRESH_THRESHOLD_HOURS get
// transparently rotated via the X-New-Token response header so users never
// hit a hard logout while they keep using the app.
const TOKEN_EXPIRY_HOURS = 24 * 30
const REFRESH_THRESHOLD_HOURS = 24 * 7

function generateToken(staffId: string): string {
  const timestamp = Date.now()
  const expiresAt = timestamp + (TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  const payload = { staffId, timestamp, expiresAt }
  return btoa(JSON.stringify(payload))
}

function verifyToken(token: string): { valid: boolean; staffId?: string; issuedAt?: number; expiresAt?: number; error?: string } {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) {
      return { valid: false, error: 'Invalid token format' }
    }
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Token expired' }
    }
    return {
      valid: true,
      staffId: payload.staffId,
      issuedAt: typeof payload.timestamp === 'number' ? payload.timestamp : undefined,
      expiresAt: payload.expiresAt,
    }
  } catch {
    return { valid: false, error: 'Invalid token' }
  }
}

async function resolveJwtUserId(
  verifier: ReturnType<typeof createClient>,
  jwt: string,
): Promise<string | null> {
  const authApi = verifier.auth as typeof verifier.auth & {
    getClaims?: (token?: string) => Promise<{ data: { claims?: { sub?: string } } | null; error: { message?: string } | null }>;
  };

  if (typeof authApi.getClaims === 'function') {
    const { data: claimsData, error: claimsErr } = await authApi.getClaims(jwt)
    if (claimsErr) return null
    return claimsData?.claims?.sub ?? null
  }

  const { data: userData, error: userErr } = await verifier.auth.getUser(jwt)
  if (userErr) return null
  return userData.user?.id ?? null
}

/**
 * Decide whether a verified token should be rotated. We rotate when:
 *  - the token is older than REFRESH_THRESHOLD_HOURS since issuance, OR
 *  - the token has less than REFRESH_THRESHOLD_HOURS left until expiry.
 * Returns the new token to send back via X-New-Token, or null to keep current.
 */
function maybeRotateToken(staffId: string, issuedAt?: number, expiresAt?: number): string | null {
  const now = Date.now()
  const refreshMs = REFRESH_THRESHOLD_HOURS * 60 * 60 * 1000
  const ageOk = typeof issuedAt === 'number' && (now - issuedAt) >= refreshMs
  const closeToExpiry = typeof expiresAt === 'number' && (expiresAt - now) <= refreshMs
  if (!ageOk && !closeToExpiry) return null
  const fresh = generateToken(staffId)
  console.log(`[mobile-app-api] 🔄 rotating token for staff=${staffId} (ageOk=${ageOk}, closeToExpiry=${closeToExpiry})`)
  return fresh
}

// Simple Base64 password comparison (matching existing staff_accounts format)
function verifyPassword(inputPassword: string, storedHash: string): boolean {
  const inputHash = btoa(inputPassword)
  return inputHash === storedHash
}

// ============================================================================
// UNIFIED TIME-INTERVAL HELPERS (used by create + update of time_reports)
// ----------------------------------------------------------------------------
// All shifts are modeled as real [start, end) datetime intervals in UTC ms.
// Night shifts (end <= start as HH:MM) are interpreted as crossing midnight
// (end belongs to report_date + 1). Two intervals overlap iff
//   aStart < bEnd && bStart < aEnd
// This is symmetric and correctly handles shifts that span midnight, and
// reports stored on different report_dates that bleed into the same day.
// ============================================================================

/** Parse "HH:MM" (or "HH:MM:SS") to total minutes since 00:00. Null if invalid. */
function parseHHMMtoMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null
  const m = t.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

/**
 * Build a UTC interval [startMs, endMs) for a time_report.
 * - reportDate: 'YYYY-MM-DD'
 * - startTime / endTime: 'HH:MM' (with optional :SS)
 * - If endMinutes <= startMinutes the shift is treated as crossing midnight,
 *   i.e. end is on reportDate + 1 day.
 * Returns null when either time is missing/invalid.
 */
function buildShiftInterval(
  reportDate: string,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): { startMs: number; endMs: number } | null {
  if (!reportDate || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return null
  const sMin = parseHHMMtoMinutes(startTime)
  const eMin = parseHHMMtoMinutes(endTime)
  if (sMin === null || eMin === null) return null

  // Use UTC base to avoid timezone drift (we compare ms, not wall-clock dates).
  const baseMs = Date.parse(`${reportDate}T00:00:00Z`)
  if (!Number.isFinite(baseMs)) return null

  const startMs = baseMs + sMin * 60_000
  let endMs = baseMs + eMin * 60_000
  // Night shift: end <= start means it rolls into the next day.
  if (endMs <= startMs) endMs += 24 * 60 * 60_000
  return { startMs, endMs }
}

function deriveBookingPhaseForDate(booking: any, assignmentDate: string): 'rig' | 'event' | 'rigdown' | 'other' {
  if (booking?.rigdaydate === assignmentDate) return 'rig'
  if (booking?.eventdate === assignmentDate) return 'event'
  if (booking?.rigdowndate === assignmentDate) return 'rigdown'
  return 'other'
}

function getBookingShiftWindowForDate(booking: any, assignmentDate: string): { start: string | null; end: string | null; eventType: 'rig' | 'event' | 'rigdown' | 'other' } {
  const eventType = deriveBookingPhaseForDate(booking, assignmentDate)
  if (eventType === 'rig') {
    return { start: booking?.rig_start_time ?? null, end: booking?.rig_end_time ?? null, eventType }
  }
  if (eventType === 'event') {
    return { start: booking?.event_start_time ?? null, end: booking?.event_end_time ?? null, eventType }
  }
  if (eventType === 'rigdown') {
    return { start: booking?.rigdown_start_time ?? null, end: booking?.rigdown_end_time ?? null, eventType }
  }
  // Assignment date doesn't match any explicit booking phase. This is common
  // for multi-day rigs where staff is scheduled on intermediate days that
  // aren't stored as separate phases. Fall back to the nearest known phase's
  // times so the day still shows up as a shift in the mobile calendar.
  const phaseTimes = [
    { date: booking?.rigdaydate, start: booking?.rig_start_time, end: booking?.rig_end_time, type: 'rig' as const },
    { date: booking?.eventdate, start: booking?.event_start_time, end: booking?.event_end_time, type: 'event' as const },
    { date: booking?.rigdowndate, start: booking?.rigdown_start_time, end: booking?.rigdown_end_time, type: 'rigdown' as const },
  ].filter(p => p.date)

  if (phaseTimes.length > 0) {
    const dayMs = (s: string) => Date.parse(`${s}T00:00:00Z`) || 0
    const target = dayMs(assignmentDate)
    const nearest = phaseTimes
      .map(p => ({ ...p, distance: Math.abs(dayMs(p.date) - target) }))
      .sort((a, b) => a.distance - b.distance)[0]
    return { start: nearest.start ?? null, end: nearest.end ?? null, eventType: nearest.type }
  }

  return { start: null, end: null, eventType }
}

/** True iff [a) and [b) intervals overlap (touching endpoints are OK). */
function intervalsOverlap(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs
}

/**
 * Build a safe push-notification preview body for chat messages.
 * - Never throws on null/undefined inputs.
 * - Prefers trimmed text content; falls back to attachment label.
 * - Caps length so notification payloads stay within OS limits.
 */
function buildMessagePreview(
  content: unknown,
  fileName?: string | null,
  fileType?: string | null,
  maxLen = 120,
): string {
  const text = typeof content === 'string' ? content.trim() : ''
  if (text.length > 0) {
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text
  }

  // Attachment-only message
  const safeName = typeof fileName === 'string' ? fileName.trim() : ''
  const mime = typeof fileType === 'string' ? fileType.toLowerCase() : ''
  let label = '📎 Skickade en bilaga'
  if (mime.startsWith('image/')) label = '📷 Skickade en bild'
  else if (mime.startsWith('video/')) label = '🎬 Skickade en video'
  else if (mime.startsWith('audio/')) label = '🎤 Skickade en ljudfil'
  else if (mime === 'application/pdf') label = '📄 Skickade ett PDF'

  if (safeName) {
    const combined = `${label}: ${safeName}`
    return combined.length > maxLen ? combined.slice(0, maxLen - 1) + '…' : combined
  }
  return label
}

async function resolveOrganizationId(supabase: any, explicitOrgId?: string): Promise<string> {
  if (explicitOrgId) {
    const { data } = await supabase.from('organizations').select('id').eq('id', explicitOrgId).single()
    if (!data) throw new Error(`Organization not found: ${explicitOrgId}`)
    return data.id
  }
  console.warn('[mobile-app-api] DEPRECATION WARNING: organization_id not provided, falling back to first org.')
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single()
  return data?.id
}

/**
 * ensureOpenWorkdayForTimer — workday-first guarantee for ALL server-side
 * flows that create activity rows (location_time_entries / time_reports /
 * GPS auto-entries / accept_unplanned_site_visit / assistant start).
 *
 * Rule: aktiv timer/time_report får ALDRIG existera utan workday.
 *  - If an open workday exists for (staff, org) → return it.
 *  - Otherwise insert a new workdays row with started_at = start_at and
 *    metadata describing source + matched target.
 *  - If insert fails → throw, so the caller aborts BEFORE creating the
 *    activity row.
 *
 * Skipped (returns null) when staff_id is not a real staff_members row
 * (web-JWT planner fallback / admin paths) so admin tooling keeps working.
 *
 * ALL timer/LTE/time_report start flows MUST call this helper instead of
 * duplicating workday-creation logic.
 */
type EnsureWorkdayArgs = {
  staff_id: string | undefined
  organization_id: string
  start_at?: string
  source: string // e.g. 'create_time_report' | 'geofence_enter' | 'start_location_timer' | 'accept_unplanned_site_visit' | 'assistant_start_activity'
  target?: { kind: string; id?: string | null; name?: string | null } | null
}

async function ensureOpenWorkdayForTimer(
  supabase: any,
  args: EnsureWorkdayArgs,
): Promise<{ id: string; started_at: string; created: boolean } | null> {
  const { staff_id: staffId, organization_id: organizationId, start_at, source, target } = args
  if (!staffId || !organizationId) return null

  // Guard: only run for real staff rows.
  const { data: staffRow } = await supabase
    .from('staff_members')
    .select('id')
    .eq('id', staffId)
    .maybeSingle()
  if (!staffRow) return null

  // ── Night auto-start guard (00:00–05:00 lokal tid Europe/Stockholm) ──
  // Workday får ALDRIG auto-skapas nattetid utan aktiv user-startad timer.
  // User-driven källor (manuell timer-start, manuell time_report-skapande)
  // är undantagna — det är inte "auto-start", det är användarintention.
  const USER_DRIVEN_SOURCES = new Set([
    'start_location_timer',
    'create_time_report',
    'manual_start_workday',
    'admin_create_time_report',
  ])
  if (!USER_DRIVEN_SOURCES.has(source)) {
    try {
      const nowForGuard = start_at && !isNaN(new Date(start_at).getTime())
        ? new Date(start_at) : new Date()
      const localHour = Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false,
        }).formatToParts(nowForGuard)
          .find((p) => p.type === 'hour')?.value ?? '0',
      )
      if (localHour >= 0 && localHour < 5) {
        // New Time Engine source of truth: active_time_registrations.
        // User-driven start_source values are treated as user timers.
        const { data: activeUserTimer } = await supabase
          .from('active_time_registrations')
          .select('id, start_source, auto_started').eq('staff_id', staffId)
          .eq('status', 'active')
          .eq('auto_started', false)
          .limit(1).maybeSingle()
        if (!activeUserTimer) {
          console.log(
            `[ensureOpenWorkdayForTimer] BLOCKED night auto-start (source=${source}): blocked_night_auto_start_no_active_timer`,
          )
          throw new Error('blocked_night_auto_start_no_active_timer')
        }
      }
    } catch (guardErr: any) {
      if (guardErr?.message === 'blocked_night_auto_start_no_active_timer') throw guardErr
      console.warn('[ensureOpenWorkdayForTimer] night-guard error (non-fatal):', guardErr)
    }
  }

  // Existing open workday? Must be from the SAME UTC date as the requested
  // start_at — otherwise the new timer would be parented to a stale workday
  // from a previous day (orphan that was never closed) and per-date readers
  // ("Saknar arbetsdag" på Tidrapport) would never see a workday for today.
  const targetStartIso =
    start_at && !isNaN(new Date(start_at).getTime())
      ? new Date(start_at).toISOString()
      : new Date().toISOString()
  const targetDate = targetStartIso.slice(0, 10)

  const { data: openRows, error: openErr } = await supabase
    .from('workdays')
    .select('id, started_at, ended_at')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(5)
  if (openErr) {
    console.warn('[ensureOpenWorkdayForTimer] lookup failed:', openErr)
  }

  const sameDayOpen = (openRows || []).find(r => String(r.started_at).slice(0, 10) === targetDate)
  if (sameDayOpen) {
    return { id: sameDayOpen.id, started_at: sameDayOpen.started_at, created: false }
  }

  // Auto-close any orphan open workdays from previous days so they don't
  // keep blocking workday-first for future days, and so the stale-cron's
  // job is taken care of inline. Cap ended_at = started_at + 10h.
  const orphans = (openRows || []).filter(r => String(r.started_at).slice(0, 10) !== targetDate)
  for (const orphan of orphans) {
    const startedMs = new Date(orphan.started_at).getTime()
    const cap = new Date(startedMs + 10 * 60 * 60 * 1000).toISOString()
    const { error: closeErr } = await supabase
      .from('workdays')
      .update({
        ended_at: cap,
        ended_by: 'system_workday_first_orphan_cleanup',
        review_status: 'needs_review',
        notes: `[auto-closed: orphan blocking workday-first for ${targetDate}]`,
      })
      .eq('id', orphan.id)
      .is('ended_at', null)
    if (closeErr) {
      console.warn('[ensureOpenWorkdayForTimer] orphan close failed:', closeErr)
    } else {
      console.log(
        `[ensureOpenWorkdayForTimer] auto-closed orphan workday ${orphan.id} (started ${orphan.started_at}) blocking ${targetDate}`,
      )
    }
  }

  const { data: ins, error: insErr } = await supabase
    .from('workdays')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      started_at: targetStartIso,
      started_by: 'server_workday_first',
      notes: `Auto-skapad av server (workday-first guarantee, source=${source})`,
      metadata: {
        auto_started: true,
        auto_start_source: source,
        matched_target: target ?? null,
        reason: 'timer_start_requires_workday',
        guarantee: 'no_timer_without_workday',
      },
    })
    .select('id, started_at')
    .single()
  if (insErr) {
    console.error('[ensureOpenWorkdayForTimer] insert failed:', insErr)
    throw new Error(`workday_first_failed: ${insErr.message}`)
  }
  console.log(
    `[ensureOpenWorkdayForTimer] auto-started workday ${ins.id} for staff=${staffId} at ${ins.started_at} (source=${source})`,
  )
  return { ...ins, created: true }
}

// Back-compat shim — existing callers using positional args.
async function ensureOpenWorkday(
  supabase: any,
  staffId: string | undefined,
  organizationId: string,
  startedAtIso?: string,
  source: string = 'ensure_open_workday',
  target: EnsureWorkdayArgs['target'] = null,
): Promise<{ id: string; started_at: string; created: boolean } | null> {
  return ensureOpenWorkdayForTimer(supabase, {
    staff_id: staffId,
    organization_id: organizationId,
    start_at: startedAtIso,
    source,
    target,
  })
}

async function handleRequest(req: Request, rotationSlot: { token: string | null }): Promise<Response> {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { action, token, data, ...legacyFields } = body

    // Normalize: support both nested { data: {...} } and flat { email, password, ... } payloads
    const requestData = data ?? (Object.keys(legacyFields).length > 0 ? legacyFields : undefined)

    const safeKeys = Object.keys(body).filter(k => k !== 'password' && k !== 'token')
    console.log(`[mobile-app-api] incoming action=${action}, hasToken=${!!token}, hasData=${!!data}, hasLegacy=${!data && !!requestData}, keys=[${safeKeys.join(',')}]`)

    // Actions that don't require authentication
    if (action === 'login') {
      return await handleLogin(supabase, requestData ?? {})
    }

    // Auth: prefer custom mobile token; fall back to web Authorization: Bearer <JWT>
    let staffId: string | undefined
    let staffOrg: { organization_id: string | null; user_id: string | null } | null = null

    if (token) {
      const tokenResult = verifyToken(token)
      if (!tokenResult.valid) {
        return new Response(
          JSON.stringify({ error: tokenResult.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      staffId = tokenResult.staffId!
      // Sliding refresh: if the token is older than the threshold (or close
      // to expiry), mint a new one and surface it via X-New-Token. The
      // client updates localStorage transparently — no UI interruption.
      rotationSlot.token = maybeRotateToken(staffId, tokenResult.issuedAt, tokenResult.expiresAt)
    } else {
      // Web JWT fallback (planner UI)
      const authHeader = req.headers.get('Authorization') || ''
      if (!authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const jwt = authHeader.slice('Bearer '.length)
      // Use anon client just to verify the JWT
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      const verifier = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const webUserId = await resolveJwtUserId(verifier, jwt)
      if (!webUserId) {
        return new Response(
          JSON.stringify({ error: 'Invalid web session' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Try to map to a staff_member row; if none, use user_id as the staffId-equivalent
      const { data: sm } = await supabase
        .from('staff_members')
        .select('id, organization_id, user_id')
        .eq('user_id', webUserId)
        .maybeSingle()
      if (sm) {
        staffId = sm.id
        staffOrg = { organization_id: sm.organization_id, user_id: sm.user_id }
      } else {
        // Web-only planner without staff_members row → resolve org from profiles
        const { data: prof } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('user_id', webUserId)
          .maybeSingle()
        staffId = webUserId
        staffOrg = { organization_id: prof?.organization_id || null, user_id: webUserId }
      }
    }

    // Resolve organization_id from the authenticated staff member (if not already set via JWT path)
    if (!staffOrg) {
      const { data: smOrg } = await supabase
        .from('staff_members')
        .select('organization_id, user_id')
        .eq('id', staffId)
        .single()
      staffOrg = smOrg ? { organization_id: smOrg.organization_id, user_id: smOrg.user_id } : null
    }

    const organizationId = staffOrg?.organization_id
    if (!organizationId) {
      console.error(`[mobile-app-api] Staff/user ${staffId} has no organization_id`)
      return new Response(
        JSON.stringify({ error: 'Not associated with an organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[mobile-app-api] Auth resolved staffId=${staffId} org=${organizationId}`)

    // Route to appropriate handler - all receive organizationId for tenant isolation
    switch (action) {
      case 'me':
        return await handleMe(supabase, staffId, organizationId)
      case 'get_bookings':
        return await handleGetBookings(supabase, staffId, organizationId)
      case 'get_inbox_all':
        return await handleGetInboxAll(supabase, staffId, organizationId, staffOrg?.user_id || null)
      case 'get_inbox_jobs':
        return await handleGetInboxJobs(supabase, staffId, organizationId)
      case 'get_booking_details':
        return await handleGetBookingDetails(supabase, staffId, data, organizationId)
      case 'get_time_reports':
        return await handleGetTimeReports(supabase, staffId, organizationId)
      case 'create_time_report':
        return await handleCreateTimeReport(supabase, staffId, data, organizationId)
      case 'update_time_report':
        return await handleUpdateTimeReport(supabase, staffId, data, organizationId)
      case 'delete_time_report':
        return await handleDeleteTimeReport(supabase, staffId, data, organizationId)
      case 'admin_create_time_report':
        return await handleAdminCreateTimeReport(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_delete_time_report':
        return await handleAdminDeleteTimeReport(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_update_time_report':
        return await handleAdminUpdateTimeReport(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_close_open_entry':
        return await handleAdminCloseOpenEntry(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'get_project':
        return await handleGetProject(supabase, data, organizationId)
      case 'get_project_comments':
        return await handleGetProjectComments(supabase, data, organizationId)
      case 'get_project_files':
        return await handleGetProjectFiles(supabase, data, organizationId)
      case 'get_project_purchases':
        return await handleGetProjectPurchases(supabase, data, organizationId)
      case 'create_purchase':
        return await handleCreatePurchase(supabase, staffId, data, organizationId)
      case 'create_comment':
        return await handleCreateComment(supabase, staffId, data, organizationId)
      case 'upload_file':
        return await handleUploadFile(supabase, staffId, data, organizationId)
      case 'send_message':
        return await handleSendMessage(supabase, staffId, data, organizationId)
      case 'get_contacts':
        return await handleGetContacts(supabase, staffId, organizationId)
      case 'get_direct_messages':
        return await handleGetDirectMessages(supabase, staffId, organizationId, staffOrg?.user_id || null)
      case 'send_direct_message':
        return await handleSendDirectMessage(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'get_dm_thread':
        return await handleGetDMThread(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'mark_dm_read':
        return await handleMarkDMRead(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'get_job_messages':
        return await handleGetJobMessages(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'send_job_message':
        return await handleSendJobMessage(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'mark_job_read':
        return await handleMarkJobRead(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'archive_job_conversation':
        return await handleArchiveJobConversation(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'unarchive_job_conversation':
        return await handleUnarchiveJobConversation(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'archive_dm':
        return await handleArchiveDM(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'unarchive_dm':
        return await handleUnarchiveDM(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      // ── Centralized chat reads (PROMPT 1) ──
      case 'get_dm_thread':
        return await handleGetDMThread(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'get_dm_inbox_grouped':
        return await handleGetDMInboxGrouped(supabase, staffId, organizationId, staffOrg?.user_id || null)
      case 'get_unread_dm_count':
        return await handleGetUnreadDMCount(supabase, staffId, organizationId, staffOrg?.user_id || null)
      case 'get_job_participants':
        return await handleGetJobParticipants(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'get_recent_broadcasts':
        return await handleGetRecentBroadcasts(supabase, organizationId)
      case 'get_messaging_activity':
        return await handleGetMessagingActivity(supabase, organizationId, data)
      case 'send_broadcast':
        return await handleSendBroadcast(supabase, staffId, data, organizationId)
      case 'upload_chat_attachment':
        return await handleUploadChatAttachment(supabase, staffId, data, organizationId)
      case 'get_broadcasts':
        return await handleGetBroadcasts(supabase, staffId, organizationId)
      case 'mark_broadcast_read':
        return await handleMarkBroadcastRead(supabase, staffId, data, organizationId)
      case 'register_push_token': {
        console.log(`[mobile-app-api] [router] entering register_push_token for staff=${staffId}, org=${organizationId}`)
        const registerResponse = await handleRegisterPushToken(supabase, staffId, data, organizationId)
        console.log(`[mobile-app-api] [router] register_push_token completed with status=${registerResponse.status}`)
        return registerResponse
      }
      case 'unregister_push_token':
        return await handleUnregisterPushToken(supabase, staffId, data, organizationId)
      case 'report_location':
        return await handleReportLocation(supabase, staffId, data, organizationId)
      case 'upload_location_batch':
        return await handleUploadLocationBatch(supabase, staffId, data, organizationId)
      case 'create_travel_log':
        return await handleStartTravelLog(supabase, staffId, data, organizationId)
      case 'stop_travel_log':
        return await handleStopTravelLog(supabase, staffId, data, organizationId)
      case 'update_travel_log':
        return await handleUpdateTravelLog(supabase, staffId, data, organizationId)
      case 'classify_travel_log':
        return await handleClassifyTravelLog(supabase, staffId, data, organizationId)
      case 'get_travel_logs':
        return await handleGetTravelLogs(supabase, staffId, data, organizationId)
      case 'create_travel_from_gap':
        return await handleCreateTravelFromGap(supabase, staffId, data, organizationId)
      // ── workday_flags (PROMPT 6 — anomaly model v2) ──
      case 'create_workday_flag':
        return await handleCreateWorkdayFlag(supabase, staffId, data, organizationId)
      case 'list_workday_flags':
        return await handleListWorkdayFlags(supabase, staffId, data, organizationId)
      case 'list_workdays_review':
        return await handleListWorkdaysReview(supabase, staffId, data, organizationId)
      case 'resolve_workday_flag':
        return await handleResolveWorkdayFlag(supabase, staffId, data, organizationId)
      // ── Admin day-review actions ──
      case 'admin_set_workday_review':
        return await handleAdminSetWorkdayReview(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_mark_gap_break':
        return await handleAdminMarkGapBreak(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_mark_gap_travel':
        return await handleAdminMarkGapTravel(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_approve_day':
        return await handleAdminApproveDay(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_unapprove_day':
        return await handleAdminUnapproveDay(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_create_workday_from_planned':
        return await handleAdminCreateWorkdayFromPlanned(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'admin_repair_workday_from_evidence':
        return await handleAdminRepairWorkdayFromEvidence(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'auto_repair_missing_workdays_from_evidence':
        return await handleAutoRepairMissingWorkdaysFromEvidence(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'toggle_establishment_task':
        return await handleToggleEstablishmentTask(supabase, staffId, data, organizationId)
      case 'get_organization_locations':
        return await handleGetOrganizationLocations(supabase, organizationId)
      // ── Time Engine v2 (active_time_registrations only) ─────────────
      case 'start_time_registration':
        return await handleStartTimeRegistration(supabase, staffId, data, organizationId)
      case 'stop_time_registration':
        return await handleStopTimeRegistration(supabase, staffId, data, organizationId)
      // ── LEGACY action names — now FORWARDED to Time Engine v2.
      // The legacy LTE/workday/time_report writers are NOT invoked from these
      // case branches anymore. Frontend may still call these names, but they
      // resolve to active_time_registrations only. See handleLegacy*Forward.
      case 'start_location_timer':
        return await handleLegacyStartLocationTimerForward(supabase, staffId, data, organizationId)
      case 'stop_location_timer':
        return await handleLegacyStopLocationTimerForward(supabase, staffId, data, organizationId)
      case 'stop_open_entry':
        // LEGACY admin/banner action — operates on legacy LTE rows only.
        // MUST NOT be used as a timer-control action from the new Time app.
        console.warn('[mobile-app-api] LEGACY stop_open_entry invoked — Time app should use stop_time_registration instead')
        return await handleStopOpenEntryLegacyOnly(supabase, staffId, data, organizationId)
      case 'dismiss_location_entry':
        console.warn('[mobile-app-api] LEGACY dismiss_location_entry invoked — Time app should not use this')
        return await handleDismissLocationEntry(supabase, staffId, data, organizationId)
      case 'get_location_time_entries':
        console.warn('[mobile-app-api] LEGACY get_location_time_entries invoked — Time app must read from active_time_registrations / get-timer-time-segments instead')
        return await handleGetLocationTimeEntriesLegacyOnly(supabase, staffId, data, organizationId)
      case 'get_active_day_state':
        console.warn('[mobile-app-api] LEGACY get_active_day_state invoked — Time app must use get-current-time-registration / get-active-time-registration-status instead')
        return await handleGetActiveDayStateLegacyOnly(supabase, staffId, organizationId)
      case 'get_lager_tasks':
        return await handleGetLagerTasks(supabase, staffId, organizationId)
      case 'get_lager_assignments':
        return await handleGetLagerAssignments(supabase, staffId, data, organizationId)
      case 'create_lager_task':
        return await handleCreateLagerTask(supabase, staffId, data, organizationId)
      case 'complete_lager_task':
        return await handleCompleteLagerTask(supabase, data, organizationId)
      case 'claim_lager_task':
        return await handleClaimLagerTask(supabase, staffId, data, organizationId)
      case 'get_lager_team':
        return await handleGetLagerTeam(supabase, organizationId)
      case 'get_lager_purchases':
        return await handleGetLagerPurchases(supabase, organizationId)
      case 'create_lager_purchase':
        return await handleCreateLagerPurchase(supabase, staffId, data, organizationId)
      case 'get_lager_files':
        return await handleGetLagerFiles(supabase, organizationId)
      case 'upload_lager_file':
        return await handleUploadLagerFile(supabase, staffId, data, organizationId)
      case 'start_anomaly':
        return await handleStartAnomaly(supabase, staffId, data, organizationId)
      case 'stop_anomaly':
        return await handleStopAnomaly(supabase, staffId, data, organizationId)
      case 'list_pending_anomalies':
        return await handleListPendingAnomalies(supabase, staffId, organizationId)
      case 'classify_anomaly':
        return await handleClassifyAnomaly(supabase, staffId, data, organizationId)
      case 'close_open_anomalies':
        return await handleCloseOpenAnomalies(supabase, staffId, data, organizationId)
      case 'get_last_workplace_exit':
        return await handleGetLastWorkplaceExit(supabase, staffId, organizationId)
      case 'create_end_of_day_anomaly':
        return await handleCreateEndOfDayAnomaly(supabase, staffId, data, organizationId)
      case 'get_position_at_time':
        return await handleGetPositionAtTime(supabase, staffId, data, organizationId)
      case 'get_movement_for_day':
        return await handleGetMovementForDay(supabase, staffId, data, organizationId)
      case 'get_staff_day_reality':
        return await handleGetStaffDayReality(supabase, staffId, data, organizationId)
      case 'get_arrival_state':
        return await handleGetArrivalState(supabase, staffId, organizationId)
      case 'mark_arrival_resolved':
        return await handleMarkArrivalResolved(supabase, staffId, data, organizationId)
      case 'report_arrival':
        return await handleReportArrival(supabase, staffId, data, organizationId)
      case 'report_departure':
        return await handleReportDeparture(supabase, staffId, data, organizationId)
      case 'report_home_arrival':
        return await handleReportHomeArrival(supabase, staffId, data, organizationId)
      // ── Smart-karta (arrival context) ──
      case 'accept_unplanned_site_visit':
        return await handleAcceptUnplannedSiteVisit(supabase, staffId, data, organizationId)
      case 'end_unplanned_site_visit':
        return await handleEndUnplannedSiteVisit(supabase, staffId, data, organizationId)
      case 'register_break_from_travel':
        return await handleRegisterBreakFromTravel(supabase, staffId, data, organizationId)
      case 'link_purchase_intent_to_project':
        return await handleLinkPurchaseIntent(supabase, staffId, data, organizationId)
      case 'reject_arrival_suggestion':
        return await handleRejectArrivalSuggestion(supabase, staffId, data, organizationId)
      case 'record_auto_start_decline':
        return await handleRecordAutoStartDecline(supabase, staffId, data, organizationId)
      case 'correct_stale_day_end':
        return await handleCorrectStaleDayEnd(supabase, staffId, data, organizationId)
      // ── Planner overview (gated on user_roles row presence) ──
      case 'get_overview_calendar':
        return await handleGetOverviewCalendar(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'get_overview_assignments':
        return await handleGetOverviewAssignments(supabase, staffOrg?.user_id || null, data, organizationId)
      case 'get_overview_threads':
        return await handleGetOverviewThreads(supabase, staffOrg?.user_id || null, organizationId)
      case 'get_ops_overview':
        return await handleGetOpsOverview(supabase, staffOrg?.user_id || null, data, organizationId)
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Mobile API error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

Deno.serve(async (req) => {
  // Per-request rotation slot — local to this Deno.serve invocation, so no
  // cross-request bleed between concurrent users.
  const rotationSlot: { token: string | null } = { token: null }
  const response = await handleRequest(req, rotationSlot)
  if (rotationSlot.token) {
    // Clone with the rotated-token header appended. Body is consumed once.
    const newHeaders = new Headers(response.headers)
    newHeaders.set('X-New-Token', rotationSlot.token)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })
  }
  return response
})

// ==================== HANDLERS ====================

async function handleLogin(supabase: any, data: { username?: string; password?: string; email?: string }) {
  const password = data?.password
  const rawIdentifier = data?.email || data?.username

  if (!rawIdentifier || !password) {
    return new Response(
      JSON.stringify({ error: 'Email/username and password required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const normalizedIdentifier = rawIdentifier.trim().toLowerCase()
  let account: any = null
  let matchedEmailStaff = false

  // Check if identifier looks like an email
  const isEmail = normalizedIdentifier.includes('@')

  if (isEmail) {
    // Case-insensitive email lookup (handles mixed-case emails in DB)
    const { data: staffByEmail, error: emailError } = await supabase
      .from('staff_members')
      .select('id')
      .ilike('email', normalizedIdentifier)
      .limit(1)
      .maybeSingle()

    if (emailError) {
      console.error('Email lookup error:', emailError)
      return new Response(
        JSON.stringify({ error: 'Login failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
        console.error('Account lookup error:', acctError)
        return new Response(
          JSON.stringify({ error: 'Login failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      account = acctByStaff
    }

    // Fallback: allow username even if sent from the email field
    if (!account) {
      const { data: acctByUsername, error: usernameFallbackError } = await supabase
        .from('staff_accounts')
        .select('staff_id, username, password_hash')
        .eq('username', normalizedIdentifier)
        .limit(1)
        .maybeSingle()

      if (usernameFallbackError) {
        console.error('Username fallback lookup error:', usernameFallbackError)
        return new Response(
          JSON.stringify({ error: 'Login failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      account = acctByUsername
    }

    if (!account && matchedEmailStaff) {
      return new Response(
        JSON.stringify({ error: 'Kontot saknar inloggning för scanner-appen. Kontakta admin.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } else {
    // Legacy username-based lookup
    const { data: acctByUsername, error: accountError } = await supabase
      .from('staff_accounts')
      .select('staff_id, username, password_hash')
      .eq('username', normalizedIdentifier)
      .limit(1)
      .maybeSingle()

    if (accountError) {
      console.error('Login query error:', accountError)
      return new Response(
        JSON.stringify({ error: 'Login failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    account = acctByUsername
  }

  if (!account) {
    return new Response(
      JSON.stringify({ error: 'Invalid email or password' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verify password
  if (!verifyPassword(password, account.password_hash)) {
    return new Response(
      JSON.stringify({ error: 'Invalid username or password' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff member info (incl. user_id so we can resolve app_roles)
  const { data: staffMember, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate, user_id')
    .eq('id', account.staff_id)
    .single()

  if (staffError || !staffMember) {
    console.error('Staff member lookup error:', staffError)
    return new Response(
      JSON.stringify({ error: 'Staff member not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Resolve app_roles + is_planner. Anyone with at least one row in
  // user_roles is a "system user" (web login = planner).
  const enriched = await enrichStaffWithRoles(supabase, staffMember)

  // Generate token
  const token = generateToken(account.staff_id)

  console.log(`Login successful for: ${staffMember.name} (planner=${enriched.is_planner})`)

  return new Response(
    JSON.stringify({
      success: true,
      token,
      staff: enriched
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─────────────────────────────────────────────────────────────────────
// enrichStaffWithRoles
//
// Single source of truth for the "is this user a planner" rule.
// A user is a planner iff they have at least one row in user_roles —
// which matches "can log in to the web". Used by both `login` and `me`
// so the mobile client always sees consistent role data.
// ─────────────────────────────────────────────────────────────────────
async function enrichStaffWithRoles(supabase: any, staffMember: any) {
  let app_roles: string[] = []
  if (staffMember?.user_id) {
    const { data: rolesRows, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', staffMember.user_id)
    if (error) {
      console.error('[enrichStaffWithRoles] user_roles lookup failed:', error)
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

async function handleMe(supabase: any, staffId: string, organizationId: string) {
  const { data: staffMember, error } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate, user_id')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !staffMember) {
    return new Response(
      JSON.stringify({ error: 'Staff member not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const enriched = await enrichStaffWithRoles(supabase, staffMember)

  return new Response(
    JSON.stringify({ staff: enriched }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetBookings(supabase: any, staffId: string, organizationId: string) {
  // ─── VISIBILITY RULE ───────────────────────────────────────────────
  // Two sources of visibility:
  //   1. booking_staff_assignments (BSA) → scheduled work
  // ──────────────────────────────────────────────────────────────────
  // Visibility rule (date-driven):
  //   - Only REAL team assignments (team_id not in 'project','location') count as "scheduled"
  //   - If a user is scheduled on a project booking on date X,
  //     they see ALL bookings in that project whose dates include X
  //   - Project membership alone does NOT grant visibility
  // ──────────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  // Mobilkalendern visar både historik och framtid. Vi tittar 60 dagar bakåt
  // så att personal kan bläddra i tidigare veckor/månader och se passade jobb,
  // men begränsar svarets storlek genom att inte hämta hela historiken.
  const HISTORY_WINDOW_DAYS = 60;
  const historyCutoffDate = new Date(Date.now() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // 1. BSA-based assignments (calendar scheduling)
  const { data: assignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, assignment_date, team_id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .gte('assignment_date', historyCutoffDate)

  if (assignmentError) {
    console.error('Assignment query error:', assignmentError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch assignments' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Separate real scheduling assignments from project-visibility-only ones
  const realAssignments = (assignments || []).filter((a: any) => a.team_id !== 'project' && a.team_id !== 'location')
  const realBsaBookingIds = new Set(realAssignments.map((a: any) => a.booking_id))

  const { data: staffTeamAssignments, error: staffTeamAssignmentsError } = await supabase
    .from('staff_assignments')
    .select('assignment_date, team_id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .gte('assignment_date', historyCutoffDate)

  if (staffTeamAssignmentsError) {
    console.error('[get_bookings] staff_assignments query error:', staffTeamAssignmentsError)
  }

  // Bookings where the user has a direct project-membership row (team_id='project').
  // These should also be visible in the mobile app — being on a project's team
  // is a valid visibility signal even without a per-day team scheduling row.
  const projectMembershipBookingIds = new Set(
    (assignments || [])
      .filter((a: any) => a.team_id === 'project' && !String(a.booking_id).startsWith('location-'))
      .map((a: any) => a.booking_id)
  )

  // Build a map of booking_id → Set of real scheduled dates
  const bookingScheduledDates: Record<string, Set<string>> = {}
  for (const a of realAssignments) {
    if (!a.booking_id.startsWith('location-')) {
      if (!bookingScheduledDates[a.booking_id]) bookingScheduledDates[a.booking_id] = new Set()
      bookingScheduledDates[a.booking_id].add(a.assignment_date)
    }
  }

  // Discover which large projects the user is scheduled on.
  // Source A: REAL booking_staff_assignments linked to a booking in a large project.
  // Source B: team-based large_project_team_assignments joined with the staff
  // member's own staff_assignments for the same date/team.
  const realBsaIds = [...realBsaBookingIds].filter((id: string) => !id.startsWith('location-'))
  let scheduledProjectDates: Record<string, Set<string>> = {} // project_id → Set of dates

  if (realBsaIds.length > 0) {
    const { data: lpLinks } = await supabase
      .from('large_project_bookings')
      .select('large_project_id, booking_id')
      .in('booking_id', realBsaIds)
      .eq('organization_id', organizationId)

    // For each project booking with a real assignment, record the scheduled dates
    for (const link of (lpLinks || [])) {
      const dates = bookingScheduledDates[link.booking_id]
      if (dates) {
        if (!scheduledProjectDates[link.large_project_id]) scheduledProjectDates[link.large_project_id] = new Set()
        for (const d of dates) scheduledProjectDates[link.large_project_id].add(d)
      }
    }
  }

  const staffTeamsByDate: Record<string, Set<string>> = {}
  for (const row of (staffTeamAssignments || [])) {
    if (!row?.assignment_date || !row?.team_id) continue
    if (!staffTeamsByDate[row.assignment_date]) staffTeamsByDate[row.assignment_date] = new Set()
    staffTeamsByDate[row.assignment_date].add(row.team_id)
  }

  // ─── DERIVED VISIBILITY (1:1 med personalkalendern) ─────────────────
  // Personalkalendern (desktop) renderar bokningar i en team-kolumn baserat på
  // calendar_events.resource_id = team-X. En person "ser" en bokning på datum
  // X om de har en staff_assignments-rad för (X, team-X). Vi speglar exakt
  // den logiken här så mobilen visar samma bokningar som planeraren ser.
  // Source of truth: staff_assignments × calendar_events (resource_id=team-Y).
  // BSA-rader behålls som ytterligare källa (explicit per-person scheduling).
  // ────────────────────────────────────────────────────────────────────
  // OBS: Warehouse-team (Lager) hoppas över här. Bokningar kopplade till
  // warehouse_calendar_events ska aldrig visas som egna huvudkort i
  // dagsvyn — de exponeras enbart via Lager-kortet och Lager-detaljsidan.
  // Se rule #2/#3 i Lager-flödet.
  const teamDateKeys = new Set<string>()  // "team_id|date"
  for (const [date, teamSet] of Object.entries(staffTeamsByDate)) {
    for (const teamId of teamSet) {
      if (isWarehouseTeam(teamId)) continue
      teamDateKeys.add(`${teamId}|${date}`)
    }
  }

  const derivedBookingDates: Record<string, Set<string>> = {} // booking_id → Set<date>
  let derivedFromTeamCalendarCount = 0
  if (teamDateKeys.size > 0) {
    const dateValues = [...new Set(
      Array.from(teamDateKeys).map(k => k.split('|')[1])
    )].sort()
    const teamIds = [...new Set(
      Array.from(teamDateKeys).map(k => k.split('|')[0])
    )]
    const minDate = dateValues[0]
    const maxDate = dateValues[dateValues.length - 1]

    const { data: teamCeRows, error: teamCeErr } = await supabase
      .from('calendar_events')
      .select('booking_id, resource_id, start_time')
      .in('resource_id', teamIds)
      .eq('organization_id', organizationId)
      .gte('start_time', `${minDate}T00:00:00`)
      .lte('start_time', `${maxDate}T23:59:59`)

    if (teamCeErr) {
      console.error('[get_bookings] team-derived calendar_events query error:', teamCeErr)
    } else {
      for (const ce of (teamCeRows || [])) {
        if (!ce.booking_id) continue
        const dateStr = (ce.start_time || '').slice(0, 10)
        const tdKey = `${ce.resource_id}|${dateStr}`
        if (!teamDateKeys.has(tdKey)) continue // person var inte på det teamet den dagen
        if (!derivedBookingDates[ce.booking_id]) derivedBookingDates[ce.booking_id] = new Set()
        if (!derivedBookingDates[ce.booking_id].has(dateStr)) {
          derivedBookingDates[ce.booking_id].add(dateStr)
          derivedFromTeamCalendarCount += 1
        }
      }
    }
  }

  // Slå samman team-härledda datum med BSA-härledda datum till en effektiv
  // (booking_id → datum)-karta som styr både synlighet OCH skiftbygget.
  const effectiveBookingDates: Record<string, Set<string>> = {}
  for (const [bId, dates] of Object.entries(bookingScheduledDates)) {
    if (!effectiveBookingDates[bId]) effectiveBookingDates[bId] = new Set()
    for (const d of dates) effectiveBookingDates[bId].add(d)
  }
  for (const [bId, dates] of Object.entries(derivedBookingDates)) {
    if (!effectiveBookingDates[bId]) effectiveBookingDates[bId] = new Set()
    for (const d of dates) effectiveBookingDates[bId].add(d)
  }

  // Lägg till team-härledda bokningar i synlighetsmängden så de hämtas nedan.
  const teamDerivedBookingIds = new Set<string>(Object.keys(derivedBookingDates))

  const uniqueStaffTeamIds = [...new Set((staffTeamAssignments || []).map((row: any) => row.team_id).filter(Boolean))]
  let teamScheduledProjectHits = 0
  if (uniqueStaffTeamIds.length > 0) {
    const { data: projectTeamRows, error: projectTeamError } = await supabase
      .from('large_project_team_assignments')
      .select('large_project_id, team_id, assignment_date, phase')
      .in('team_id', uniqueStaffTeamIds)
      .eq('organization_id', organizationId)
      .gte('assignment_date', today)

    if (projectTeamError) {
      console.error('[get_bookings] large_project_team_assignments query error:', projectTeamError)
    } else {
      for (const row of (projectTeamRows || [])) {
        const teamSet = staffTeamsByDate[row.assignment_date]
        if (!teamSet?.has(row.team_id)) continue
        if (!scheduledProjectDates[row.large_project_id]) scheduledProjectDates[row.large_project_id] = new Set()
        if (!scheduledProjectDates[row.large_project_id].has(row.assignment_date)) {
          teamScheduledProjectHits += 1
        }
        scheduledProjectDates[row.large_project_id].add(row.assignment_date)
      }
    }
  }

  // For each project with scheduled dates, fetch ALL bookings in the project
  const projectIds = Object.keys(scheduledProjectDates)
  let projectBookingIds: string[] = []
  let projectBookingToProject: Record<string, string> = {} // booking_id → project_id

  if (projectIds.length > 0) {
    const { data: allProjectBookings } = await supabase
      .from('large_project_bookings')
      .select('booking_id, large_project_id')
      .in('large_project_id', projectIds)
      .eq('organization_id', organizationId)
    for (const pb of (allProjectBookings || [])) {
      projectBookingIds.push(pb.booking_id)
      projectBookingToProject[pb.booking_id] = pb.large_project_id
    }
  }

  const bsaBookingIds = new Set((assignments || []).map((a: any) => a.booking_id))
  const allBookingIds = [...new Set([...bsaBookingIds, ...projectBookingIds, ...teamDerivedBookingIds])]

  // Separate location-based booking IDs from real booking IDs
  const locationBookingIds = allBookingIds.filter(id => id.startsWith('location-'))
  const realBookingIds = allBookingIds.filter(id => !id.startsWith('location-'))

  let bookingsWithAssignments: any[] = []

  // Fetch real bookings
  if (realBookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        client,
        booking_number,
        status,
        deliveryaddress,
        delivery_city,
        delivery_postal_code,
        delivery_latitude,
        delivery_longitude,
        rigdaydate,
        eventdate,
        rigdowndate,
        rig_start_time,
        rig_end_time,
        event_start_time,
        event_end_time,
        rigdown_start_time,
        rigdown_end_time,
        internalnotes,
        contact_name,
        contact_phone,
        contact_email,
        assigned_project_id,
        assigned_project_name,
        large_project_id
      `)
      .in('id', realBookingIds)
      .eq('status', 'CONFIRMED')
      .order('rigdaydate', { ascending: true })

    if (bookingsError) {
      console.error('Bookings query error:', bookingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve large project names for bookings that belong to one
    const largeProjectIds = [...new Set((bookings || []).map((b: any) => b.large_project_id).filter(Boolean))]
    let largeProjectNameMap: Record<string, string> = {}
    let largeProjectGeoMap: Record<string, { address: string | null; lat: number | null; lng: number | null }> = {}
    if (largeProjectIds.length > 0) {
      const { data: lpData } = await supabase
        .from('large_projects')
        .select('id, name, address, address_latitude, address_longitude')
        .in('id', largeProjectIds)
      for (const lp of (lpData || [])) {
        largeProjectNameMap[lp.id] = lp.name
      }
      // Build a map of project-level geocodes
      for (const lp of (lpData || [])) {
        if (lp.address_latitude && lp.address_longitude) {
          largeProjectGeoMap[lp.id] = { address: lp.address, lat: lp.address_latitude, lng: lp.address_longitude }
        }
      }
    }

    bookingsWithAssignments = (bookings || []).map((booking: any) => {
      const bookingAssignments = (assignments || []).filter((a: any) => a.booking_id === booking.id)
      const hasRealAssignment = realBsaBookingIds.has(booking.id)
      const hasProjectMembership = projectMembershipBookingIds.has(booking.id)
      const teamDerivedDates = derivedBookingDates[booking.id]
      const hasTeamDerived = !!teamDerivedDates && teamDerivedDates.size > 0

      // Combine date sources:
      //  1. BSA rader (riktigt team eller project-membership) → explicit per-person scheduling
      //  2. Team-härledning (staff_assignments × calendar_events.resource_id=team-Y) → speglar planeringskalendern 1:1
      //  3. Project-expansion (large_project) → övriga bokningar i samma stora projekt på dagar personen är schemalagd på projektet
      const dateSet = new Set<string>()
      if (hasRealAssignment || hasProjectMembership) {
        for (const a of bookingAssignments) {
          if (a.assignment_date) dateSet.add(a.assignment_date)
        }
      }
      if (hasTeamDerived) {
        for (const d of teamDerivedDates) dateSet.add(d)
      }
      if (dateSet.size === 0 && booking.large_project_id && scheduledProjectDates[booking.large_project_id]) {
        const bookingDates = [booking.rigdaydate, booking.eventdate, booking.rigdowndate].filter(Boolean)
        const projectDates = scheduledProjectDates[booking.large_project_id]
        for (const d of bookingDates) if (projectDates.has(d)) dateSet.add(d)
      }

      let assignmentDates: string[] = [...dateSet]

      // If no dates matched (shouldn't happen but safety), fall back
      if (assignmentDates.length === 0) {
        const dates = [booking.rigdaydate, booking.eventdate, booking.rigdowndate].filter(Boolean)
        assignmentDates = dates.length > 0 ? dates : [today]
      }

      // Override geocodes with large project's own address if available
      const projectGeo = booking.large_project_id ? largeProjectGeoMap[booking.large_project_id] : null

      return {
        ...booking,
        large_project_name: booking.large_project_id ? (largeProjectNameMap[booking.large_project_id] || null) : null,
        assignment_dates: assignmentDates,
        assignment_type: 'scheduled',
        // Project-level address overrides individual booking addresses
        ...(projectGeo ? {
          deliveryaddress: projectGeo.address || booking.deliveryaddress,
          delivery_latitude: projectGeo.lat,
          delivery_longitude: projectGeo.lng,
        } : {}),
      }
    })

    // Filter out project-expanded bookings that have no matching dates
    // (booking dates don't overlap with the user's scheduled project dates).
    // Always keep bookings the user has a direct BSA on (real team OR project membership)
    // OR a team-derived assignment (planning calendar parity).
    bookingsWithAssignments = bookingsWithAssignments.filter((b: any) => {
      if (!b.large_project_id) return true
      if (realBsaBookingIds.has(b.id) || projectMembershipBookingIds.has(b.id)) return true
      if (teamDerivedBookingIds.has(b.id)) return true
      // For expanded bookings: only keep if at least one assignment date is a real scheduled project date
      const projectDates = scheduledProjectDates[b.large_project_id]
      if (!projectDates) return false
      return b.assignment_dates.some((d: string) => projectDates.has(d))
    })
  }

  // Fetch location projects (show_as_project = true)
  if (locationBookingIds.length > 0) {
    const locationIds = locationBookingIds.map(id => id.replace('location-', ''))
    const { data: locations } = await supabase
      .from('organization_locations')
      .select('id, name, address, latitude, longitude, radius_meters')
      .in('id', locationIds)
      .eq('is_active', true)
      .eq('show_as_project', true)
      .eq('organization_id', organizationId)

    for (const loc of (locations || [])) {
      bookingsWithAssignments.push({
        id: `location-${loc.id}`,
        client: loc.name,
        booking_number: null,
        status: 'CONFIRMED',
        deliveryaddress: loc.address,
        delivery_latitude: loc.latitude,
        delivery_longitude: loc.longitude,
        is_location_project: true,
        location_id: loc.id,
        assignment_dates: [new Date().toISOString().split('T')[0]],
        assignment_type: 'scheduled',
      })
    }
  }

  // ─── LAGER BRIDGE ────────────────────────────────────────────────
  // Personalkalenderns "Lager"-kolumn kan ha team_id 'transport',
  // 'warehouse' eller 'lager-N'. Alla räknas som Lager via
  // isWarehouseTeam(). Om personen har minst en sådan staff_assignments-rad
  // på ett datum visar Time-appen det interna Lager-projektet + ett 07–16
  // pass den dagen, även utan booking_staff_assignments. Det säkerställer
  // att packningar/returer/interna lageruppgifter samlas under EN enda
  // Lager-vy istället för flera huvudkort i jobblistan.
  // ──────────────────────────────────────────────────────────────────
  const lagerTeamRows = (staffTeamAssignments || []).filter(
    (r: any) => isWarehouseTeam(r.team_id),
  )
  const lagerDates = Array.from(
    new Set(lagerTeamRows.map((r: any) => String(r.assignment_date))),
  ).sort()

  let lagerShifts: any[] = []
  let lagerBookingId: string | null = null

  if (lagerDates.length > 0) {
    const { data: lagerProject, error: lagerErr } = await supabase
      .from('projects')
      .select('id, name, booking_id')
      .eq('is_internal', true)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (lagerErr) {
      console.warn('[get_bookings][lager] project lookup failed:', lagerErr)
    }

    if (!lagerProject) {
      console.warn('[get_bookings][lager] internal lager project missing for org', { organizationId })
    }

    lagerBookingId = lagerProject?.booking_id ?? `lager-internal-${organizationId}`

    // Avoid duplicate booking row if it's already present from another source
    const alreadyHasLagerBooking = bookingsWithAssignments.some(
      (b: any) => String(b.id) === String(lagerBookingId),
    )
    if (!alreadyHasLagerBooking) {
      bookingsWithAssignments.push({
        id: lagerBookingId,
        client: lagerProject?.name || 'Lager',
        booking_number: null,
        status: 'CONFIRMED',
        deliveryaddress: null,
        delivery_latitude: null,
        delivery_longitude: null,
        is_internal: true,
        internal_type: 'lager',
        assignment_dates: lagerDates,
        assignment_type: 'scheduled',
      })
    } else {
      // Merge lager dates into the existing row
      const existing = bookingsWithAssignments.find(
        (b: any) => String(b.id) === String(lagerBookingId),
      )
      if (existing) {
        const merged = new Set<string>([...(existing.assignment_dates || []), ...lagerDates])
        existing.assignment_dates = Array.from(merged).sort()
        existing.is_internal = true
        existing.internal_type = existing.internal_type || 'lager'
      }
    }

    for (const d of lagerDates) {
      lagerShifts.push({
        shift_id: `lager-${lagerBookingId}-${d}`,
        booking_id: lagerBookingId,
        booking_number: null,
        title: 'Lager',
        event_type: 'internal_task',
        start_time: `${d}T07:00:00`,
        end_time: `${d}T16:00:00`,
        delivery_address: null,
        delivery_latitude: null,
        delivery_longitude: null,
        client: lagerProject?.name || 'Lager',
        is_internal: true,
        internal_type: 'lager',
        large_project_id: null,
        large_project_name: null,
      })
    }

    console.log('[get_bookings][lager] bridge applied', {
      staffId,
      lagerTeamRowCount: lagerTeamRows.length,
      lagerDates,
      lagerBookingId,
      lagerProjectFound: !!lagerProject,
      lagerShiftsCreated: lagerShifts.length,
    })
  }

  console.log('[get_bookings] complete', {
    staffId,
    assignmentCount: (assignments || []).length,
    realAssignmentCount: realAssignments.length,
    staffTeamAssignmentCount: (staffTeamAssignments || []).length,
    scheduledProjectCount: Object.keys(scheduledProjectDates).length,
    teamScheduledProjectHits,
    teamDerivedBookingCount: teamDerivedBookingIds.size,
    derivedFromTeamCalendarCount,
    returnedBookingCount: bookingsWithAssignments.length,
  })

  // ─── SCHEDULED SHIFTS (calendar_events) ────────────────────────────
  // Build shifts from all (booking_id, date) par som mobilen ska visa,
  // härlett från SAMMA källa som personalkalendern (desktop):
  //   1. staff_assignments × calendar_events.resource_id=team-Y
  //      → "personen är på team-Y dag X, så alla bokningar i team-Y-kolumnen
  //         dag X ska synas på mobilen"
  //   2. booking_staff_assignments med riktigt team_id (explicit per-person)
  // Project-membership (team_id='project') ger synlighet för andra bokningar
  // i samma stora projekt, men skapar inte egna shifts.
  // ──────────────────────────────────────────────────────────────────
  let shifts: any[] = []
  try {
    const bsaForShifts = (assignments || []).filter(
      (a: any) =>
        a.team_id !== 'project' &&
        a.team_id !== 'location' &&
        !isWarehouseTeam(a.team_id) && // warehouse-team BSAs samlas i Lager-kortet
        !String(a.booking_id).startsWith('location-')
    )

    const shiftDateKeys = new Set<string>(
      bsaForShifts.map((a: any) => `${a.booking_id}|${a.assignment_date}`)
    )

    // Lägg till team-härledda (booking, date)-par så shifts speglar
    // personalkalendern även när BSA-rad saknas.
    for (const [bId, dates] of Object.entries(derivedBookingDates)) {
      if (String(bId).startsWith('location-')) continue
      for (const d of dates) shiftDateKeys.add(`${bId}|${d}`)
    }

    if (shiftDateKeys.size > 0) {
      const shiftBookingIds = [...new Set(Array.from(shiftDateKeys).map((key) => key.split('|')[0]))]

      // Map booking_id → enriched booking from bookingsWithAssignments
      const bookingMap: Record<string, any> = {}
      for (const b of bookingsWithAssignments) {
        if (!String(b.id).startsWith('location-')) bookingMap[b.id] = b
      }

      // Date window: min..max of assignment_dates we care about
      const dateValues = Array.from(shiftDateKeys).map((key) => key.split('|')[1]).sort()
      const minDate = dateValues[0]
      const maxDate = dateValues[dateValues.length - 1]

      const { data: ceRows, error: ceErr } = await supabase
        .from('calendar_events')
        .select('id, booking_id, booking_number, title, event_type, start_time, end_time, delivery_address, resource_id, source_date')
        .in('booking_id', shiftBookingIds)
        .eq('organization_id', organizationId)
        .gte('start_time', `${minDate}T00:00:00`)
        .lte('start_time', `${maxDate}T23:59:59`)

      if (ceErr) {
        console.error('[get_bookings] calendar_events query error:', ceErr)
      } else {
        const matchedShiftKeys = new Set<string>()

        for (const ce of (ceRows || [])) {
          const startDate = (ce.start_time || '').slice(0, 10)
          const key = `${ce.booking_id}|${startDate}`
          if (!shiftDateKeys.has(key)) continue
          const booking = bookingMap[ce.booking_id]
          if (!booking) continue
          matchedShiftKeys.add(key)

          const rawType = (ce.event_type || '').toLowerCase()
          const normalizedType =
            rawType === 'rig' || rawType === 'event' || rawType === 'rigdown'
              ? rawType
              : 'other'

          shifts.push({
            shift_id: ce.id,
            booking_id: ce.booking_id,
            booking_number: ce.booking_number ?? booking.booking_number ?? null,
            title: ce.title || booking.client,
            event_type: normalizedType,
            start_time: ce.start_time,
            end_time: ce.end_time,
            delivery_address: ce.delivery_address ?? booking.deliveryaddress ?? null,
            delivery_latitude: booking.delivery_latitude ?? null,
            delivery_longitude: booking.delivery_longitude ?? null,
            client: booking.client,
            is_internal: !!booking.is_internal,
            internal_type: booking.internal_type ?? null,
            large_project_id: booking.large_project_id ?? null,
            large_project_name: booking.large_project_name ?? null,
          })
        }

        for (const key of shiftDateKeys) {
          if (matchedShiftKeys.has(key)) continue
          const [bookingId, assignmentDate] = key.split('|')
          const booking = bookingMap[bookingId]
          if (!booking) continue

          const fallback = getBookingShiftWindowForDate(booking, assignmentDate)
          if (!fallback.start || !fallback.end) {
            console.warn('[get_bookings] missing fallback shift window for key:', { staffId, bookingId, assignmentDate })
            continue
          }

          // Extract HH:mm from the phase time (which may be a full timestamp
          // tied to the phase date) and rebuild it on the assignment date.
          // Result is naive ISO ("YYYY-MM-DDTHH:mm:00") — no timezone shift.
          const extractClock = (raw: string | null): string | null => {
            if (!raw) return null
            const m = String(raw).match(/(\d{2}):(\d{2})/)
            return m ? `${m[1]}:${m[2]}` : null
          }
          const startClock = extractClock(fallback.start) || '08:00'
          const endClock = extractClock(fallback.end) || '17:00'
          const startIso = `${assignmentDate}T${startClock}:00`
          const endIso = `${assignmentDate}T${endClock}:00`

          shifts.push({
            shift_id: `fallback-${bookingId}-${assignmentDate}-${fallback.eventType}`,
            booking_id: bookingId,
            booking_number: booking.booking_number ?? null,
            title: booking.large_project_name || booking.client,
            event_type: fallback.eventType,
            start_time: startIso,
            end_time: endIso,
            delivery_address: booking.deliveryaddress ?? null,
            delivery_latitude: booking.delivery_latitude ?? null,
            delivery_longitude: booking.delivery_longitude ?? null,
            client: booking.client,
            is_internal: !!booking.is_internal,
            internal_type: booking.internal_type ?? null,
            large_project_id: booking.large_project_id ?? null,
            large_project_name: booking.large_project_name ?? null,
          })
        }

        shifts.sort((a, b) => a.start_time.localeCompare(b.start_time))

        // Per-booking breakdown so we can debug "missing day" reports without
        // re-running queries by hand.
        const breakdown: Record<string, { dates: string[]; ce: number; fallback: number }> = {}
        for (const key of shiftDateKeys) {
          const [bId, dt] = key.split('|')
          if (!breakdown[bId]) breakdown[bId] = { dates: [], ce: 0, fallback: 0 }
          breakdown[bId].dates.push(dt)
        }
        for (const s of shifts) {
          const entry = breakdown[s.booking_id]
          if (!entry) continue
          if (String(s.shift_id).startsWith('fallback-')) entry.fallback += 1
          else entry.ce += 1
        }

        console.log('[get_bookings] shifts summary:', {
          staffId,
          shiftDateKeyCount: shiftDateKeys.size,
          calendarEventRowCount: (ceRows || []).length,
          fallbackShiftCount: shifts.filter((s: any) => String(s.shift_id).startsWith('fallback-')).length,
          returnedShiftCount: shifts.length,
          perBooking: breakdown,
        })
      }
    }
  } catch (e) {
    console.error('[get_bookings] shifts build failed:', e)
  }

  // Merge lager bridge shifts (dedup by booking_id|date)
  if (lagerShifts.length > 0) {
    const seen = new Set(shifts.map((s: any) => `${s.booking_id}|${(s.start_time || '').slice(0, 10)}`))
    for (const ls of lagerShifts) {
      const key = `${ls.booking_id}|${(ls.start_time || '').slice(0, 10)}`
      if (!seen.has(key)) { shifts.push(ls); seen.add(key) }
    }
    shifts.sort((a: any, b: any) => a.start_time.localeCompare(b.start_time))
  }

  return new Response(
    JSON.stringify({ bookings: bookingsWithAssignments, shifts }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetInboxJobs(supabase: any, staffId: string, organizationId: string) {
  // Fetch bookings from the last 30 days (incl. COMPLETED) for inbox/job chat
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

  const { data: assignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, assignment_date')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .gte('assignment_date', thirtyDaysAgoStr)

  if (assignmentError) {
    console.error('Inbox assignment query error:', assignmentError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch inbox assignments' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!assignments || assignments.length === 0) {
    return new Response(
      JSON.stringify({ bookings: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const bookingIds = [...new Set(assignments.map((a: any) => a.booking_id))]

  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('id, client, status, rigdaydate, eventdate, rigdowndate')
    .in('id', bookingIds)
    .in('status', ['CONFIRMED', 'COMPLETED'])
    .order('rigdaydate', { ascending: false })

  if (bookingsError) {
    console.error('Inbox bookings query error:', bookingsError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch inbox bookings' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ bookings: bookings || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetInboxAll(supabase: any, staffId: string, organizationId: string, userId: string | null) {
  // Run all three inbox queries in parallel for a single round-trip
  const today = new Date().toISOString().split('T')[0]
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

  // Build DM filter to match both staff_member id AND auth user_id (dual identity)
  const ids = [staffId]
  if (userId && userId !== staffId) ids.push(userId)
  const orFilter = ids.map(id => `sender_id.eq.${id},recipient_id.eq.${id}`).join(',')

  const [dmResult, broadcastResult, broadcastAssignments, jobAssignments] = await Promise.all([
    // DMs — match both identities
    supabase
      .from('direct_messages')
      .select('*')
      .eq('organization_id', organizationId)
      .or(orFilter)
      .order('created_at', { ascending: false })
      .limit(200),
    // Broadcasts
    supabase
      .from('broadcast_messages')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('created_at', `${sevenDaysAgo}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(50),
    // Broadcast audience assignments (today)
    supabase
      .from('booking_staff_assignments')
      .select('booking_id')
      .eq('staff_id', staffId)
      .eq('assignment_date', today)
      .eq('organization_id', organizationId),
    // Job inbox assignments (30 days)
    supabase
      .from('booking_staff_assignments')
      .select('booking_id, assignment_date')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .gte('assignment_date', thirtyDaysAgoStr),
  ])

  // --- Process DMs ---
  const myIds = new Set(ids) // staffId + userId (if linked)
  const conversations = new Map<string, { partner_id: string; partner_name: string; last_message: any; unread_count: number; messages: any[]; archived: boolean }>()
  for (const msg of (dmResult.data || [])) {
    const isSender = myIds.has(msg.sender_id)
    const partnerId = isSender ? msg.recipient_id : msg.sender_id
    const partnerName = isSender ? msg.recipient_name : msg.sender_name
    if (myIds.has(partnerId)) continue // skip self-conversations
    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, { partner_id: partnerId, partner_name: partnerName, last_message: msg, unread_count: 0, messages: [], archived: false })
    }
    const conv = conversations.get(partnerId)!
    conv.messages.push(msg)
    // unread = sent to me, not yet read
    if (!msg.read_at && !msg.is_read && !isSender) conv.unread_count++
  }
  // Conversation is archived only if EVERY message archive list contains my id
  for (const conv of conversations.values()) {
    conv.archived = conv.messages.length > 0 && conv.messages.every((m: any) =>
      Array.isArray(m.is_archived_by) && ids.some(id => m.is_archived_by.includes(id))
    )
  }
  const dmInbox = Array.from(conversations.values())
    .sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime())

  // --- Process Broadcasts ---
  const staffBookingIds = new Set((broadcastAssignments.data || []).map((a: any) => a.booking_id))
  const relevantBroadcasts = (broadcastResult.data || []).filter((b: any) => {
    switch (b.audience) {
      case 'all_today': return true
      case 'active_staff': return true
      case 'job_staff': return staffBookingIds.has(b.audience_booking_id)
      case 'selected_staff': return (b.audience_staff_ids || []).includes(staffId)
      default: return false
    }
  }).map((b: any) => ({ ...b, is_read: (b.is_read_by || []).includes(staffId) }))

  // --- Process Job bookings (with last message + unread count) ---
  // Unread is computed by the SQL helper `get_job_chat_summary` so we don't
  // pull a row-capped slice into the function. Correct for any history size.
  let jobBookings: any[] = []
  const jobAssignmentData = jobAssignments.data || []
  if (jobAssignmentData.length > 0) {
    const bookingIds = [...new Set(jobAssignmentData.map((a: any) => a.booking_id))]
    const myReaderIds = [staffId, ...(userId && userId !== staffId ? [userId] : [])]

    const [bookingsRes, summaryRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id, client, status, rigdaydate, eventdate, rigdowndate')
        .in('id', bookingIds)
        .in('status', ['CONFIRMED', 'COMPLETED'])
        .order('rigdaydate', { ascending: false }),
      supabase.rpc('get_job_chat_summary', {
        _org_id: organizationId,
        _booking_ids: bookingIds,
        _my_ids: myReaderIds,
      }),
    ])

    if (summaryRes.error) {
      console.error('get_job_chat_summary failed:', summaryRes.error)
    }
    const summaryByBooking = new Map<string, { last_message_content: string | null; last_message_at: string | null; unread_count: number }>()
    for (const row of (summaryRes.data || [])) {
      summaryByBooking.set(row.booking_id, {
        last_message_content: row.last_message_content,
        last_message_at: row.last_message_at,
        unread_count: Number(row.unread_count) || 0,
      })
    }

    jobBookings = (bookingsRes.data || []).map((b: any) => {
      const s = summaryByBooking.get(b.id)
      return {
        ...b,
        last_message_content: s?.last_message_content ?? null,
        last_message_at: s?.last_message_at ?? null,
        unread_count: s?.unread_count ?? 0,
      }
    })
  }

  return new Response(
    JSON.stringify({ conversations: dmInbox, broadcasts: relevantBroadcasts, bookings: jobBookings }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetTimeReports(supabase: any, staffId: string, organizationId: string) {
  const { data: reports, error } = await supabase
    .from('time_reports')
    .select(`
      id,
      booking_id,
      large_project_id,
      report_date,
      start_time,
      end_time,
      hours_worked,
      overtime_hours,
      break_time,
      description,
      approved,
      created_at,
      is_subdivision,
      parent_time_report_id,
      bookings (
        id,
        client,
        booking_number
      ),
      large_projects (
        id,
        name
      )
    `)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .order('report_date', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Time reports query error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch time reports' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Flatten large_project info for easier frontend consumption.
  //
  // NOTE: Lager / location-presence sessions reach this list because the
  // mobile stop pipeline (`useWorkSession.stopSession` →
  // `handleCreateTimeReport`) writes a normal `time_report` for banner-
  // stopped location timers (createsTimeReport=true). The legacy DB
  // trigger `sync_location_entry_to_time_report` was removed 2026-04-22;
  // `handleCreateTimeReport` is now the single owner of `time_reports`.
  // Pure presence (createsTimeReport=false) intentionally produces no row.
  const enriched = (reports || []).map((r: any) => ({
    ...r,
    large_project_name: r.large_projects?.name || null,
    large_projects: undefined,
  }))

  // Fetch travel logs in parallel
  const { data: travelLogs } = await supabase
    .from('travel_time_logs')
    .select('id, report_date, start_time, end_time, hours_worked, destination_booking_id, from_address, to_address, description')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .not('end_time', 'is', null)
    .order('report_date', { ascending: false })
    .limit(200)

  return new Response(
    JSON.stringify({ time_reports: enriched, travel_logs: travelLogs || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUpdateTimeReport(supabase: any, staffId: string, data: any, organizationId: string) {
  const { time_report_id, start_time, end_time, hours_worked, overtime_hours, break_time, description } = data

  if (!time_report_id) {
    return new Response(
      JSON.stringify({ error: 'time_report_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch existing report — must belong to staff and not be approved
  const { data: existing, error: fetchErr } = await supabase
    .from('time_reports')
    .select('id, staff_id, approved, hours_worked, overtime_hours, break_time, start_time, end_time, description, organization_id, report_date')
    .eq('id', time_report_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (fetchErr || !existing) {
    return new Response(
      JSON.stringify({ error: 'Time report not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (existing.approved) {
    return new Response(
      JSON.stringify({ error: 'Cannot edit an approved time report' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // === UNIFIED TIME MODEL (must match handleCreateTimeReport) ===
  // - break_time: decimal HOURS (e.g. 0.5 = 30 min). Same unit as DB column.
  // - overtime_hours: decimal HOURS.
  // - hours_worked: server-calculated, NEVER trust client value.
  // - Night shift: end < start crosses midnight (rawHours += 24).
  const finalStartTime = start_time !== undefined ? start_time : existing.start_time
  const finalEndTime = end_time !== undefined ? end_time : existing.end_time
  // FIX: parseFloat (hours) — was parseInt which truncated 0.5 -> 0 and broke break persistence on edit.
  const finalBreak = break_time !== undefined ? parseFloat(break_time) : Number(existing.break_time || 0)
  const finalOvertime = overtime_hours !== undefined ? parseFloat(overtime_hours) : Number(existing.overtime_hours || 0)

  // Validate break (decimal hours, max 4h = 240 min)
  if (isNaN(finalBreak) || finalBreak < 0) {
    return new Response(
      JSON.stringify({ error: 'Rast kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (finalBreak * 60 > 240) {
    return new Response(
      JSON.stringify({ error: 'Rast kan inte överstiga 240 minuter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validate overtime
  if (isNaN(finalOvertime) || finalOvertime < 0) {
    return new Response(
      JSON.stringify({ error: 'Övertid kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  // Cap removed (was 6h) — sanity-cap at 16h matching hours-worked validation below.
  if (finalOvertime > 16) {
    return new Response(
      JSON.stringify({ error: 'Övertid kan inte överstiga 16 timmar' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Server-side hours calculation — identical rules as handleCreateTimeReport.
  let calculatedHours: number | null = null
  if (finalStartTime && finalEndTime) {
    const [sh, sm] = finalStartTime.split(':').map(Number)
    const [eh, em] = finalEndTime.split(':').map(Number)
    const startMinutes = sh * 60 + sm
    const endMinutes = eh * 60 + em

    if (startMinutes === endMinutes) {
      return new Response(
        JSON.stringify({ error: 'Sluttid kan inte vara samma som starttid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Night-shift parity with create: end < start crosses midnight.
    let rawHours = (eh + em / 60) - (sh + sm / 60)
    if (rawHours < 0) rawHours += 24
    // finalBreak is already in decimal hours.
    calculatedHours = Math.round((rawHours - finalBreak) * 100) / 100

    if (calculatedHours <= 0) {
      return new Response(
        JSON.stringify({ error: 'Arbetad tid efter rast måste vara mer än 0' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (calculatedHours > 16) {
      return new Response(
        JSON.stringify({ error: 'Arbetad tid kan inte överstiga 16 timmar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // Build previous values for edit log
  const previousValues: Record<string, any> = {}
  const newValues: Record<string, any> = {}
  const updates: Record<string, any> = {}

  // Always use server-calculated hours when available, ignore client hours_worked
  if (calculatedHours !== null && calculatedHours !== existing.hours_worked) {
    previousValues.hours_worked = existing.hours_worked
    newValues.hours_worked = calculatedHours
    updates.hours_worked = calculatedHours
  }
  if (finalOvertime !== (existing.overtime_hours || 0)) {
    previousValues.overtime_hours = existing.overtime_hours || 0
    newValues.overtime_hours = finalOvertime
    updates.overtime_hours = finalOvertime
  }
  if (finalBreak !== (existing.break_time || 0)) {
    previousValues.break_time = existing.break_time || 0
    newValues.break_time = finalBreak
    updates.break_time = finalBreak
  }
  if (start_time !== undefined && start_time !== existing.start_time) {
    previousValues.start_time = existing.start_time
    newValues.start_time = start_time || null
    updates.start_time = start_time || null
  }
  if (end_time !== undefined && end_time !== existing.end_time) {
    previousValues.end_time = existing.end_time
    newValues.end_time = end_time || null
    updates.end_time = end_time || null
  }
  if (description !== undefined && description !== existing.description) {
    previousValues.description = existing.description
    newValues.description = description || null
    updates.description = description || null
  }

  if (Object.keys(updates).length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: 'No changes' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // === Overlap check (UPDATE) ===
  // Uses real datetime intervals so night shifts crossing midnight are
  // compared correctly against same-day, previous-day and next-day reports.
  if (finalStartTime && finalEndTime) {
    const newInterval = buildShiftInterval(existing.report_date, finalStartTime, finalEndTime)
    if (newInterval) {
      // Widen window: a previous-day night shift may extend into report_date,
      // and a same-day night shift extends into report_date + 1.
      const baseDate = new Date(`${existing.report_date}T00:00:00Z`)
      const prevDate = new Date(baseDate.getTime() - 86_400_000).toISOString().slice(0, 10)
      const nextDate = new Date(baseDate.getTime() + 86_400_000).toISOString().slice(0, 10)

      const { data: candidates } = await supabase
        .from('time_reports')
        .select('id, report_date, start_time, end_time')
        .eq('staff_id', staffId)
        .neq('id', time_report_id)
        .in('report_date', [prevDate, existing.report_date, nextDate])
        .eq('is_subdivision', false)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)

      const hasOverlap = (candidates || []).some((r: any) => {
        const other = buildShiftInterval(r.report_date, r.start_time, r.end_time)
        return other ? intervalsOverlap(newInterval, other) : false
      })

      if (hasOverlap) {
        return new Response(
          JSON.stringify({ error: 'Du har redan en tidrapport som överlappar detta tidsintervall (inklusive nattskift över midnatt)' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  // Get staff name for log
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .single()

  // Update the report
  const { data: updated, error: updateErr } = await supabase
    .from('time_reports')
    .update(updates)
    .eq('id', time_report_id)
    .select()
    .single()

  if (updateErr) {
    console.error('Time report update error:', updateErr)
    return new Response(
      JSON.stringify({ error: 'Failed to update time report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Log the edit
  await supabase.from('time_report_edit_log').insert({
    time_report_id,
    edited_by_type: 'staff',
    edited_by_name: staffMember?.name || 'Okänd',
    edited_by_id: staffId,
    previous_values: previousValues,
    new_values: newValues,
    organization_id: organizationId,
  })

  console.log(`[mobile-app-api] Time report ${time_report_id} updated by staff ${staffId}`)

  // C1: Orphan strategy. If start/end times changed, the report's time-window may
  // no longer match the previously-linked anomalies / GPS-history. Rather than
  // delete or silently keep stale links, we orphan rows that fall OUTSIDE the new
  // window. The 30-day cron then cleans up orphaned GPS history naturally; orphan
  // anomalies become re-classifiable.
  if (updates.start_time !== undefined || updates.end_time !== undefined) {
    try {
      const newStart = (updates.start_time ?? existing.start_time) as string | null
      const newEnd = (updates.end_time ?? existing.end_time) as string | null
      const reportDate = existing.report_date as string

      if (newStart && newEnd && reportDate) {
        const endsNextDay = newEnd < newStart
        const endDate = endsNextDay
          ? new Date(new Date(reportDate).getTime() + 86_400_000).toISOString().slice(0, 10)
          : reportDate
        const newStartIso = `${reportDate}T${newStart}:00`
        const newEndIso = `${endDate}T${newEnd}:00`

        // Orphan anomalies that fall outside the new window
        await supabase
          .from('time_report_anomalies')
          .update({ time_report_id: null })
          .eq('time_report_id', time_report_id)
          .or(`started_at.lt.${newStartIso},ended_at.gt.${newEndIso}`)

        // Orphan GPS history that falls outside the new window
        await supabase
          .from('staff_location_history')
          .update({ time_report_id: null })
          .eq('time_report_id', time_report_id)
          .or(`recorded_at.lt.${newStartIso},recorded_at.gt.${newEndIso}`)
      }
    } catch (orphanErr) {
      console.warn('[mobile-app-api] orphan-on-update failed (non-fatal):', orphanErr)
    }
  }

  return new Response(
    JSON.stringify({ success: true, time_report: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDeleteTimeReport(supabase: any, staffId: string, data: any, organizationId: string) {
  const { time_report_id } = data

  if (!time_report_id) {
    return new Response(
      JSON.stringify({ error: 'time_report_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch existing — must belong to staff and not be approved
  const { data: existing, error: fetchErr } = await supabase
    .from('time_reports')
    .select('id, staff_id, approved')
    .eq('id', time_report_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (fetchErr || !existing) {
    return new Response(
      JSON.stringify({ error: 'Time report not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (existing.approved) {
    return new Response(
      JSON.stringify({ error: 'Cannot delete an approved time report' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { error: deleteErr } = await supabase
    .from('time_reports')
    .delete()
    .eq('id', time_report_id)

  if (deleteErr) {
    console.error('Time report delete error:', deleteErr)
    return new Response(
      JSON.stringify({ error: 'Failed to delete time report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[mobile-app-api] Time report ${time_report_id} deleted by staff ${staffId}`)

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreateTimeReport(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    booking_id, report_date, start_time, end_time, hours_worked, overtime_hours,
    break_time, description, establishment_task_id, large_project_id,
    // --- per-address breakdown of a large_project total (geofence-driven) ---
    // When set, this row is metadata under an existing project-total time_report.
    // It is NEVER summed into payroll/invoicing totals.
    is_subdivision, parent_time_report_id,
  } = data
  let resolvedLocationId: string | null = null
  const isSubdivision = is_subdivision === true
  const parentReportId = parent_time_report_id || null

  if (isSubdivision && !parentReportId) {
    return new Response(
      JSON.stringify({ error: 'is_subdivision requires parent_time_report_id' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // If subdivision: validate parent exists, belongs to this staff/org, and is a project-total (not itself a subdivision)
  if (isSubdivision && parentReportId) {
    const { data: parent, error: parentErr } = await supabase
      .from('time_reports')
      .select('id, staff_id, organization_id, large_project_id, is_subdivision')
      .eq('id', parentReportId)
      .maybeSingle()
    if (parentErr || !parent) {
      return new Response(
        JSON.stringify({ error: 'Parent time report not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (parent.staff_id !== staffId || parent.organization_id !== organizationId) {
      return new Response(
        JSON.stringify({ error: 'Parent time report does not belong to you' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (parent.is_subdivision) {
      return new Response(
        JSON.stringify({ error: 'Parent must be a project-total, not another subdivision' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!parent.large_project_id) {
      return new Response(
        JSON.stringify({ error: 'Subdivision is only valid for large-project time reports' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  if (!report_date) {
    return new Response(
      JSON.stringify({ error: 'report_date is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Allow location- prefixed booking_ids for internal projects
  if (!booking_id && !large_project_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id or large_project_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --- Server-side time validation & calculation ---
  if (!start_time || !end_time) {
    return new Response(
      JSON.stringify({ error: 'start_time och end_time krävs' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  const startMinutes = sh * 60 + sm
  const endMinutes = eh * 60 + em

  if (startMinutes === endMinutes) {
    return new Response(
      JSON.stringify({ error: 'Sluttid kan inte vara samma som starttid' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const breakHours = break_time ? parseFloat(break_time) : 0
  const breakMinutes = breakHours * 60
  if (breakHours < 0) {
    return new Response(
      JSON.stringify({ error: 'Rast kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (breakMinutes > 240) {
    return new Response(
      JSON.stringify({ error: 'Rast kan inte överstiga 240 minuter' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const ot = overtime_hours ? parseFloat(overtime_hours) : 0
  if (ot < 0) {
    return new Response(
      JSON.stringify({ error: 'Övertid kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Calculate hours server-side — never trust client value
  let rawHours = (eh + em / 60) - (sh + sm / 60)
  if (rawHours < 0) rawHours += 24 // night shift
  const calculatedHours = Math.round((rawHours - breakHours) * 100) / 100

  if (calculatedHours <= 0) {
    return new Response(
      JSON.stringify({ error: 'Arbetad tid efter rast måste vara mer än 0' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (calculatedHours > 16) {
    return new Response(
      JSON.stringify({ error: 'Arbetad tid kan inte överstiga 16 timmar' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let resolvedBookingId = booking_id || null
  let resolvedLargeProjectId = large_project_id || null

  // Large project timers: booking_id starts with "project-"
  if (booking_id && booking_id.startsWith('project-')) {
    const projectId = booking_id.replace('project-', '')
    resolvedLargeProjectId = projectId

    // Verify the project exists and belongs to this org
    const { data: projectData } = await supabase
      .from('large_projects')
      .select('id')
      .eq('id', projectId)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!projectData) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify staff is member of this project
    const { data: membership } = await supabase
      .from('large_project_staff')
      .select('id')
      .eq('large_project_id', projectId)
      .eq('staff_id', staffId)
      .limit(1)

    if (!membership || membership.length === 0) {
      return new Response(
        JSON.stringify({ error: 'You are not a member of this project' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Pick one of the project's bookings as the booking_id for backwards compatibility
    const { data: lpBooking } = await supabase
      .from('large_project_bookings')
      .select('booking_id')
      .eq('large_project_id', projectId)
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()

    if (lpBooking) {
      resolvedBookingId = lpBooking.booking_id
    } else {
      return new Response(
        JSON.stringify({ error: 'Project has no linked bookings' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } else if (booking_id && booking_id.startsWith('location-')) {
    // Location timers: resolve to the internal project's booking_id
    const locationId = booking_id.replace('location-', '')
    const { data: locData } = await supabase
      .from('organization_locations')
      .select('id')
      .eq('id', locationId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle()

    if (!locData) {
      return new Response(
        JSON.stringify({ error: 'Location not found or not active' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find the internal project linked to this location
    const { data: internalProject } = await supabase
      .from('projects')
      .select('id, booking_id')
      .eq('location_id', locationId)
      .eq('organization_id', organizationId)
      .eq('is_internal', true)
      .limit(1)
      .maybeSingle()

    if (internalProject?.booking_id) {
      resolvedBookingId = internalProject.booking_id
    } else if (internalProject) {
      // Internal project without booking (e.g. "Lager") — use location_id
      resolvedBookingId = null
      resolvedLocationId = locationId
      console.log(`Internal project ${internalProject.id} for location ${locationId} has no booking_id — saving with location_id`)
    } else {
      console.error(`No internal project found for location ${locationId}`)
      return new Response(
        JSON.stringify({ error: 'Ingen intern bokning hittades för denna plats. Kontakta admin.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } else if (booking_id) {
    // Verify staff is assigned to this booking via booking_staff_assignments (single source of truth)
    const { data: assignment } = await supabase
      .from('booking_staff_assignments')
      .select('id')
      .eq('staff_id', staffId)
      .eq('booking_id', booking_id)
      .limit(1)

    if (!assignment || assignment.length === 0) {
      return new Response(
        JSON.stringify({ error: 'You are not assigned to this booking' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } else if (large_project_id) {
    // No booking_id provided, just large_project_id — verify membership
    resolvedLargeProjectId = large_project_id
    const { data: projectData } = await supabase
      .from('large_projects')
      .select('id')
      .eq('id', large_project_id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (!projectData) {
      return new Response(
        JSON.stringify({ error: 'Project not found' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: membership } = await supabase
      .from('large_project_staff')
      .select('id')
      .eq('large_project_id', large_project_id)
      .eq('staff_id', staffId)
      .limit(1)

    if (!membership || membership.length === 0) {
      return new Response(
        JSON.stringify({ error: 'You are not a member of this project' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // === Soft idempotency (PROMPT 4 — Avsluta dag) ===
  // The mobile "End Day" flow MUST never lose time. If the network drops
  // between a successful insert and the response reaching the client, the
  // client retries via saveAndStopTimer. Without this guard the retry
  // hits the overlap check below and returns a confusing 409, leaving
  // the timer alive locally even though the report is safe on the server.
  //
  // We treat any time_report from the same staff with the IDENTICAL
  // key fields (booking_id/large_project_id, report_date, start_time,
  // end_time, hours_worked) created in the last 90 seconds as a duplicate
  // of THIS request — return it as success so the client can clear the
  // timer instead of retrying forever. 90 s comfortably covers realistic
  // mobile network timeouts (typical fetch timeout ≤ 30 s).
  try {
    const cutoffIso = new Date(Date.now() - 90_000).toISOString()
    let dedupeQuery = supabase
      .from('time_reports')
      .select('*')
      .eq('staff_id', staffId)
      .eq('report_date', report_date)
      .eq('start_time', start_time)
      .eq('end_time', end_time)
      .eq('hours_worked', calculatedHours)
      .gte('created_at', cutoffIso)
      .limit(1)

    if (resolvedBookingId) {
      dedupeQuery = dedupeQuery.eq('booking_id', resolvedBookingId)
    } else {
      dedupeQuery = dedupeQuery.is('booking_id', null)
    }
    if (resolvedLargeProjectId) {
      dedupeQuery = dedupeQuery.eq('large_project_id', resolvedLargeProjectId)
    } else {
      dedupeQuery = dedupeQuery.is('large_project_id', null)
    }

    const { data: existing } = await dedupeQuery.maybeSingle()
    if (existing) {
      console.log(`[create_time_report] idempotent hit — returning existing ${existing.id} for staff ${staffId}`)
      return new Response(
        JSON.stringify({ success: true, time_report: existing, idempotent: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (dedupeErr) {
    // Non-fatal — fall through to normal create path. Better to risk
    // returning a 409 than to drop the user's time entirely.
    console.warn('[create_time_report] dedupe lookup failed:', dedupeErr)
  }

  // === Overlap check (CREATE) ===
  // Same robust datetime-interval logic as update — handles night shifts and
  // reports stored on neighboring report_dates that bleed into this day.
  // Subdivisions are per-address breakdowns INSIDE a parent project-total's
  // window — they are expected to overlap the parent and must be exempted.
  if (!isSubdivision && start_time && end_time) {
    const newInterval = buildShiftInterval(report_date, start_time, end_time)
    if (newInterval) {
      const baseDate = new Date(`${report_date}T00:00:00Z`)
      const prevDate = new Date(baseDate.getTime() - 86_400_000).toISOString().slice(0, 10)
      const nextDate = new Date(baseDate.getTime() + 86_400_000).toISOString().slice(0, 10)

      const { data: candidates } = await supabase
        .from('time_reports')
        .select('id, report_date, start_time, end_time')
        .eq('staff_id', staffId)
        .in('report_date', [prevDate, report_date, nextDate])
        .eq('is_subdivision', false)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)

      const hasOverlap = (candidates || []).some((r: any) => {
        const other = buildShiftInterval(r.report_date, r.start_time, r.end_time)
        return other ? intervalsOverlap(newInterval, other) : false
      })

      if (hasOverlap) {
        return new Response(
          JSON.stringify({ error: 'Du har redan en tidrapport som överlappar detta tidsintervall (inklusive nattskift över midnatt)' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  // Workday-first guarantee: a time_report can never exist without a
  // workday for the same staff. Anchor the workday at report_date+start_time.
  try {
    const startedAtIso = new Date(`${report_date}T${start_time}:00`).toISOString()
    await ensureOpenWorkdayForTimer(supabase, {
      staff_id: staffId,
      organization_id: organizationId,
      start_at: startedAtIso,
      source: 'create_time_report',
      target: large_project_id
        ? { kind: 'large_project', id: large_project_id }
        : booking_id
          ? { kind: 'booking', id: booking_id }
          : { kind: 'manual' },
    })
  } catch (wdErr: any) {
    console.error('[create_time_report] workday-first failed, aborting:', wdErr)
    return new Response(
      JSON.stringify({ error: 'workday_first_failed', detail: wdErr?.message || String(wdErr) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Create time report — use server-calculated hours
  const { data: report, error } = await supabase
    .from('time_reports')
    .insert({
      staff_id: staffId,
      booking_id: resolvedBookingId,
      report_date,
      start_time,
      end_time,
      hours_worked: calculatedHours,
      overtime_hours: ot,
      break_time: breakHours,
      description: description || null,
      establishment_task_id: establishment_task_id || null,
      large_project_id: resolvedLargeProjectId,
      location_id: resolvedLocationId,
      organization_id: organizationId,
      is_subdivision: isSubdivision,
      parent_time_report_id: isSubdivision ? parentReportId : null,
    })
    .select()
    .single()

  if (error) {
    console.error('Time report creation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create time report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Time report created: ${report.id} by staff ${staffId}${establishment_task_id ? ` (task: ${establishment_task_id})` : ''}`)

  // Link any unlinked anomalies that overlap this report's time range to the new time report
  // This ensures background-tracked absences get associated with the correct work shift,
  // even if they were closed before the report was created.
  try {
    const reportStartIso = `${report_date}T${start_time}:00`
    // For night shifts (end < start), end belongs to next day
    const endsNextDay = end_time < start_time
    const reportEndDate = endsNextDay
      ? new Date(new Date(report_date).getTime() + 86_400_000).toISOString().slice(0, 10)
      : report_date
    const reportEndIso = `${reportEndDate}T${end_time}:00`

    await supabase
      .from('time_report_anomalies')
      .update({ time_report_id: report.id })
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('time_report_id', null)
      .not('ended_at', 'is', null)
      .gte('started_at', reportStartIso)
      .lte('ended_at', reportEndIso)
  } catch (linkErr) {
    console.warn('Failed to link anomalies to time report:', linkErr)
  }

  // Link GPS history rows that fall inside this report's time window so the
  // approval-based retention cleanup can later remove them automatically.
  try {
    const reportStartIso = `${report_date}T${start_time}:00`
    const endsNextDay = end_time < start_time
    const reportEndDate = endsNextDay
      ? new Date(new Date(report_date).getTime() + 86_400_000).toISOString().slice(0, 10)
      : report_date
    const reportEndIso = `${reportEndDate}T${end_time}:00`

    await supabase
      .from('staff_location_history')
      .update({ time_report_id: report.id })
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('time_report_id', null)
      .gte('recorded_at', reportStartIso)
      .lte('recorded_at', reportEndIso)
  } catch (histLinkErr) {
    console.warn('Failed to link location history to time report:', histLinkErr)
  }

  return new Response(
    JSON.stringify({ success: true, time_report: report }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ============================================================================
// ADMIN / WEB TIME-REPORT ENDPOINTS
// ----------------------------------------------------------------------------
// These mirror the mobile create/delete handlers but operate on a target
// staff_id supplied by an admin/projekt user. They enforce:
//   - caller has 'admin' or 'projekt' app_role
//   - same time validation (start/end, break, overtime, hours) as mobile
//   - same datetime overlap check
//   - same approved-lock semantics (DB triggers are the ultimate backstop)
// They are the ONLY web write-path for time_reports — projectStaffService
// must route through here, never write directly.
// ============================================================================

async function callerHasAdminOrProjektRole(supabase: any, callerUserId: string | null): Promise<boolean> {
  if (!callerUserId) return false
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .in('role', ['admin', 'projekt'])
    .limit(1)
  if (error) {
    console.error('[admin-time-report] role check failed:', error)
    return false
  }
  return Array.isArray(data) && data.length > 0
}

async function handleAdminDeleteTimeReport(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  const { time_report_id } = data || {}

  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!time_report_id) {
    return new Response(
      JSON.stringify({ error: 'time_report_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Must exist within the caller's organization (multi-tenant isolation).
  const { data: existing, error: fetchErr } = await supabase
    .from('time_reports')
    .select('id, approved')
    .eq('id', time_report_id)
    .eq('organization_id', organizationId)
    .single()

  if (fetchErr || !existing) {
    return new Response(
      JSON.stringify({ error: 'Time report not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (existing.approved) {
    return new Response(
      JSON.stringify({ error: 'Cannot delete an approved time report' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { error: deleteErr } = await supabase
    .from('time_reports')
    .delete()
    .eq('id', time_report_id)
    .eq('organization_id', organizationId)

  if (deleteErr) {
    console.error('[admin-time-report] delete error:', deleteErr)
    return new Response(
      JSON.stringify({ error: 'Failed to delete time report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[admin-time-report] ${time_report_id} deleted by user ${callerUserId}`)
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleAdminCreateTimeReport(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  const {
    target_staff_id,
    booking_id,
    report_date,
    start_time,
    end_time,
    overtime_hours,
    break_time,
    description,
    establishment_task_id,
    large_project_id,
  } = data || {}

  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!target_staff_id) {
    return new Response(
      JSON.stringify({ error: 'target_staff_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!report_date) {
    return new Response(
      JSON.stringify({ error: 'report_date is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!booking_id && !large_project_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id or large_project_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // --- Same time validation as handleCreateTimeReport ---
  if (!start_time || !end_time) {
    return new Response(
      JSON.stringify({ error: 'start_time och end_time krävs' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const [sh, sm] = String(start_time).split(':').map(Number)
  const [eh, em] = String(end_time).split(':').map(Number)
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) {
    return new Response(
      JSON.stringify({ error: 'Ogiltigt tidsformat' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const startMinutes = sh * 60 + sm
  const endMinutes = eh * 60 + em
  if (startMinutes === endMinutes) {
    return new Response(
      JSON.stringify({ error: 'Sluttid kan inte vara samma som starttid' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const breakHours = break_time ? parseFloat(break_time) : 0
  const breakMinutes = breakHours * 60
  if (breakHours < 0 || breakMinutes > 240) {
    return new Response(
      JSON.stringify({ error: 'Ogiltig rast (0–240 min)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  const ot = overtime_hours ? parseFloat(overtime_hours) : 0
  if (ot < 0) {
    return new Response(
      JSON.stringify({ error: 'Övertid kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  let rawHours = (eh + em / 60) - (sh + sm / 60)
  if (rawHours < 0) rawHours += 24
  const calculatedHours = Math.round((rawHours - breakHours) * 100) / 100
  if (calculatedHours <= 0 || calculatedHours > 16) {
    return new Response(
      JSON.stringify({ error: 'Arbetad tid efter rast måste vara 0–16h' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Verify target staff belongs to caller's organization (tenant isolation).
  const { data: targetStaff } = await supabase
    .from('staff_members')
    .select('id, organization_id')
    .eq('id', target_staff_id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!targetStaff) {
    return new Response(
      JSON.stringify({ error: 'Target staff not found in your organization' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Resolve booking / large_project (booking is the only supported web case
  // today — admin web does not need location- or project- prefixed timers).
  let resolvedBookingId: string | null = booking_id || null
  let resolvedLargeProjectId: string | null = large_project_id || null
  if (resolvedBookingId) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('id')
      .eq('id', resolvedBookingId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (!bk) {
      return new Response(
        JSON.stringify({ error: 'Booking not found in your organization' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // Same datetime overlap check as create/update — handles night shifts.
  const newInterval = buildShiftInterval(report_date, start_time, end_time)
  if (newInterval) {
    const baseDate = new Date(`${report_date}T00:00:00Z`)
    const prevDate = new Date(baseDate.getTime() - 86_400_000).toISOString().slice(0, 10)
    const nextDate = new Date(baseDate.getTime() + 86_400_000).toISOString().slice(0, 10)

    const { data: candidates } = await supabase
      .from('time_reports')
      .select('id, report_date, start_time, end_time')
      .eq('staff_id', target_staff_id)
      .in('report_date', [prevDate, report_date, nextDate])
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)

    const hasOverlap = (candidates || []).some((r: any) => {
      const other = buildShiftInterval(r.report_date, r.start_time, r.end_time)
      return other ? intervalsOverlap(newInterval, other) : false
    })
    if (hasOverlap) {
      return new Response(
        JSON.stringify({ error: 'Personalen har redan en tidrapport som överlappar detta tidsintervall' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const { data: report, error } = await supabase
    .from('time_reports')
    .insert({
      staff_id: target_staff_id,
      booking_id: resolvedBookingId,
      report_date,
      start_time,
      end_time,
      hours_worked: calculatedHours,
      overtime_hours: ot,
      break_time: breakHours,
      description: description || null,
      establishment_task_id: establishment_task_id || null,
      large_project_id: resolvedLargeProjectId,
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    console.error('[admin-time-report] insert error:', error)
    // DB-trigger overlap/approved violations surface here as well.
    const msg = (error as any)?.message || 'Failed to create time report'
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[admin-time-report] ${report.id} created by user ${callerUserId} for staff ${target_staff_id}`)
  return new Response(
    JSON.stringify({ success: true, time_report: report }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ----------------------------------------------------------------------------
// admin_update_time_report
// Edit start/end/break/overtime/description on ANY staff member's
// time_report. Mirrors `update_time_report` but with admin role-check
// and a `force` flag that lets admin bypass the approved-lock (logged).
// ----------------------------------------------------------------------------
async function handleAdminUpdateTimeReport(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  const {
    time_report_id,
    start_time,
    end_time,
    overtime_hours,
    break_time,
    description,
    force,
  } = data || {}

  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!time_report_id) {
    return new Response(
      JSON.stringify({ error: 'time_report_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('time_reports')
    .select('id, staff_id, approved, hours_worked, overtime_hours, break_time, start_time, end_time, description, organization_id, report_date')
    .eq('id', time_report_id)
    .eq('organization_id', organizationId)
    .single()

  if (fetchErr || !existing) {
    return new Response(
      JSON.stringify({ error: 'Time report not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (existing.approved && !force) {
    return new Response(
      JSON.stringify({ error: 'Tidrapporten är attesterad. Skicka force=true för att åsidosätta.' , approved_lock: true }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const finalStartTime = start_time !== undefined ? start_time : existing.start_time
  const finalEndTime = end_time !== undefined ? end_time : existing.end_time
  const finalBreak = break_time !== undefined ? parseFloat(break_time) : Number(existing.break_time || 0)
  const finalOvertime = overtime_hours !== undefined ? parseFloat(overtime_hours) : Number(existing.overtime_hours || 0)

  if (isNaN(finalBreak) || finalBreak < 0 || finalBreak * 60 > 240) {
    return new Response(
      JSON.stringify({ error: 'Ogiltig rast (0–240 min)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (isNaN(finalOvertime) || finalOvertime < 0 || finalOvertime > 16) {
    return new Response(
      JSON.stringify({ error: 'Ogiltig övertid (0–16 h)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let calculatedHours: number | null = null
  if (finalStartTime && finalEndTime) {
    const [sh, sm] = String(finalStartTime).split(':').map(Number)
    const [eh, em] = String(finalEndTime).split(':').map(Number)
    if (![sh, sm, eh, em].every(Number.isFinite)) {
      return new Response(
        JSON.stringify({ error: 'Ogiltigt tidsformat' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (sh * 60 + sm === eh * 60 + em) {
      return new Response(
        JSON.stringify({ error: 'Sluttid kan inte vara samma som starttid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    let rawHours = (eh + em / 60) - (sh + sm / 60)
    if (rawHours < 0) rawHours += 24
    calculatedHours = Math.round((rawHours - finalBreak) * 100) / 100
    if (calculatedHours <= 0 || calculatedHours > 16) {
      return new Response(
        JSON.stringify({ error: 'Arbetad tid efter rast måste vara 0–16h' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  const previousValues: Record<string, any> = {}
  const newValues: Record<string, any> = {}
  const updates: Record<string, any> = {}

  if (calculatedHours !== null && calculatedHours !== existing.hours_worked) {
    previousValues.hours_worked = existing.hours_worked
    newValues.hours_worked = calculatedHours
    updates.hours_worked = calculatedHours
  }
  if (finalOvertime !== Number(existing.overtime_hours || 0)) {
    previousValues.overtime_hours = existing.overtime_hours || 0
    newValues.overtime_hours = finalOvertime
    updates.overtime_hours = finalOvertime
  }
  if (finalBreak !== Number(existing.break_time || 0)) {
    previousValues.break_time = existing.break_time || 0
    newValues.break_time = finalBreak
    updates.break_time = finalBreak
  }
  if (start_time !== undefined && start_time !== existing.start_time) {
    previousValues.start_time = existing.start_time
    newValues.start_time = start_time || null
    updates.start_time = start_time || null
  }
  if (end_time !== undefined && end_time !== existing.end_time) {
    previousValues.end_time = existing.end_time
    newValues.end_time = end_time || null
    updates.end_time = end_time || null
  }
  if (description !== undefined && description !== existing.description) {
    previousValues.description = existing.description
    newValues.description = description || null
    updates.description = description || null
  }

  if (Object.keys(updates).length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: 'No changes' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Overlap-check (skip for force=approved-override to ease historical fixes)
  if (finalStartTime && finalEndTime && !force) {
    const newInterval = buildShiftInterval(existing.report_date, finalStartTime, finalEndTime)
    if (newInterval) {
      const baseDate = new Date(`${existing.report_date}T00:00:00Z`)
      const prevDate = new Date(baseDate.getTime() - 86_400_000).toISOString().slice(0, 10)
      const nextDate = new Date(baseDate.getTime() + 86_400_000).toISOString().slice(0, 10)
      const { data: candidates } = await supabase
        .from('time_reports')
        .select('id, report_date, start_time, end_time')
        .eq('staff_id', existing.staff_id)
        .neq('id', time_report_id)
        .in('report_date', [prevDate, existing.report_date, nextDate])
        .eq('is_subdivision', false)
        .not('start_time', 'is', null)
        .not('end_time', 'is', null)
      const hasOverlap = (candidates || []).some((r: any) => {
        const other = buildShiftInterval(r.report_date, r.start_time, r.end_time)
        return other ? intervalsOverlap(newInterval, other) : false
      })
      if (hasOverlap) {
        return new Response(
          JSON.stringify({ error: 'Personalen har redan en tidrapport som överlappar detta tidsintervall' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from('time_reports')
    .update(updates)
    .eq('id', time_report_id)
    .select()
    .single()

  if (updateErr) {
    console.error('[admin-update-time-report] update error:', updateErr)
    return new Response(
      JSON.stringify({ error: updateErr.message || 'Failed to update time report' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Audit log
  await supabase.from('time_report_edit_log').insert({
    time_report_id,
    edited_by_type: 'admin',
    edited_by_name: 'Admin (web)',
    edited_by_id: callerUserId,
    previous_values: { ...previousValues, _approved_override: !!(existing.approved && force) },
    new_values: newValues,
    organization_id: organizationId,
  })

  console.log(`[admin-update-time-report] ${time_report_id} updated by ${callerUserId} (force=${!!force}, approved=${!!existing.approved})`)
  return new Response(
    JSON.stringify({ success: true, time_report: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ----------------------------------------------------------------------------
// admin_close_open_entry
// Close a still-open `location_time_entries` or `travel_time_logs` row
// (i.e. "Stoppa pågående timer") for any staff member. The mobile-side
// `useGeofencing` save-then-stop path is for the device that owns the
// timer; admin needs a separate verb to terminate orphaned timers.
//
// Body: { table: 'location_time_entries' | 'travel_time_logs', id, end_iso }
// ----------------------------------------------------------------------------
async function handleAdminCloseOpenEntry(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  const { table, id, end_iso } = data || {}

  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!id || !end_iso) {
    return new Response(
      JSON.stringify({ error: 'id and end_iso required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (table !== 'location_time_entries' && table !== 'travel_time_logs') {
    return new Response(
      JSON.stringify({ error: 'table must be location_time_entries or travel_time_logs' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const endDate = new Date(end_iso)
  if (isNaN(endDate.getTime())) {
    return new Response(
      JSON.stringify({ error: 'Invalid end_iso' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (table === 'location_time_entries') {
    const { data: row, error: fErr } = await supabase
      .from('location_time_entries')
      .select('id, entered_at, exited_at, organization_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()
    if (fErr || !row) {
      return new Response(JSON.stringify({ error: 'Entry not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (row.exited_at) {
      return new Response(JSON.stringify({ error: 'Entry already closed' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (endDate.getTime() <= new Date(row.entered_at).getTime()) {
      return new Response(JSON.stringify({ error: 'Sluttiden måste vara efter starttiden' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { error: uErr } = await supabase
      .from('location_time_entries')
      .update({
        exited_at: end_iso,
        stop_source: 'admin_manual',
        stop_reason: 'admin_adjustment',
        stopped_by: data?.actor_id || 'admin',
        stop_metadata: { closed_via: 'admin-close-open-entry', end_iso },
      })
      .eq('id', id)
    if (uErr) {
      console.error('[admin-close-open-entry] LTE update error:', uErr)
      return new Response(JSON.stringify({ error: uErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } else {
    const { data: row, error: fErr } = await supabase
      .from('travel_time_logs')
      .select('id, start_time, end_time, organization_id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single()
    if (fErr || !row) {
      return new Response(JSON.stringify({ error: 'Travel log not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (row.end_time) {
      return new Response(JSON.stringify({ error: 'Travel log already closed' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const startMs = row.start_time ? new Date(row.start_time).getTime() : 0
    if (endDate.getTime() <= startMs) {
      return new Response(JSON.stringify({ error: 'Sluttiden måste vara efter starttiden' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const hours = Math.round(((endDate.getTime() - startMs) / 3_600_000) * 100) / 100
    const { error: uErr } = await supabase
      .from('travel_time_logs')
      .update({ end_time: end_iso, hours_worked: hours })
      .eq('id', id)
    if (uErr) {
      console.error('[admin-close-open-entry] travel update error:', uErr)
      return new Response(JSON.stringify({ error: uErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  console.log(`[admin-close-open-entry] ${table} ${id} closed by ${callerUserId} at ${end_iso}`)
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProject(supabase: any, data: { booking_id: string }, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: project, error } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      project_leader,
      booking_id,
      created_at
    `)
    .eq('booking_id', booking_id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('Project query error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch project' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ project: project || null }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreatePurchase(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id, description, amount, supplier, category, receipt_image } = data

  if (!booking_id || !description || amount === undefined) {
    return new Response(
      JSON.stringify({ error: 'booking_id, description, and amount are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name for created_by
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .single()

  // Get project (normal/medium) for this booking
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (projectError) {
    console.error('Project lookup error:', projectError)
    return new Response(
      JSON.stringify({ error: 'Failed to find project for booking' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // If no normal project, check if booking belongs to a large project
  let largeProjectId: string | null = null
  if (!project) {
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('large_project_id')
      .eq('id', booking_id)
      .maybeSingle()
    if (bookingError) {
      console.error('Booking lookup error:', bookingError)
      return new Response(
        JSON.stringify({ error: 'Failed to look up booking' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (booking?.large_project_id) {
      largeProjectId = booking.large_project_id
    } else {
      return new Response(
        JSON.stringify({ error: 'No project found for this booking' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // Folder for receipt storage — project.id for normal, large_project_id for large
  const storageFolderId = project?.id || largeProjectId!

  let receiptUrl = null

  // Handle receipt image upload
  if (receipt_image) {
    try {
      // Extract base64 data
      const base64Data = receipt_image.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      
      // Determine file extension
      let extension = 'jpg'
      if (receipt_image.includes('image/png')) {
        extension = 'png'
      } else if (receipt_image.includes('image/webp')) {
        extension = 'webp'
      }

      const fileName = `receipts/${storageFolderId}/${Date.now()}-receipt.${extension}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(fileName, imageBuffer, {
          contentType: `image/${extension}`,
          upsert: false
        })

      if (uploadError) {
        console.error('Receipt upload error:', uploadError)
      } else {
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('project-files')
          .getPublicUrl(fileName)
        receiptUrl = urlData.publicUrl
      }
    } catch (uploadErr) {
      console.error('Receipt processing error:', uploadErr)
    }
  }

  // Create purchase record — route to large_project_purchases for large projects,
  // otherwise to project_purchases for normal/medium projects.
  let purchase: any = null
  let insertError: any = null
  if (largeProjectId) {
    const res = await supabase
      .from('large_project_purchases')
      .insert({
        large_project_id: largeProjectId,
        description,
        amount: parseFloat(amount),
        supplier: supplier || null,
        category: category || 'other',
        receipt_url: receiptUrl,
        purchase_date: new Date().toISOString().split('T')[0],
        created_by: staffMember?.name || 'Mobile App',
        organization_id: organizationId,
      })
      .select()
      .single()
    purchase = res.data
    insertError = res.error
  } else {
    const res = await supabase
      .from('project_purchases')
      .insert({
        project_id: project!.id,
        description,
        amount: parseFloat(amount),
        supplier: supplier || null,
        category: category || 'other',
        receipt_url: receiptUrl,
        purchase_date: new Date().toISOString().split('T')[0],
        created_by: staffMember?.name || 'Mobile App',
        organization_id: organizationId,
      })
      .select()
      .single()
    purchase = res.data
    insertError = res.error
  }

  if (insertError) {
    console.error('Purchase creation error:', insertError)
    return new Response(
      JSON.stringify({ error: 'Failed to create purchase' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Purchase created: ${purchase.id} for ${largeProjectId ? `large_project ${largeProjectId}` : `project ${project!.id}`}`)

  // Sync purchase to EventFlow booking module
  try {
    const efUrl = Deno.env.get('EF_SUPABASE_URL');
    const planningApiKey = Deno.env.get('PLANNING_API_KEY');

    if (efUrl && planningApiKey) {
      const qs = new URLSearchParams({ type: 'purchases', booking_id });
      await fetch(`${efUrl}/functions/v1/planning-api?${qs.toString()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': planningApiKey,
        },
        body: JSON.stringify({
          description,
          amount: parseFloat(amount),
          supplier: supplier || null,
          category: category || 'other',
          receipt_url: receiptUrl,
          purchase_date: new Date().toISOString().split('T')[0],
          created_by: staffMember?.name || 'Mobile App',
        }),
      });
      console.log('Purchase synced to EventFlow for booking', booking_id);
    }
  } catch (syncErr) {
    console.error('EventFlow sync failed (purchase saved locally):', syncErr);
  }

  return new Response(
    JSON.stringify({ success: true, purchase }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreateComment(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id, content } = data

  if (!booking_id || !content) {
    return new Response(
      JSON.stringify({ error: 'booking_id and content are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .single()

  // Get project for this booking
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (projectError || !project) {
    return new Response(
      JSON.stringify({ error: 'No project found for this booking' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // project_comments-tabellen är borttagen — anslagstavlan är nu `internalnotes`.
  // Appenda meddelandet med tidsstämpel + författare.
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const author = staffMember?.name || 'Mobile App User'
  const newLine = `${stamp} ${author}: ${content}`

  const { data: existing } = await supabase
    .from('projects')
    .select('internalnotes')
    .eq('id', project.id)
    .maybeSingle()
  const merged = existing?.internalnotes
    ? `${existing.internalnotes}\n${newLine}`
    : newLine

  const { error } = await supabase
    .from('projects')
    .update({ internalnotes: merged })
    .eq('id', project.id)

  const comment = { id: crypto.randomUUID(), content, author_name: author, created_at: new Date().toISOString() }

  if (error) {
    console.error('Comment creation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create comment' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Comment created: ${comment.id} for project ${project.id}`)

  return new Response(
    JSON.stringify({ success: true, comment }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUploadFile(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id, file_name, file_type, file_data } = data

  if (!booking_id || !file_name || !file_data) {
    return new Response(
      JSON.stringify({ error: 'booking_id, file_name, and file_data are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (file_type && !allowedTypes.includes(file_type)) {
    return new Response(
      JSON.stringify({ error: 'File type not allowed. Allowed: JPEG, PNG, WebP, PDF' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .single()

  // Get project for this booking (optional – fallback to booking_attachments)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  try {
    // Extract base64 data
    const base64Match = file_data.match(/^data:(.+);base64,(.+)$/)
    let fileBuffer: Uint8Array
    let contentType = file_type || 'application/octet-stream'

    if (base64Match) {
      contentType = base64Match[1]
      fileBuffer = Uint8Array.from(atob(base64Match[2]), c => c.charCodeAt(0))
    } else {
      fileBuffer = Uint8Array.from(atob(file_data), c => c.charCodeAt(0))
    }

    // Check file size (max 10MB)
    if (fileBuffer.length > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'File too large. Maximum size is 10MB' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sanitize filename: remove special chars, spaces, and non-ASCII to avoid InvalidKey errors
    const sanitizedName = file_name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics (ä->a, ö->o)
      .replace(/[^a-zA-Z0-9._-]/g, '_') // replace anything not alphanumeric/dot/dash/underscore
      .replace(/_+/g, '_') // collapse multiple underscores

    // Use project id if available, otherwise booking_id as folder
    const folderKey = project ? project.id : booking_id
    const storagePath = `${folderKey}/${Date.now()}-${sanitizedName}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false
      })

    if (uploadError) {
      console.error('File upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload file' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('project-files')
      .getPublicUrl(storagePath)

    if (project) {
      // Save to project_files table
      const { data: fileRecord, error: fileError } = await supabase
        .from('project_files')
        .insert({
          project_id: project.id,
          file_name,
          file_type: contentType,
          url: urlData.publicUrl,
          uploaded_by: staffMember?.name || 'Mobile App User',
          organization_id: organizationId
        })
        .select()
        .single()

      if (fileError) {
        console.error('File record creation error:', fileError)
        return new Response(
          JSON.stringify({ error: 'Failed to create file record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`File uploaded: ${fileRecord.id} for project ${project.id}`)
      return new Response(
        JSON.stringify({ success: true, file: fileRecord }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Fallback: save to booking_attachments
      const { data: attachment, error: attError } = await supabase
        .from('booking_attachments')
        .insert({
          booking_id,
          file_name,
          file_type: contentType,
          url: urlData.publicUrl,
          source: 'mobile',
          organization_id: organizationId
        })
        .select()
        .single()

      if (attError) {
        console.error('Attachment record creation error:', attError)
        return new Response(
          JSON.stringify({ error: 'Failed to create file record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`File uploaded as attachment: ${attachment.id} for booking ${booking_id}`)
      return new Response(
        JSON.stringify({ success: true, file: attachment }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (err) {
    console.error('File processing error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to process file' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// ==================== COMPREHENSIVE JOB DETAILS HANDLER ====================

async function handleGetBookingDetails(supabase: any, staffId: string, data: { booking_id: string }, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Handle synthetic location-project IDs (e.g. "location-{uuid}") ──
  const locationMatch = booking_id.match(/^location-(.+)$/)
  if (locationMatch) {
    const locationId = locationMatch[1]
    const { data: loc, error: locError } = await supabase
      .from('organization_locations')
      .select('id, name, address, latitude, longitude, radius_meters')
      .eq('id', locationId)
      .eq('organization_id', organizationId)
      .single()

    if (locError || !loc) {
      return new Response(
        JSON.stringify({ error: 'Location not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch time reports for this synthetic booking
    const { data: myTimeReports } = await supabase
      .from('time_reports')
      .select('id, report_date, start_time, end_time, hours_worked, overtime_hours, break_time, description')
      .eq('booking_id', booking_id)
      .eq('staff_id', staffId)
      .order('report_date', { ascending: false })

    // Build synthetic booking response
    const syntheticBooking = {
      id: booking_id,
      client: loc.name,
      booking_number: null,
      status: 'active',
      deliveryaddress: loc.address,
      delivery_city: null,
      delivery_postal_code: null,
      delivery_latitude: loc.latitude,
      delivery_longitude: loc.longitude,
      rigdaydate: null,
      eventdate: null,
      rigdowndate: null,
      rig_start_time: null,
      rig_end_time: null,
      event_start_time: null,
      event_end_time: null,
      rigdown_start_time: null,
      rigdown_end_time: null,
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      carry_more_than_10m: null,
      ground_nails_allowed: null,
      exact_time_needed: null,
      exact_time_info: null,
      internalnotes: null,
      assigned_project_id: null,
      assigned_project_name: null,
      assigned_to_project: false,
      created_at: null,
      updated_at: null,
      products: [],
      attachments: [],
      is_location_project: true,
      location_id: loc.id,
    }

    console.log(`Location-project details fetched: ${booking_id} (${loc.name}) for staff ${staffId}`)

    return new Response(
      JSON.stringify({
        booking: syntheticBooking,
        planning: { assigned_staff: [], calendar_events: [] },
        project: null,
        my_time_reports: myTimeReports || [],
        establishment_tasks: [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Regular booking flow ──

  // Verify staff is assigned to this booking
  const { data: assignment, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('id')
    .eq('staff_id', staffId)
    .eq('booking_id', booking_id)
    .limit(1)

  if (assignmentError || !assignment || assignment.length === 0) {
    return new Response(
      JSON.stringify({ error: 'You are not assigned to this booking' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch complete booking details
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      client,
      booking_number,
      status,
      deliveryaddress,
      delivery_city,
      delivery_postal_code,
      delivery_latitude,
      delivery_longitude,
      rigdaydate,
      eventdate,
      rigdowndate,
      rig_start_time,
      rig_end_time,
      event_start_time,
      event_end_time,
      rigdown_start_time,
      rigdown_end_time,
      contact_name,
      contact_phone,
      contact_email,
      carry_more_than_10m,
      ground_nails_allowed,
      exact_time_needed,
      exact_time_info,
      internalnotes,
      assigned_project_id,
      assigned_project_name,
      assigned_to_project,
      created_at,
      updated_at
    `)
    .eq('id', booking_id)
    .single()

  if (bookingError || !booking) {
    console.error('Booking fetch error:', bookingError)
    return new Response(
      JSON.stringify({ error: 'Booking not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch products (include hierarchy fields for grouping, parents first)
  const { data: products } = await supabase
    .from('booking_products')
    .select('id, name, quantity, notes, parent_product_id, parent_package_id, is_package_component')
    .eq('booking_id', booking_id)
    .order('parent_product_id', { ascending: true, nullsFirst: true })
    .order('parent_package_id', { ascending: true, nullsFirst: true })

  // Fetch attachments
  const { data: attachments } = await supabase
    .from('booking_attachments')
    .select('id, url, file_name, file_type, uploaded_at')
    .eq('booking_id', booking_id)

  // Fetch all staff assigned to this booking (for all dates)
  const { data: staffAssignments } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id, team_id, assignment_date')
    .eq('booking_id', booking_id)

  // Get unique staff IDs and fetch their details
  const staffIds = [...new Set((staffAssignments || []).map((a: any) => a.staff_id))]
  let assignedStaff: any[] = []
  if (staffIds.length > 0) {
    const { data: staffMembers } = await supabase
      .from('staff_members')
      .select('id, name, phone, email, role, color')
      .in('id', staffIds)

    assignedStaff = (staffMembers || []).map((staff: any) => {
      const staffDates = (staffAssignments || [])
        .filter((a: any) => a.staff_id === staff.id)
        .map((a: any) => ({ date: a.assignment_date, team_id: a.team_id }))
      return { ...staff, assignments: staffDates }
    })
  }

  // Fetch calendar events for this booking
  const { data: calendarEvents } = await supabase
    .from('calendar_events')
    .select('id, title, event_type, resource_id, start_time, end_time, delivery_address')
    .eq('booking_id', booking_id)
    .order('start_time', { ascending: true })

  // Fetch project if exists
  let project = null
  let projectTasks: any[] = []
  let projectComments: any[] = []
  let projectFiles: any[] = []
  let projectPurchases: any[] = []

  const { data: projectData } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      project_leader,
      created_at,
      updated_at
    `)
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (projectData) {
    project = projectData

    // Fetch project tasks
    const { data: tasks } = await supabase
      .from('project_tasks')
      .select('id, title, description, assigned_to, deadline, completed, sort_order, is_info_only')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true })
    projectTasks = tasks || []

    // project_comments borttagen — anslagstavla finns på projects.internalnotes
    projectComments = []

    // Fetch project files
    const { data: files } = await supabase
      .from('project_files')
      .select('id, file_name, file_type, url, uploaded_by, uploaded_at')
      .eq('project_id', project.id)
      .order('uploaded_at', { ascending: false })
    projectFiles = files || []

    // Fetch project purchases
    const { data: purchases } = await supabase
      .from('project_purchases')
      .select('id, description, amount, supplier, category, receipt_url, purchase_date, created_by')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
    projectPurchases = purchases || []
  }

  // Fetch time reports for this booking by current staff member
  const { data: myTimeReports } = await supabase
    .from('time_reports')
    .select('id, report_date, start_time, end_time, hours_worked, overtime_hours, break_time, description')
    .eq('booking_id', booking_id)
    .eq('staff_id', staffId)
    .order('report_date', { ascending: false })

  // Fetch establishment tasks for this booking — ONLY activities explicitly
  // marked visible_in_time_app=true AND where the requesting staff is in
  // assigned_to_ids (or legacy assigned_to). Enforces:
  // "Endast tilldelad personal ser aktiviteten i Time-appen."
  const { data: rawEstablishmentTasks } = await supabase
    .from('establishment_tasks')
    .select('id, title, category, start_date, end_date, completed, notes, sort_order, assigned_to, assigned_to_ids, start_time, end_time, status, calendar_event_id, visible_in_time_app, visible_in_project_calendar')
    .eq('booking_id', booking_id)
    .eq('visible_in_time_app', true)
    .or(`assigned_to_ids.cs.{${staffId}},assigned_to.eq.${staffId}`)
    .order('start_date', { ascending: true })
    .order('sort_order', { ascending: true })

  // SAFEGUARD: Normalize tasks — ensure assigned_to_ids is always populated,
  // fix legacy tasks that only have assigned_to, sync completed/status, and
  // tag is_mine for the requesting staff member.
  const establishmentTasks = (rawEstablishmentTasks || []).map((task: any) => {
    const needsFix: Record<string, any> = {}

    if (task.assigned_to && (!task.assigned_to_ids || task.assigned_to_ids.length === 0)) {
      needsFix.assigned_to_ids = [task.assigned_to]
      task.assigned_to_ids = [task.assigned_to]
    }

    if (task.completed && task.status !== 'done') {
      needsFix.status = 'done'
      task.status = 'done'
    } else if (!task.completed && task.status === 'done') {
      needsFix.status = 'not_started'
      task.status = 'not_started'
    }

    if (Object.keys(needsFix).length > 0) {
      supabase.from('establishment_tasks').update(needsFix).eq('id', task.id).then(() => {})
    }

    const ids: string[] = Array.isArray(task.assigned_to_ids) ? task.assigned_to_ids : []
    task.is_mine = ids.includes(staffId) || task.assigned_to === staffId

    return task
  })

  // Construct comprehensive response
  const response = {
    booking: {
      ...booking,
      products: products || [],
      attachments: attachments || []
    },
    planning: {
      assigned_staff: assignedStaff,
      calendar_events: calendarEvents || []
    },
    project: project ? {
      ...project,
      tasks: projectTasks,
      comments: projectComments,
      files: projectFiles,
      purchases: projectPurchases
    } : null,
    my_time_reports: myTimeReports || [],
    establishment_tasks: establishmentTasks || []
  }

  console.log(`Booking details fetched: ${booking_id} for staff ${staffId}`)

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleToggleEstablishmentTask(supabase: any, staffId: string, data: { task_id: string }, organizationId: string) {
  const { task_id } = data
  if (!task_id) {
    return new Response(
      JSON.stringify({ error: 'task_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch and verify the task — include assigned_to_ids for multi-assign check
  const { data: task, error: fetchError } = await supabase
    .from('establishment_tasks')
    .select('id, completed, assigned_to, assigned_to_ids, status')
    .eq('id', task_id)
    .eq('organization_id', organizationId)
    .single()

  if (fetchError || !task) {
    return new Response(
      JSON.stringify({ error: 'Task not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const assignedIds = (task as any).assigned_to_ids as string[] | null;
  const isAssigned = (assignedIds && assignedIds.includes(staffId)) || task.assigned_to === staffId;
  if (!isAssigned) {
    return new Response(
      JSON.stringify({ error: 'You are not assigned to this task' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const newCompleted = !task.completed
  const newStatus = newCompleted ? 'done' : 'not_started'
  const { error: updateError } = await supabase
    .from('establishment_tasks')
    .update({ completed: newCompleted, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', task_id)

  if (updateError) {
    console.error('Toggle task error:', updateError)
    return new Response(
      JSON.stringify({ error: 'Failed to update task' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, completed: newCompleted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProjectComments(supabase: any, data: { booking_id: string }, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (!project) {
    return new Response(
      JSON.stringify({ error: 'No project found for this booking' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // project_comments borttagen — returnera tom lista. Anslagstavla finns på projects.internalnotes
  const comments: any[] = []

  return new Response(
    JSON.stringify({ comments: comments || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProjectFiles(supabase: any, data: { booking_id: string }, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Fetch project files
  let projectFiles: any[] = []
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (project) {
    const { data: files } = await supabase
      .from('project_files')
      .select('id, file_name, file_type, url, uploaded_by, uploaded_at')
      .eq('project_id', project.id)
      .order('uploaded_at', { ascending: false })
    projectFiles = files || []
  }

  // Fetch booking attachments (imported product images etc.)
  const { data: bookingAttachments } = await supabase
    .from('booking_attachments')
    .select('id, file_name, file_type, url, uploaded_at')
    .eq('booking_id', booking_id)

  // Merge both sources - booking attachments first, then project files
  const allFiles = [
    ...(bookingAttachments || []).map((a: any) => ({
      id: a.id,
      file_name: a.file_name,
      name: a.file_name,
      file_type: a.file_type,
      url: a.url,
      uploaded_at: a.uploaded_at,
      source: 'booking'
    })),
    ...projectFiles.map((f: any) => ({
      ...f,
      name: f.file_name,
      source: 'project'
    }))
  ]

  return new Response(
    JSON.stringify({ files: allFiles }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProjectPurchases(supabase: any, data: { booking_id: string }, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('booking_id', booking_id)
    .maybeSingle()

  if (!project) {
    // No project exists for this booking yet — return empty purchases
    return new Response(
      JSON.stringify({ purchases: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: purchases, error } = await supabase
    .from('project_purchases')
    .select('id, description, amount, supplier, category, receipt_url, purchase_date, created_by, created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch purchases' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ purchases: purchases || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSendMessage(supabase: any, staffId: string, data: any, organizationId: string) {
  const { content, message_type, booking_id } = data

  if (!content || !content.trim()) {
    return new Response(
      JSON.stringify({ error: 'Message content is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  const staffName = staffMember?.name || 'Okänd'

  const { data: message, error } = await supabase
    .from('staff_messages')
    .insert({
      staff_id: staffId,
      staff_name: staffName,
      content: content.trim(),
      message_type: message_type || 'text',
      booking_id: booking_id || null,
      organization_id: organizationId
    })
    .select()
    .single()

  if (error) {
    console.error('Send message error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Message sent by staff ${staffId}: ${message.id}`)

  return new Response(
    JSON.stringify({ success: true, message }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ============= Job Messages Handlers =============

/**
 * Authorization gate for job chat (job_messages).
 * A caller may read/write iff at least ONE of these holds:
 *   1. They are assigned to the job (job_staff_assignments via jobs.booking_id == booking_id)
 *   2. They are assigned to the booking on any date (booking_staff_assignments)
 *   3. They are listed as project staff for the parent large project (large_project_staff)
 *   4. They have planner role (admin / projekt / lager) — checked via has_role()
 * Returns null on success, or a Response on denial / error.
 */
async function assertJobAccess(
  supabase: any,
  bookingId: string,
  staffId: string,
  organizationId: string,
  userId: string | null,
): Promise<Response | null> {
  const deny = () => new Response(
    JSON.stringify({ success: false, error: 'Unauthorized job access' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )

  if (!bookingId) return deny()

  // 4. Planner role (admin/projekt/lager) via has_planning_access RPC if web user
  if (userId) {
    const { data: planner } = await supabase.rpc('has_planning_access', { _user_id: userId })
    if (planner === true) return null
  }

  // 1. job_staff_assignments — jobs row references this booking_id, and staff is assigned to that job
  {
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('organization_id', organizationId)
    const jobIds = (jobRows || []).map((j: any) => j.id)
    if (jobIds.length > 0) {
      const { data: jsa } = await supabase
        .from('job_staff_assignments')
        .select('id')
        .eq('staff_id', staffId)
        .in('job_id', jobIds)
        .limit(1)
      if (jsa && jsa.length > 0) return null
    }
  }

  // 2. booking_staff_assignments — assigned to this booking on any date
  {
    const { data: bsa } = await supabase
      .from('booking_staff_assignments')
      .select('id')
      .eq('booking_id', bookingId)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .limit(1)
    if (bsa && bsa.length > 0) return null
  }

  // 3. large_project_staff — staff is on the parent large project
  {
    const { data: bk } = await supabase
      .from('bookings')
      .select('large_project_id')
      .eq('id', bookingId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (bk?.large_project_id) {
      const { data: lps } = await supabase
        .from('large_project_staff')
        .select('id')
        .eq('large_project_id', bk.large_project_id)
        .eq('staff_id', staffId)
        .limit(1)
      if (lps && lps.length > 0) return null
    }
  }

  return deny()
}

/**
 * Cursor-paginated job-chat messages.
 *
 *   - Initial load (no `before`): returns the latest `limit` messages.
 *   - Load older (`before` = ISO timestamp): returns the next `limit` rows
 *     strictly older than that cursor.
 *
 * The DB query orders DESC (newest first) so we can grab the tail efficiently
 * via `created_at < before`. Results are reversed before returning so the
 * client gets them ASC for natural rendering.
 *
 * `has_more` is true when we filled the page — the next page may be empty
 * but that's cheap to detect on the client.
 */
async function handleGetJobMessages(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { booking_id, before, limit } = data || {}

  if (!booking_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Clamp page size: 30 default, max 100
  const pageSize = Math.min(Math.max(parseInt(String(limit ?? 30), 10) || 30, 1), 100)

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  const ids = [staffId]
  if (userId && userId !== staffId) ids.push(userId)

  // Over-fetch to compensate for client-side per-user archive filtering,
  // so we still return ~pageSize visible rows in most cases.
  const fetchSize = pageSize + 10

  let q = supabase
    .from('job_messages')
    .select('*')
    .eq('booking_id', booking_id)
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(fetchSize)

  if (before && typeof before === 'string') {
    q = q.lt('created_at', before)
  }

  const { data: rows, error } = await q

  if (error) {
    console.error('Get job messages error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch job messages' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Filter out per-user-archived messages (DM-style is_archived_by)
  const visible = (rows || []).filter((m: any) => {
    const arr = Array.isArray(m.is_archived_by) ? m.is_archived_by : []
    return !ids.some(id => arr.includes(id))
  })

  // Trim to the requested page size after archive filtering
  const trimmed = visible.slice(0, pageSize)
  // Return ASC so the UI can append at the bottom / prepend on load-older
  const messages = trimmed.slice().reverse()

  // We over-fetched; if the unfiltered result reached the over-fetch size,
  // there may be more rows beyond the cursor.
  const has_more = (rows?.length || 0) >= fetchSize
  const next_cursor = messages.length > 0 ? messages[0].created_at : null

  return new Response(
    JSON.stringify({ messages, has_more, next_cursor }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSendJobMessage(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { booking_id, content, file_url, file_name, file_type } = data

  const trimmed = (content || '').trim()
  if (!booking_id || (!trimmed && !file_url)) {
    return new Response(
      JSON.stringify({ success: false, error: 'booking_id and content or attachment are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  const senderName = staffMember?.name || 'Okänd'

  const { data: message, error } = await supabase
    .from('job_messages')
    .insert({
      booking_id,
      sender_id: staffId,
      sender_name: senderName,
      sender_role: 'staff',
      content: trimmed || (file_name ? `📎 ${file_name}` : '📎 Bifogad fil'),
      file_url: file_url || null,
      file_name: file_name || null,
      file_type: file_type || null,
      organization_id: organizationId,
      delivered_at: new Date().toISOString(),
      // Auto-mark as read by sender
      read_by: [staffId, ...(userId && userId !== staffId ? [userId] : [])],
    })
    .select()
    .single()

  if (error) {
    console.error('Send job message error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Failed to send job message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Push notifications to all OTHER team members on this booking ──
  // Resolve recipient set from booking_staff_assignments + job_staff_assignments
  // (matches assertJobAccess scope so anyone with access also gets notified).
  try {
    const recipientIds = new Set<string>()

    // booking_staff_assignments — direct staff on this booking
    const { data: bsa } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .eq('booking_id', booking_id)
      .eq('organization_id', organizationId)
    for (const r of (bsa || [])) if (r.staff_id) recipientIds.add(r.staff_id)

    // job_staff_assignments — staff via the jobs table
    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id')
      .eq('booking_id', booking_id)
      .eq('organization_id', organizationId)
    const jobIds = (jobRows || []).map((j: any) => j.id)
    if (jobIds.length > 0) {
      const { data: jsa } = await supabase
        .from('job_staff_assignments')
        .select('staff_id')
        .in('job_id', jobIds)
      for (const r of (jsa || [])) if (r.staff_id) recipientIds.add(r.staff_id)
    }

    // Exclude sender (and their dual identity)
    recipientIds.delete(staffId)
    if (userId) recipientIds.delete(userId)

    if (recipientIds.size > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const pushBody = buildMessagePreview(content, file_name, file_type)
      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          staff_ids: Array.from(recipientIds),
          title: `${senderName} (jobb)`,
          body: pushBody,
          notification_type: 'message',
          data: { booking_id, chat_type: 'job', sender_id: staffId },
          organization_id: organizationId,
        }),
      })
      const pr = await pushRes.json().catch(() => ({}))
      console.log(`[Job Push] booking=${booking_id} recipients=${recipientIds.size} sent=${pr.sent} failed=${pr.failed}`)
    }
  } catch (pushErr) {
    console.error('[Job Push] failed:', pushErr)
    // Never fail the message send because of a push error.
  }

  return new Response(
    JSON.stringify({ success: true, message }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleMarkJobRead(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { booking_id } = data || {}
  if (!booking_id) {
    return new Response(JSON.stringify({ success: false, error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  const ids = userId && userId !== staffId ? [staffId, userId] : [staffId]

  // Atomic, idempotent, set-based update via SQL function.
  // Replaces the per-row update loop so very long job-chats stay fast,
  // and we never re-write rows that already include the caller in read_by.
  const { data: updated, error } = await supabase.rpc('mark_job_thread_read', {
    _org_id: organizationId,
    _booking_id: booking_id,
    _my_ids: ids,
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, updated: Number(updated) || 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleArchiveJobConversation(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { booking_id } = data || {}
  if (!booking_id) {
    return new Response(JSON.stringify({ success: false, error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  const ids = userId && userId !== staffId ? [staffId, userId] : [staffId]

  // Atomic, idempotent, race-safe single round-trip via SQL function.
  const { data: affected, error } = await supabase.rpc('archive_job_thread', {
    _org_id: organizationId,
    _my_ids: ids,
    _booking_id: booking_id,
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, archived_count: affected ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleUnarchiveJobConversation(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { booking_id } = data || {}
  if (!booking_id) {
    return new Response(JSON.stringify({ success: false, error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  const ids = userId && userId !== staffId ? [staffId, userId] : [staffId]

  const { data: affected, error } = await supabase.rpc('unarchive_job_thread', {
    _org_id: organizationId,
    _my_ids: ids,
    _booking_id: booking_id,
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, unarchived_count: affected ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= Direct Messages Handlers =============

async function handleGetDirectMessages(supabase: any, staffId: string, organizationId: string, userId: string | null) {
  // Build dual-identity filter (same pattern as handleGetInboxAll)
  const ids = [staffId]
  if (userId && userId !== staffId) ids.push(userId)
  const orFilter = ids.map(id => `sender_id.eq.${id},recipient_id.eq.${id}`).join(',')
  const myIds = new Set(ids)

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('Get DMs error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch direct messages' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Group by conversation partner for inbox view
  const conversations = new Map<string, { partner_id: string, partner_name: string, last_message: any, unread_count: number, messages: any[] }>()

  for (const msg of (data || [])) {
    const isSender = myIds.has(msg.sender_id)
    const partnerId = isSender ? msg.recipient_id : msg.sender_id
    const partnerName = isSender ? msg.recipient_name : msg.sender_name

    // Skip self-conversations across identities
    if (myIds.has(partnerId)) continue

    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, {
        partner_id: partnerId,
        partner_name: partnerName,
        last_message: msg,
        unread_count: 0,
        messages: [],
      })
    }

    const conv = conversations.get(partnerId)!
    conv.messages.push(msg)
    if (!msg.is_read && !isSender) {
      conv.unread_count++
    }
  }

  const inbox = Array.from(conversations.values())
    .sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime())

  return new Response(
    JSON.stringify({ conversations: inbox }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Cursor-paginated DM thread between caller and a single partner.
 * Same semantics as handleGetJobMessages: latest first from DB,
 * returned ASC; `before` paginates older.
 */
async function handleGetDMThread(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { partner_id, before, limit } = data || {}
  if (!partner_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'partner_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const pageSize = Math.min(Math.max(parseInt(String(limit ?? 30), 10) || 30, 1), 100)
  const ids = [staffId]
  if (userId && userId !== staffId) ids.push(userId)

  // sender ∈ ids ∧ recipient = partner   OR   sender = partner ∧ recipient ∈ ids
  const idCsv = ids.join(',')
  const orFilter =
    `and(sender_id.in.(${idCsv}),recipient_id.eq.${partner_id}),` +
    `and(sender_id.eq.${partner_id},recipient_id.in.(${idCsv}))`

  const fetchSize = pageSize + 10

  let q = supabase
    .from('direct_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(fetchSize)

  if (before && typeof before === 'string') {
    q = q.lt('created_at', before)
  }

  const { data: rows, error } = await q

  if (error) {
    console.error('Get DM thread error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to fetch DM thread' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Filter per-user archive
  const visible = (rows || []).filter((m: any) => {
    const arr = Array.isArray(m.is_archived_by) ? m.is_archived_by : []
    return !ids.some(id => arr.includes(id))
  })

  const trimmed = visible.slice(0, pageSize)
  const messages = trimmed.slice().reverse()

  const has_more = (rows?.length || 0) >= fetchSize
  const next_cursor = messages.length > 0 ? messages[0].created_at : null

  return new Response(
    JSON.stringify({ messages, has_more, next_cursor }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSendDirectMessage(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { recipient_id, content, file_url, file_name, file_type, booking_id } = data

  const trimmed = (content || '').trim()
  if (!recipient_id || (!trimmed && !file_url)) {
    return new Response(
      JSON.stringify({ error: 'recipient_id and content or attachment are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  const senderName = staffMember?.name || 'Okänd'

  // Resolve recipient name AND validate cross-org isolation in one pass.
  // The recipient_id may be either staff_members.id OR profiles.user_id (planners).
  let recipientName: string | null = null
  const { data: recipientStaff } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', recipient_id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (recipientStaff) {
    recipientName = recipientStaff.name
  } else {
    // Try profiles (planner). MUST be in the same org.
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email, organization_id')
      .eq('user_id', recipient_id)
      .maybeSingle()
    if (profile && profile.organization_id === organizationId) {
      recipientName = profile.full_name || profile.email || 'Planerare'
    }
  }

  if (!recipientName) {
    // Cross-org or unknown recipient — refuse with 403 (don't leak existence).
    return new Response(
      JSON.stringify({ error: 'Recipient not found in your organization' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: message, error } = await supabase
    .from('direct_messages')
    .insert({
      sender_id: staffId,
      sender_name: senderName,
      sender_type: 'staff',
      recipient_id,
      recipient_name: recipientName,
      content: trimmed || (file_name ? `📎 ${file_name}` : '📎 Bifogad fil'),
      file_url: file_url || null,
      file_name: file_name || null,
      file_type: file_type || null,
      booking_id: booking_id || null,
      organization_id: organizationId,
      delivered_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('Send DM error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send direct message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── Trigger push notification to recipient ──
  // Search device_tokens for BOTH recipient_id directly AND via staff_members.user_id mapping
  try {
    console.log(`[DM Push] message created id=${message.id}, sender=${staffId}, recipient=${recipient_id}`)
    
    // Build list of IDs to search device_tokens for
    const recipientSearchIds = [recipient_id]
    // Check if recipient is a planner (auth user) — find their staff_members.id
    const { data: recipientStaffByUserId } = await supabase
      .from('staff_members')
      .select('id')
      .eq('user_id', recipient_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (recipientStaffByUserId && recipientStaffByUserId.id !== recipient_id) {
      recipientSearchIds.push(recipientStaffByUserId.id)
    }
    // Also check reverse: if recipient_id is a staff_members.id, get their user_id
    const { data: recipientStaffRecord } = await supabase
      .from('staff_members')
      .select('user_id')
      .eq('id', recipient_id)
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (recipientStaffRecord?.user_id && recipientStaffRecord.user_id !== recipient_id) {
      recipientSearchIds.push(recipientStaffRecord.user_id)
    }

    const uniqueRecipientIds = [...new Set(recipientSearchIds)]
    
    // Fetch device tokens for all recipient identities
    const { data: tokens, error: tokenErr } = await supabase
      .from('device_tokens')
      .select('token, staff_id, platform')
      .in('staff_id', uniqueRecipientIds)
      .eq('organization_id', organizationId)
    
    console.log(`[DM Push] recipient=${recipient_id} device_tokens_found=${tokens?.length ?? 0}${tokenErr ? ' tokenError=' + tokenErr.message : ''}`)
    
    if (tokens && tokens.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      
      console.log(`[DM Push] calling send-push-notification for ${tokens.length} device(s)`)
      
      // Build a safe push body — never crash on null/undefined content,
      // prefer text preview, fall back to attachment label, cap length.
      const pushBody = buildMessagePreview(content, file_name, file_type)

      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          // Send to ALL resolved identity IDs so push reaches both staff & planner devices.
          staff_ids: uniqueRecipientIds,
          title: `Meddelande från ${senderName}`,
          body: pushBody,
          notification_type: 'message',
          data: { sender_id: staffId, chat_type: 'direct' },
          organization_id: organizationId,
        }),
      })
      
      const pushResult = await pushRes.json()
      console.log(`[DM Push] result: sent=${pushResult.sent}, failed=${pushResult.failed}`)
    } else {
      console.log(`[DM Push] no device tokens for recipient ${recipient_id}, skipping push`)
    }
  } catch (pushErr) {
    console.error('[DM Push] failed to send push notification:', pushErr)
    // Don't fail the DM send if push fails
  }

  return new Response(
    JSON.stringify({ success: true, message }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleMarkDMRead(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { sender_id } = data

  if (!sender_id) {
    return new Response(
      JSON.stringify({ error: 'sender_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Mark read for both identities (staffId and userId)
  const ids = [staffId]
  if (userId && userId !== staffId) ids.push(userId)

  const nowIso = new Date().toISOString()
  const markPromises = ids.map(myId =>
    supabase
      .from('direct_messages')
      .update({ is_read: true, read_at: nowIso })
      .eq('recipient_id', myId)
      .eq('sender_id', sender_id)
      .eq('organization_id', organizationId)
      .is('read_at', null)
  )

  const results = await Promise.all(markPromises)
  const firstError = results.find(r => r.error)?.error

  if (firstError) {
    console.error('Mark DM read error:', firstError)
    return new Response(
      JSON.stringify({ error: 'Failed to mark messages as read' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ============= Broadcast Handlers =============

async function handleGetBroadcasts(supabase: any, staffId: string, organizationId: string) {
  const today = new Date().toISOString().split('T')[0]
  // Fetch broadcasts from the last 7 days so staff sees messages from previous evenings
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('broadcast_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .gte('created_at', `${sevenDaysAgo}T00:00:00`)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Get broadcasts error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch broadcasts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Filter broadcasts relevant to this staff member
  // Get staff's booking assignments for today
  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id')
    .eq('staff_id', staffId)
    .eq('assignment_date', today)
    .eq('organization_id', organizationId)

  const staffBookingIds = new Set((assignments || []).map((a: any) => a.booking_id))

  const relevantBroadcasts = (data || []).filter((b: any) => {
    switch (b.audience) {
      case 'all_today':
        return true // staff is scheduled today (they have assignments)
      case 'active_staff':
        return true // let client filter; server can't know real-time active status perfectly
      case 'job_staff':
        return staffBookingIds.has(b.audience_booking_id)
      case 'selected_staff':
        return (b.audience_staff_ids || []).includes(staffId)
      default:
        return false
    }
  }).map((b: any) => ({
    ...b,
    is_read: (b.is_read_by || []).includes(staffId),
  }))

  return new Response(
    JSON.stringify({ broadcasts: relevantBroadcasts }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Aggregated messaging activity feed for the admin / staff dashboard.
 * Returns recent direct_messages, broadcast_messages and job_messages for the
 * caller's organization in a single round-trip. This is the official path —
 * no frontend service should query these messaging tables directly.
 *
 * Auth: any authenticated caller in the org (web JWT or staff token). The
 * data exposed here is the same the dashboard already showed; access control
 * matches the rest of the messaging stack (org-scoped reads).
 */
async function handleGetMessagingActivity(
  supabase: any,
  organizationId: string,
  data?: { since_hours?: number; limit_per_kind?: number },
) {
  const sinceHours = Math.min(Math.max(data?.since_hours ?? 24, 1), 24 * 7)
  const limit = Math.min(Math.max(data?.limit_per_kind ?? 20, 1), 100)
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  const [dmRes, bcRes, jmRes] = await Promise.all([
    supabase
      .from('direct_messages')
      .select('id, sender_name, recipient_name, content, created_at, sender_type, file_name, file_type')
      .eq('organization_id', organizationId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('broadcast_messages')
      .select('id, sender_name, content, category, audience, created_at')
      .eq('organization_id', organizationId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('job_messages')
      .select('id, sender_name, content, booking_id, created_at, file_name, file_type, bookings!inner(client)')
      .eq('organization_id', organizationId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  if (dmRes.error) console.error('get_messaging_activity dm error:', dmRes.error)
  if (bcRes.error) console.error('get_messaging_activity bc error:', bcRes.error)
  if (jmRes.error) console.error('get_messaging_activity jm error:', jmRes.error)

  return new Response(
    JSON.stringify({
      direct_messages: dmRes.data || [],
      broadcasts: bcRes.data || [],
      job_messages: jmRes.data || [],
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Centralized broadcast send. Frontend never writes to broadcast_messages
 * directly — all writes go through this handler so org-scoping, validation
 * and auth match the rest of the messaging stack.
 */
async function handleSendBroadcast(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const content = typeof data?.content === 'string' ? data.content.trim() : ''
  const audience = data?.audience as string | undefined
  const category = (data?.category as string | undefined) || 'info'
  const audienceBookingId = data?.audience_booking_id ?? null
  const audienceStaffIds = Array.isArray(data?.audience_staff_ids) ? data.audience_staff_ids : null
  const senderName = typeof data?.sender_name === 'string' && data.sender_name.trim().length > 0
    ? data.sender_name.trim()
    : 'Planerare'

  const validAudiences = new Set(['all_today', 'job_staff', 'active_staff', 'selected_staff'])
  const validCategories = new Set(['info', 'weather', 'schedule', 'logistics', 'urgent'])

  if (!content) {
    return new Response(
      JSON.stringify({ error: 'content is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!audience || !validAudiences.has(audience)) {
    return new Response(
      JSON.stringify({ error: 'invalid audience' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!validCategories.has(category)) {
    return new Response(
      JSON.stringify({ error: 'invalid category' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (audience === 'job_staff' && !audienceBookingId) {
    return new Response(
      JSON.stringify({ error: 'audience_booking_id is required for job_staff' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (audience === 'selected_staff' && (!audienceStaffIds || audienceStaffIds.length === 0)) {
    return new Response(
      JSON.stringify({ error: 'audience_staff_ids is required for selected_staff' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: inserted, error } = await supabase
    .from('broadcast_messages')
    .insert({
      organization_id: organizationId,
      sender_id: staffId,
      sender_name: senderName,
      content,
      audience,
      category,
      audience_booking_id: audienceBookingId,
      audience_staff_ids: audienceStaffIds,
    })
    .select('*')
    .single()

  if (error) {
    console.error('send_broadcast error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send broadcast' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, broadcast: inserted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleMarkBroadcastRead(supabase: any, staffId: string, data: any, organizationId: string) {
  const { broadcast_id } = data

  if (!broadcast_id) {
    return new Response(
      JSON.stringify({ error: 'broadcast_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Use atomic array_append via RPC to avoid race conditions
  // Fallback: read-then-write with deduplication
  const { data: broadcast } = await supabase
    .from('broadcast_messages')
    .select('is_read_by')
    .eq('id', broadcast_id)
    .eq('organization_id', organizationId)
    .single()

  if (!broadcast) {
    return new Response(
      JSON.stringify({ error: 'Broadcast not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const readBy: string[] = broadcast.is_read_by || []
  if (!readBy.includes(staffId)) {
    // Use set to deduplicate in case of concurrent writes
    const updatedReadBy = [...new Set([...readBy, staffId])]
    await supabase
      .from('broadcast_messages')
      .update({ is_read_by: updatedReadBy })
      .eq('id', broadcast_id)
      .eq('organization_id', organizationId)
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ==================== PUSH TOKEN HANDLERS ====================

async function handleRegisterPushToken(supabase: any, staffId: string, data: any, organizationId: string) {
  const { push_token, platform } = data || {}

  console.log(`[mobile-app-api] [register_push_token] handler start staff=${staffId} org=${organizationId} platform=${platform || 'android'} hasToken=${!!push_token}`)

  if (!push_token) {
    console.error('[mobile-app-api] [register_push_token] push_token missing in payload')
    return new Response(
      JSON.stringify({ error: 'push_token is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get staff name
  const { data: staff } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  console.log(`[mobile-app-api] [register_push_token] upsert token for staff=${staff?.name || staffId}, platform=${platform || 'android'}, tokenPrefix=${push_token?.slice(0, 12)}...`)

  // Detect token rotation for the same staff (different token already on file).
  try {
    const { data: existingTokens } = await supabase
      .from('device_tokens')
      .select('token, last_refreshed_at')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)

    if (existingTokens && existingTokens.length > 0) {
      const matchesIncoming = existingTokens.some((t: any) => t.token === push_token)
      if (!matchesIncoming) {
        const oldPrefixes = existingTokens.map((t: any) => t.token.slice(0, 12)).join(',')
        console.log(`[mobile-app-api] [register_push_token] token rotated for staff=${staffId} old=[${oldPrefixes}] new=${push_token.slice(0, 12)}`)
      }
    }
  } catch (rotErr) {
    console.warn('[mobile-app-api] [register_push_token] rotation check failed (non-fatal):', rotErr)
  }

  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('device_tokens')
    .upsert({
      staff_id: staffId,
      token: push_token,
      platform: platform || 'android',
      organization_id: organizationId,
      updated_at: nowIso,
      last_refreshed_at: nowIso,
    }, { onConflict: 'staff_id,token' })

  if (error) {
    console.error('[mobile-app-api] [register_push_token] failed:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to register push token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[mobile-app-api] [register_push_token] success staff=${staffId} refreshed_at=${nowIso}`)
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUnregisterPushToken(supabase: any, staffId: string, data: any, organizationId: string) {
  const { push_token } = data || {}
  if (!push_token) {
    return new Response(
      JSON.stringify({ error: 'push_token is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  await supabase
    .from('device_tokens')
    .delete()
    .eq('staff_id', staffId)
    .eq('token', push_token)
    .eq('organization_id', organizationId)

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function handleReportLocation(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    latitude,
    longitude,
    accuracy,
    speed,
    app_version,
    app_build,
    app_platform,
    os_version,
    device_model,
    app_id,
  } = data || {}

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return new Response(
      JSON.stringify({ error: 'latitude and longitude are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check existing position to determine if location_since should be reset
  const { data: existing } = await supabase
    .from('staff_locations')
    .select('latitude, longitude, location_since')
    .eq('staff_id', staffId)
    .single()

  let locationSince: string | undefined
  if (existing && existing.latitude != null && existing.longitude != null) {
    const dist = haversineMeters(existing.latitude, existing.longitude, latitude, longitude)
    locationSince = dist > 100 ? new Date().toISOString() : (existing.location_since || new Date().toISOString())
  } else {
    locationSince = new Date().toISOString()
  }

  // App meta is best-effort: only persist when the client actually sent it,
  // so older app builds (that don't include it yet) don't blank the column.
  // staff_locations ONLY has: app_version, app_build, app_platform
  // staff_location_history has: app_version, app_build, platform, os_version, device_model, app_id
  const staffLocationMetaUpdate: Record<string, string | null> = {}
  if (typeof app_version === 'string') staffLocationMetaUpdate.app_version = app_version
  if (typeof app_build === 'string') staffLocationMetaUpdate.app_build = app_build
  if (typeof app_platform === 'string') staffLocationMetaUpdate.app_platform = app_platform

  const { error } = await supabase
    .from('staff_locations')
    .upsert({
      staff_id: staffId,
      organization_id: organizationId,
      latitude,
      longitude,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      updated_at: new Date().toISOString(),
      location_since: locationSince,
      ...staffLocationMetaUpdate,
    }, { onConflict: 'staff_id' })

  if (error) {
    console.error('[mobile-app-api] report_location error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to report location' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── APPEND TO LOCATION HISTORY (RAW LAYER) ──
  // PRINCIP (LÅST): staff_location_history är "kartans" råalager och MÅSTE
  // ta emot ALLT som telefonen skickar. Ingen backend-dedupe, ingen
  // tidsfönster-spärr, ingen värdebaserad filtrering. Klienten bestämmer
  // takten; servern lagrar rått. Visningslogik (karta/tidslinje) får
  // dölja/aggregera i UI-lagret, men datan bakom måste vara komplett.
  // Se mem: "Mobile Time App is Mirror-Only" + tidigare bugg där dedupe
  // gjorde att Billys dag tappade ~5h pings. ÅTERINFÖR INTE.
  try {
    await supabase.from('staff_location_history').insert({
      organization_id: organizationId,
      staff_id: staffId,
      lat: latitude,
      lng: longitude,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      recorded_at: new Date().toISOString(),
      app_version: typeof app_version === 'string' ? app_version : null,
      app_build: typeof app_build === 'string' ? app_build : null,
      platform: typeof app_platform === 'string' ? app_platform : null,
      os_version: typeof os_version === 'string' ? os_version : null,
      device_model: typeof device_model === 'string' ? device_model : null,
      app_id: typeof app_id === 'string' ? app_id : null,
    })
  } catch (histErr) {
    // Never fail the request if history insert fails
    console.warn('[mobile-app-api] history insert failed:', histErr)
  }



  // ── GEOFENCE CHECK for organization_locations (polygon-aware) ──
  //
  // SAFETY GUARD (Time Engine v2):
  // update_location is GPS-only. It MUST NOT create/close legacy timer rows
  // (workday / location_time_entries / time_reports / travel_time_logs).
  // Geofence may still START tid, but only via the new Time Engine writing to
  // active_time_registrations (handled by processGpsTimelineForAutoStart on
  // top of staff_location_history above).
  //
  // We still detect "is the user inside an active geofence right now?" so the
  // response can return `at_location` for the client UI, but no time-side-effects.
  const LEGACY_GEOFENCE_TIME_WRITES_DISABLED = true
  let atLocation: { id: string; name: string } | null = null
  try {
    const ptInRing = (lng: number, lat: number, ring: number[][]) => {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]
        const [xj, yj] = ring[j]
        const intersect = ((yi > lat) !== (yj > lat)) &&
          lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi
        if (intersect) inside = !inside
      }
      return inside
    }
    const ptInPoly = (lng: number, lat: number, poly: any) => {
      const rings = poly?.coordinates || []
      if (rings.length === 0) return false
      if (!ptInRing(lng, lat, rings[0])) return false
      for (let r = 1; r < rings.length; r++) if (ptInRing(lng, lat, rings[r])) return false
      return true
    }

    const { data: orgLocations } = await supabase
      .from('organization_locations')
      .select('id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    const accuracyOk = accuracy == null || accuracy <= 50

    for (const loc of (orgLocations || [])) {
      let isInside = false
      if (loc.geofence_mode === 'polygon' && loc.geofence_polygon) {
        isInside = ptInPoly(longitude, latitude, loc.geofence_polygon)
      } else {
        const dist = haversineMeters(latitude, longitude, loc.latitude, loc.longitude)
        isInside = dist <= loc.radius_meters
      }
      if (!accuracyOk) continue
      if (isInside) {
        atLocation = { id: loc.id, name: loc.name }
      }
    }

    if (LEGACY_GEOFENCE_TIME_WRITES_DISABLED) {
      // No-op by design. The new Time Engine consumes staff_location_history
      // and decides start/stop into active_time_registrations.
      console.log('[geofence] legacy_geofence_lte_write_disabled_use_time_engine')
    }
  } catch (geoErr) {
    console.warn('[geofence] Error during location check:', geoErr)
  }

  // ── TIME ENGINE v2: GPS-driven auto-start into active_time_registrations ──
  //
  // After staff_location_history has been appended above, hand the recent
  // pings to the new Time Engine. It builds a GPS day timeline, resolves
  // valid work targets, runs decideAutoStart and — only if the policy allows —
  // INSERTs an active_time_registration row.
  //
  // It MUST NOT write workdays / location_time_entries / time_reports /
  // travel_time_logs. The processor only touches active_time_registrations.
  //
  // Best-effort: never fail the location update if the engine errors.
  try {
    const todayIso = new Date().toISOString().split('T')[0]
    const sinceIso = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    const { data: recentPings } = await supabase
      .from('staff_location_history')
      .select('recorded_at, lat, lng, accuracy, speed')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: true })
      .limit(500)

    const pings = (recentPings || [])
      .filter((p: any) => p.lat != null && p.lng != null && p.recorded_at)
      .map((p: any) => ({
        ts: p.recorded_at,
        lat: Number(p.lat),
        lng: Number(p.lng),
        accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
        speedMs: p.speed != null ? Number(p.speed) : null,
      }))

    if (pings.length >= 2) {
      const result = await processGpsTimelineForAutoStart({
        organizationId,
        staffId,
        date: todayIso,
        pings,
        supabaseAdmin: supabase,
      })
      if (result.createdRegistrationId) {
        console.log(
          '[time-engine] auto-started active_time_registration',
          result.createdRegistrationId,
          'staff=', staffId,
        )
      }
    }
  } catch (engineErr) {
    console.warn('[time-engine] processGpsTimelineForAutoStart failed (non-fatal):', engineErr)
  }

  // ── BACKGROUND GEOFENCE for assigned bookings & projects ──
  // EVENT-MODELL (Runda 2 cleanup): vi skapar INTE längre tysta
  // `location_time_entries`-rader i bakgrunden. Istället skrivs ett
  // `assistant_events`-rad (event_type='arrival', source='geofence_background')
  // som review-flödet och prompt-kön kan agera på.
  //
  // Quality gates: accuracy ≤ 50m, speed ≤ 1.5 m/s, distans ≤ 100m.
  try {
    const goodAccuracy = accuracy == null || accuracy <= 50
    const stationary = speed == null || speed <= 1.5
    if (goodAccuracy && stationary) {
      const today = new Date().toISOString().split('T')[0]

      const { data: bsaRows } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id, bookings:booking_id(id, client, delivery_latitude, delivery_longitude, large_project_id, large_projects:large_project_id(id, name, address_latitude, address_longitude))')
        .eq('staff_id', staffId)
        .eq('assignment_date', today)

      type Target =
        | { kind: 'booking'; id: string; lat: number; lng: number; label: string | null }
        | { kind: 'project'; id: string; lat: number; lng: number; label: string | null }
      const targets: Target[] = []
      const seen = new Set<string>()
      for (const r of (bsaRows || [])) {
        const b = r.bookings
        if (!b) continue
        if (!b.large_project_id && b.delivery_latitude != null && b.delivery_longitude != null) {
          const key = `b:${b.id}`
          if (!seen.has(key)) {
            seen.add(key)
            targets.push({ kind: 'booking', id: b.id, lat: b.delivery_latitude, lng: b.delivery_longitude, label: b.client ?? null })
          }
        }
        const lp = b.large_projects
        if (lp?.address_latitude != null && lp?.address_longitude != null) {
          const key = `p:${lp.id}`
          if (!seen.has(key)) {
            seen.add(key)
            targets.push({ kind: 'project', id: lp.id, lat: lp.address_latitude, lng: lp.address_longitude, label: lp.name ?? null })
          }
        }
      }

      const ENTER_RADIUS_M = 100
      const nowIso = new Date().toISOString()
      for (const t of targets) {
        const dist = haversineMeters(latitude, longitude, t.lat, t.lng)
        if (dist > ENTER_RADIUS_M) continue

        // Dual-write till assistant_events. Dedupe-key i helpern hindrar
        // dubblettrader inom samma 5-minutersfönster.
        await dualWriteAssistantEvent(supabase, {
          organization_id: organizationId,
          staff_id: staffId,
          event_type: 'arrival',
          target_type: t.kind,
          target_id: t.id,
          target_label: t.label,
          happened_at: nowIso,
          source: 'geofence_background',
          suggested_action: 'start_activity',
          metadata: { distance_m: Math.round(dist) },
        })
        console.log(`[bg-geofence] EVENT arrival ${t.kind}=${t.id} staff=${staffId} dist=${Math.round(dist)}m`)
      }
    }
  } catch (bgErr) {
    console.warn('[bg-geofence] Error during assigned-target check:', bgErr)
  }

  return new Response(
    JSON.stringify({ success: true, at_location: atLocation }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── BATCH LOCATION UPLOAD ──
// Designed for the offline-first GPS sync queue on the mobile app.
// Accepts an array of GPS points captured while the device may have been
// offline, throttled, or backgrounded. Each point carries its own client-side
// id (for idempotent receipts) and the original `recordedAt` timestamp.
//
// Behaviour:
//   1. All points are inserted into staff_location_history with their original
//      recordedAt. Duplicate (staff_id, recorded_at) rows are skipped silently
//      so repeated flushes never create double history.
//   2. Only the *latest* point (max recordedAt) updates staff_locations so the
//      live presence row reflects the freshest known position — replaying old
//      points must never move the staff "back in time" on the map.
//   3. Returns `{ accepted: [ids] }` so the client can drop confirmed points
//      from its local queue. Points that fail individually are reported in
//      `rejected: [{ id, reason }]`.
//   4. Backend chain (NEW): after all pings are saved, every distinct date
//      in the batch is passed to `processGpsTimelineForAutoStart` — the
//      same processor used by `location-update-cron`. It builds a GPS day
//      timeline, evaluates the auto-start policy per date, and may create
//      `active_time_registrations` when a valid geofence-policy is satisfied.
//
//      Flow:  Batch GPS
//             → staff_location_history
//             → processGpsTimelineForAutoStart
//             → active_time_registrations
//
//      Failures in the processor are logged but MUST NOT fail the upload —
//      saving GPS history is the non-negotiable contract of this endpoint.
//      The next ping (or the cron) will retry the chain. Pure backfill of
//      historic logs (>30 min old) intentionally skips the chain so old
//      pings can't retroactively mutate today's reality.
async function handleUploadLocationBatch(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const points = Array.isArray(data?.points) ? data.points : null
  if (!points || points.length === 0) {
    return new Response(
      JSON.stringify({ error: 'points[] is required and must be non-empty' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (points.length > 500) {
    return new Response(
      JSON.stringify({ error: 'batch too large (max 500 points)' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const accepted: string[] = []
  const rejected: { id: string; reason: string }[] = []

  type ValidPoint = {
    id: string
    latitude: number
    longitude: number
    accuracy: number | null
    speed: number | null
    source: string | null
    recordedAt: string
    recordedMs: number
    batteryLevel: number | null
    batteryPercent: number | null
    isCharging: boolean | null
    batteryCapturedAt: string | null
    batterySource: string | null
  }

  const valid: ValidPoint[] = []

  for (const p of points) {
    const id = typeof p?.id === 'string' && p.id.length > 0 ? p.id : null
    if (!id) {
      rejected.push({ id: 'unknown', reason: 'missing id' })
      continue
    }
    if (typeof p?.latitude !== 'number' || typeof p?.longitude !== 'number') {
      rejected.push({ id, reason: 'invalid coordinates' })
      continue
    }
    if (Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) {
      rejected.push({ id, reason: 'coordinates out of range' })
      continue
    }
    const recordedAt =
      typeof p?.recordedAt === 'string' && p.recordedAt.length > 0
        ? p.recordedAt
        : new Date().toISOString()
    const recordedMs = new Date(recordedAt).getTime()
    if (!Number.isFinite(recordedMs)) {
      rejected.push({ id, reason: 'invalid recordedAt' })
      continue
    }

    // ── Soft battery validation ──
    // Never reject a GPS ping for bad battery data — just drop the field.
    let batteryLevel: number | null = null
    if (typeof p?.batteryLevel === 'number' && Number.isFinite(p.batteryLevel)
      && p.batteryLevel >= 0 && p.batteryLevel <= 1) {
      batteryLevel = p.batteryLevel
    }
    let batteryPercent: number | null = null
    if (typeof p?.batteryPercent === 'number' && Number.isFinite(p.batteryPercent)
      && p.batteryPercent >= 0 && p.batteryPercent <= 100) {
      batteryPercent = Math.round(p.batteryPercent)
    } else if (batteryLevel !== null) {
      batteryPercent = Math.round(batteryLevel * 100)
    }
    const isCharging = typeof p?.isCharging === 'boolean' ? p.isCharging : null
    const batteryCapturedAt =
      typeof p?.batteryCapturedAt === 'string' && p.batteryCapturedAt.length > 0
        ? p.batteryCapturedAt
        : null
    const batterySource =
      typeof p?.batterySource === 'string' && p.batterySource.length > 0
        ? p.batterySource
        : null

    valid.push({
      id,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: typeof p.accuracy === 'number' ? p.accuracy : null,
      speed: typeof p.speed === 'number' ? p.speed : null,
      source: typeof p.source === 'string' ? p.source : null,
      recordedAt,
      recordedMs,
      batteryLevel,
      batteryPercent,
      isCharging,
      batteryCapturedAt,
      batterySource,
    })
  }

  if (valid.length === 0) {
    return new Response(
      JSON.stringify({ accepted, rejected }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Process oldest-first so timeline stays monotonic.
  valid.sort((a, b) => a.recordedMs - b.recordedMs)

  // ── 1. Insert into history with idempotent dedupe ──
  // We can't rely on a unique index existing on (staff_id, recorded_at), so we
  // pre-filter against existing rows in the affected window. This costs one
  // extra round-trip but keeps the endpoint safe to call repeatedly.
  const earliest = new Date(valid[0].recordedMs - 1000).toISOString()
  const latest = new Date(valid[valid.length - 1].recordedMs + 1000).toISOString()

  let existingTimestamps = new Set<number>()
  try {
    const { data: existingRows } = await supabase
      .from('staff_location_history')
      .select('recorded_at')
      .eq('staff_id', staffId)
      .gte('recorded_at', earliest)
      .lte('recorded_at', latest)
    if (Array.isArray(existingRows)) {
      existingTimestamps = new Set(
        existingRows
          .map((r: any) => new Date(r.recorded_at).getTime())
          .filter((n: number) => Number.isFinite(n)),
      )
    }
  } catch (lookupErr) {
    console.warn('[mobile-app-api] upload_location_batch dedupe lookup failed:', lookupErr)
  }

  // App build metadata skickas på batch-nivå (per device, inte per ping)
  // men vi taggar varje history-rad så vi kan se exakt vilken version
  // postade en given GPS-ping. Bakåtkompatibelt — gamla appar utan
  // dessa fält får null i kolumnerna.
  const batchAppVersion = typeof data?.app_version === 'string' ? data.app_version : null
  const batchAppBuild = typeof data?.app_build === 'string' ? data.app_build : null
  const batchAppPlatform = typeof data?.app_platform === 'string' ? data.app_platform : null
  const batchOsVersion = typeof data?.os_version === 'string' ? data.os_version : null
  const batchDeviceModel = typeof data?.device_model === 'string' ? data.device_model : null
  const batchAppId = typeof data?.app_id === 'string' ? data.app_id : null

  const rowsToInsert: any[] = []
  for (const p of valid) {
    // Treat any history row within the same second as a duplicate.
    const sameSecond = Math.floor(p.recordedMs / 1000) * 1000
    const isDup =
      existingTimestamps.has(p.recordedMs) || existingTimestamps.has(sameSecond)
    if (isDup) {
      // Still mark accepted — the server already has this point.
      accepted.push(p.id)
      continue
    }
    rowsToInsert.push({
      organization_id: organizationId,
      staff_id: staffId,
      lat: p.latitude,
      lng: p.longitude,
      accuracy: p.accuracy,
      speed: p.speed,
      recorded_at: p.recordedAt,
      battery_level: p.batteryLevel,
      battery_percent: p.batteryPercent,
      is_charging: p.isCharging,
      battery_captured_at: p.batteryCapturedAt,
      battery_source: p.batterySource,
      app_version: batchAppVersion,
      app_build: batchAppBuild,
      platform: batchAppPlatform,
      os_version: batchOsVersion,
      device_model: batchDeviceModel,
      app_id: batchAppId,
    })
    accepted.push(p.id)
    existingTimestamps.add(p.recordedMs)
  }

  if (rowsToInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('staff_location_history')
      .insert(rowsToInsert)
    if (insertErr) {
      console.error('[mobile-app-api] upload_location_batch history insert error:', insertErr)
      return new Response(
        JSON.stringify({ error: 'Failed to write location history' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  }

  // ── 2. Update staff_locations with the LATEST point only ──
  // Replaying old points must never overwrite a fresher live position.
  const newest = valid[valid.length - 1]
  try {
    const { data: existing } = await supabase
      .from('staff_locations')
      .select('latitude, longitude, location_since, updated_at')
      .eq('staff_id', staffId)
      .maybeSingle()

    const existingUpdatedMs = existing?.updated_at
      ? new Date(existing.updated_at).getTime()
      : 0

    if (newest.recordedMs >= existingUpdatedMs) {
      let locationSince: string
      if (existing && existing.latitude != null && existing.longitude != null) {
        const dist = haversineMeters(
          existing.latitude,
          existing.longitude,
          newest.latitude,
          newest.longitude,
        )
        locationSince =
          dist > 100
            ? newest.recordedAt
            : (existing.location_since || newest.recordedAt)
      } else {
        locationSince = newest.recordedAt
      }

      // App meta is best-effort: only set columns the client actually sent
      // so older builds that don't include version metadata don't blank
      // already-known values.
      const appMetaUpdate: Record<string, string | null> = {}
      if (typeof data?.app_version === 'string') appMetaUpdate.app_version = data.app_version
      if (typeof data?.app_build === 'string') appMetaUpdate.app_build = data.app_build
      if (typeof data?.app_platform === 'string') appMetaUpdate.app_platform = data.app_platform

      const { error: upsertErr } = await supabase
        .from('staff_locations')
        .upsert(
          {
            staff_id: staffId,
            organization_id: organizationId,
            latitude: newest.latitude,
            longitude: newest.longitude,
            accuracy: newest.accuracy,
            speed: newest.speed,
            updated_at: newest.recordedAt,
            location_since: locationSince,
            ...appMetaUpdate,
          },
          { onConflict: 'staff_id' },
        )
      if (upsertErr) {
        console.warn('[mobile-app-api] upload_location_batch staff_locations upsert error:', upsertErr)
      }
    }
  } catch (presenceErr) {
    console.warn('[mobile-app-api] upload_location_batch presence update failed:', presenceErr)
  }

  // ── 3. Drive the new Time Engine ──
  // Batch-upload feeds GPS pings into the Time Engine, which is the only
  // component allowed to write `active_time_registrations`. We run it per
  // distinct date present in the batch so backfill across day boundaries
  // is handled correctly.
  //
  // The engine MUST NOT touch workdays / location_time_entries / time_reports /
  // travel_time_logs — only `active_time_registrations`.
  const batchDates = new Set<string>()
  for (const p of valid) {
    batchDates.add(new Date(p.recordedMs).toISOString().slice(0, 10))
  }
  const chainSummary: { dates: Array<{ date: string; createdRegistrationId: string | null }> } = { dates: [] }
  for (const date of batchDates) {
    try {
      const dayStartIso = `${date}T00:00:00.000Z`
      const dayEndIso = `${date}T23:59:59.999Z`
      // Paginated fetch — Time Engine MUST receive ALL pings for the day,
      // not just the first 2000. Batch in chunks of 1000 via .range().
      const PAGE_SIZE = 1000
      const allDayPings: any[] = []
      for (let from = 0; ; from += PAGE_SIZE) {
        const to = from + PAGE_SIZE - 1
        const { data: pageRows, error: pageErr } = await supabase
          .from('staff_location_history')
          .select('recorded_at, lat, lng, accuracy, speed')
          .eq('organization_id', organizationId)
          .eq('staff_id', staffId)
          .gte('recorded_at', dayStartIso)
          .lte('recorded_at', dayEndIso)
          .order('recorded_at', { ascending: true })
          .range(from, to)
        if (pageErr) break
        const rows = pageRows || []
        if (rows.length === 0) break
        allDayPings.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }

      const pings = allDayPings
        .filter((p: any) => p.lat != null && p.lng != null && p.recorded_at)
        .map((p: any) => ({
          ts: p.recorded_at,
          lat: Number(p.lat),
          lng: Number(p.lng),
          accuracyM: p.accuracy != null ? Number(p.accuracy) : null,
          speedMs: p.speed != null ? Number(p.speed) : null,
        }))

      if (pings.length < 2) {
        chainSummary.dates.push({ date, createdRegistrationId: null })
        continue
      }

      const result = await processGpsTimelineForAutoStart({
        organizationId,
        staffId,
        date,
        pings,
        supabaseAdmin: supabase,
      })
      chainSummary.dates.push({ date, createdRegistrationId: result.createdRegistrationId ?? null })
      if (result.createdRegistrationId) {
        console.log(
          '[time-engine] upload_location_batch auto-started active_time_registration',
          result.createdRegistrationId,
          'staff=', staffId,
          'date=', date,
        )
      }
    } catch (engineErr) {
      // Never fail the upload because the engine hiccupped — GPS history is
      // already persisted above.
      console.warn(
        '[time-engine] upload_location_batch processGpsTimelineForAutoStart failed (non-fatal):',
        engineErr,
      )
    }
  }

  // ── 4. GPS-driven AUTO-STOP for the day timer ──
  // Policy contract (GPS_SIGNAL_ONLY + DAY_TIMER_ONLY):
  //   • GPS may auto-START the day timer (above).
  //   • GPS may auto-STOP the day timer (here).
  //   • GPS MUST NOT create or mutate time_reports / location_time_entries /
  //     workdays / travel_time_logs. The Time Engine + admin own the timeline.
  // Therefore the only mutation this block is allowed to perform is on
  // `active_time_registrations` via the pure evaluator.
  try {
    const nowIsoForStop = new Date().toISOString()
    const { data: activeRegs } = await supabase
      .from('active_time_registrations')
      .select('id, staff_id, started_at, status, stopped_at, start_source, metadata')
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('status', 'active')
      .is('stopped_at', null)
      .order('started_at', { ascending: false })
      .limit(1)

    const reg = activeRegs?.[0]
    if (reg) {
      // Load anchors (LTE for day) — read-only EVIDENCE, never mutated here.
      const sinceIso = reg.started_at
      const [{ data: lteRows }, { data: homes }] = await Promise.all([
        supabase
          .from('location_time_entries')
          .select(`entered_at, exited_at, location_id, booking_id, large_project_id,
                   organization_locations(name, latitude, longitude)`)
          .eq('organization_id', organizationId)
          .eq('staff_id', reg.staff_id)
          .gte('entered_at', sinceIso)
          .order('entered_at', { ascending: true })
          .limit(50),
        supabase
          .from('staff_inferred_home_locations')
          .select('lat, lng')
          .eq('organization_id', organizationId)
          .eq('staff_id', reg.staff_id)
          .is('valid_until', null)
          .limit(3),
      ])

      const workAnchors = (lteRows || []).map((r: any) => {
        const loc = r.organization_locations || null
        let kind: 'project' | 'large_project' | 'location' | 'booking' | 'warehouse' = 'location'
        let targetId: string | null = r.location_id ?? null
        if (r.large_project_id) { kind = 'large_project'; targetId = r.large_project_id }
        else if (r.project_id) { kind = 'project'; targetId = r.project_id }
        else if (r.booking_id) { kind = 'booking'; targetId = r.booking_id }
        return {
          enteredAtIso: r.entered_at,
          exitedAtIso: r.exited_at ?? null,
          kind,
          targetId,
          label: loc?.name ?? null,
          lat: loc?.latitude != null ? Number(loc.latitude) : null,
          lng: loc?.longitude != null ? Number(loc.longitude) : null,
        }
      })

      const homeZones = (homes || []).map((h: any) => ({
        lat: Number(h.lat), lng: Number(h.lng), radiusM: 150, kind: 'inferred_home' as const,
      })).filter((z: any) => Number.isFinite(z.lat) && Number.isFinite(z.lng))

      const lastExits = workAnchors
        .map((a: any) => a.exitedAtIso)
        .filter((x: any): x is string => !!x)
        .sort()
      const pingSince = lastExits.length > 0 ? lastExits[lastExits.length - 1] : sinceIso

      const { data: pingRows } = await supabase
        .from('staff_location_history')
        .select('lat, lng, recorded_at')
        .eq('organization_id', organizationId)
        .eq('staff_id', reg.staff_id)
        .gte('recorded_at', pingSince)
        .lte('recorded_at', nowIsoForStop)
        .order('recorded_at', { ascending: true })
        .limit(500)

      const pingsAfterLastAnchor = (pingRows || [])
        .map((p: any) => ({
          recordedAtIso: p.recorded_at,
          lat: Number(p.lat),
          lng: Number(p.lng),
        }))
        .filter((p: any) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

      const decision = evaluateAutoStopForActiveDay({
        registration: {
          id: reg.id,
          staffId: reg.staff_id,
          organizationId,
          startedAtIso: reg.started_at,
          status: reg.status,
          stoppedAtIso: reg.stopped_at,
          startSource: reg.start_source ?? null,
        },
        workAnchors,
        pingsAfterLastAnchor,
        homeZones,
        nowIso: nowIsoForStop,
      })

      if (decision.stop) {
        const { error: stopErr } = await supabase
          .from('active_time_registrations')
          .update({
            status: 'stopped',
            stopped_at: decision.stopAtIso,
            stop_source: decision.stopSource,
            stopped_by: 'system_day_auto_stop',
            metadata: {
              ...(reg.metadata || {}),
              autoStop: { ...decision.diagnostics, decidedAt: nowIsoForStop, source: 'upload_location_batch' },
            },
            updated_at: nowIsoForStop,
          })
          .eq('id', reg.id)
          .eq('status', 'active')
          .is('stopped_at', null)
        if (stopErr) {
          console.warn('[time-engine] upload_location_batch auto-stop update failed (non-fatal):', stopErr)
        } else {
          console.log(JSON.stringify({
            evt: 'day_timer_auto_stopped',
            via: 'upload_location_batch',
            registration_id: reg.id,
            staff_id: reg.staff_id,
            organization_id: organizationId,
            stop_source: decision.stopSource,
            stop_at: decision.stopAtIso,
          }))
        }
      }
    }
  } catch (autoStopErr) {
    console.warn('[time-engine] upload_location_batch evaluateAutoStopForActiveDay failed (non-fatal):', autoStopErr)
  }

  return new Response(
    JSON.stringify({
      success: true,
      accepted,
      rejected,
      received: accepted.length,
      chain: chainSummary,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// ── ORGANIZATION LOCATIONS HANDLERS ──

async function handleGetOrganizationLocations(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('id, name, address, latitude, longitude, radius_meters, show_as_project, geofence_mode, geofence_polygon, location_type, is_private_residence, privacy_level')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('Get org locations error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch locations' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ locations: data || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Time Engine v2 — active_time_registrations only
// ─────────────────────────────────────────────────────────────────────────────
// Pure new-engine start/stop. No location_time_entries, no time_reports, no
// workday writes. The single timer table is `active_time_registrations`.
// User-started → start_source='user_timer', auto_started=false.
// GPS-auto-started timers land in the same table (auto_started=true) via the
// new Time Engine processor.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY action forwarders → Time Engine v2 (active_time_registrations only).
//
// The legacy 'start_location_timer' / 'stop_location_timer' actions are still
// called from older frontend code paths and queued offline payloads. To avoid
// creating parallel timer state in workdays / location_time_entries /
// time_reports, we translate the legacy payload shape into the Time Engine v2
// payload shape and forward to handleStart/StopTimeRegistration.
//
// This means a user-started timer and a GPS-auto-started timer always end up
// in exactly one table: active_time_registrations.
// ─────────────────────────────────────────────────────────────────────────────
async function handleLegacyStartLocationTimerForward(
  supabase: any, staffId: string, data: any, organizationId: string,
) {
  const d = data || {}
  // Single-day-timer policy: legacy target fields are intentionally dropped.
  // Only `started_at` is forwarded — the resulting registration is always a
  // pure workday timer with no target binding.
  console.warn('[mobile-app-api] LEGACY start_location_timer forwarded → start_time_registration (target stripped, single_day_timer)', {
    had_large_project_id: !!d.large_project_id,
    had_booking_id: !!d.booking_id,
    had_project_id: !!d.project_id,
    had_location_id: !!d.location_id,
  })
  return await handleStartTimeRegistration(
    supabase, staffId,
    { started_at: d.started_at },
    organizationId,
  )
}

async function handleLegacyStopLocationTimerForward(
  supabase: any, staffId: string, data: any, organizationId: string,
) {
  const d = data || {}
  console.warn('[mobile-app-api] LEGACY stop_location_timer forwarded → stop_time_registration', { entry_id: d.entry_id })
  return await handleStopTimeRegistration(
    supabase, staffId,
    { registration_id: d.registration_id ?? null, stop_source: 'legacy_stop_forwarded_to_day_timer', stopped_at: d.stopped_at },
    organizationId,
  )
}

async function handleStartTimeRegistration(
  supabase: any, staffId: string, data: any, organizationId: string,
) {
  const { target_type, target_id, started_at } = data || {}

  // ── Single Day Timer policy (Timer 1.5) ────────────────────────────────
  // start_time_registration ALWAYS starts a pure workday timer.
  // No project/booking/location/warehouse target binding is allowed here —
  // Time Engine attributes activity later. Reject any caller that still
  // tries to pass target_type/target_id.
  if (target_type != null || target_id != null) {
    console.warn('[start_time_registration] target_timer_not_allowed', { target_type, target_id })
    return new Response(
      JSON.stringify({
        error: 'target_timer_not_allowed',
        message: 'Starta endast arbetsdag. Projekt/plats kopplas av Time Engine.',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Resolve start time (within last 24h, not in future).
  let startedAtIso = new Date().toISOString()
  if (started_at && typeof started_at === 'string') {
    const parsed = new Date(started_at)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      startedAtIso = parsed.toISOString()
    }
  }

  // Stop any existing active row for this staff+org (unique index also enforces).
  await supabase
    .from('active_time_registrations')
    .update({
      status: 'stopped',
      stopped_at: new Date().toISOString(),
      stopped_by: staffId,
      stop_source: 'superseded_by_new_start',
    })
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .eq('status', 'active')

  const insertPayload: any = {
    organization_id: organizationId,
    staff_id: staffId,
    status: 'active',
    started_at: startedAtIso,
    started_by: staffId,
    start_source: 'user_day_start',
    auto_started: false,
    start_target_type: null,
    start_target_id: null,
    start_target_label: null,
    current_kind: 'day_active',
    current_label: 'Arbetsdag aktiv',
    current_target_type: null,
    current_target_id: null,
    current_confidence: 0,
    needs_user_choice: false,
    metadata: { timerModel: 'single_day_timer' },
  }

  const { data: row, error } = await supabase
    .from('active_time_registrations')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    console.error('[start_time_registration] insert failed:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to start time registration', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  return new Response(
    JSON.stringify({ success: true, registration: row }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * stop_sources that count as "user manually ended their workday" and
 * therefore must lock GPS/auto-start out for the rest of the local day.
 * Mirrored by the suppression check in
 * `_shared/time-engine/processGpsTimelineForAutoStart.ts`.
 */
const USER_END_WORKDAY_STOP_SOURCES: ReadonlySet<string> = new Set([
  'user_manual',
  'user_end_workday',
  'user_stop',
  'manual',
]);

/**
 * Returns the ISO timestamp for the next local-day boundary in `tz`,
 * relative to `baseNow`. Used as `suppressed_until` so the lock expires
 * automatically at midnight local time and tomorrow's GPS auto-start
 * works as usual.
 */
function endOfLocalDayIso(tz = 'Europe/Stockholm', baseNow: Date = new Date()): string {
  const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(baseNow);
  const [y, m, d] = todayLocal.split('-').map(Number);
  // Approximate next-local-midnight as a UTC instant, then correct using
  // the tz offset of that instant. One refinement step is enough since
  // DST shifts happen at 02:00/03:00, never at midnight-Stockholm.
  const guess = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asLocalUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const offsetMs = asLocalUtc - guess.getTime();
  return new Date(guess.getTime() - offsetMs).toISOString();
}

function localDateForTz(tz = 'Europe/Stockholm', baseNow: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(baseNow);
}

async function handleStopTimeRegistration(
  supabase: any, staffId: string, data: any, organizationId: string,
) {
  const { registration_id, stop_source, stopped_at } = data || {}

  let stoppedAtIso = new Date().toISOString()
  if (stopped_at && typeof stopped_at === 'string') {
    const parsed = new Date(stopped_at)
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      stoppedAtIso = parsed.toISOString()
    }
  }

  const effectiveStopSource = stop_source || 'user_manual'

  let q = supabase
    .from('active_time_registrations')
    .update({
      status: 'stopped',
      stopped_at: stoppedAtIso,
      stopped_by: staffId,
      stop_source: effectiveStopSource,
    })
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .eq('status', 'active')
  if (registration_id) q = q.eq('id', registration_id)

  const { data: row, error } = await q
    .select()
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[stop_time_registration] update failed:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to stop time registration', detail: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // After a USER-driven stop, lock out GPS/auto-start for the rest of the
  // local day. This prevents the geofence engine from re-starting a timer
  // while the person is still on site after explicitly ending the workday.
  // Manual start via WorkDayPanel is unaffected — start_time_registration
  // does not consult this table.
  let suppressionRow: any = null
  if (USER_END_WORKDAY_STOP_SOURCES.has(effectiveStopSource)) {
    try {
      const localDate = localDateForTz()
      const suppressedUntil = endOfLocalDayIso()
      const { data: supRow, error: supErr } = await supabase
        .from('time_auto_start_suppressions')
        .insert({
          organization_id: organizationId,
          staff_id: staffId,
          date: localDate,
          suppressed_until: suppressedUntil,
          reason: 'user_ended_workday',
          source: 'user_manual_stop',
          metadata: {
            stop_source: effectiveStopSource,
            registration_id: row?.id ?? registration_id ?? null,
            stopped_at: stoppedAtIso,
          },
        })
        .select('id, suppressed_until, reason, source')
        .maybeSingle()
      if (supErr) {
        console.warn('[stop_time_registration] suppression insert failed (non-fatal):', supErr.message)
      } else {
        suppressionRow = supRow
      }
    } catch (e: any) {
      console.warn('[stop_time_registration] suppression insert threw (non-fatal):', e?.message ?? e)
    }
  }

  return new Response(
    JSON.stringify({ success: true, registration: row, suppression: suppressionRow }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// LEGACY ONLY.
// Do not use for Time Engine v2.
// New active timer source is active_time_registrations.
//
// handleStartLocationTimerLegacyDisabled / handleStopLocationTimerLegacyDisabled
// remain in the file ONLY so the legacy LTE/workday/time_report rows can still
// be inspected and admin/payroll readers keep working. The case branches for
// 'start_location_timer' / 'stop_location_timer' forward to
// handleStart/StopTimeRegistration via handleLegacy*Forward and never call
// these functions. No new Time Engine v2 action invokes them.
// ─────────────────────────────────────────────────────────────────────────────
async function handleStartLocationTimerLegacyDisabled(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    location_id,
    booking_id,
    large_project_id,
    task_id,
    started_at,
    client_dedupe_key,
  } = data || {}

  // Exactly one of (location_id | booking_id | large_project_id) must be set.
  const targets = [location_id, booking_id, large_project_id].filter(Boolean)
  if (targets.length !== 1) {
    return new Response(
      JSON.stringify({ error: 'Exactly one of location_id, booking_id, large_project_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 1. Idempotency by client_dedupe_key — same key always returns same row.
  if (client_dedupe_key) {
    const { data: byKey } = await supabase
      .from('location_time_entries')
      .select('*')
      .eq('staff_id', staffId)
      .eq('client_dedupe_key', client_dedupe_key)
      .limit(1)
      .maybeSingle()
    if (byKey) {
      return new Response(
        JSON.stringify({ already_active: true, entry: byKey, idempotent: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  }

  // 2. Check for an existing OPEN entry for this (staff, target) pair.
  let existingQ = supabase
    .from('location_time_entries')
    .select('*')
    .eq('staff_id', staffId)
    .is('exited_at', null)
    .limit(1)
  if (location_id) existingQ = existingQ.eq('location_id', location_id)
  if (booking_id) existingQ = existingQ.eq('booking_id', booking_id)
  if (large_project_id) existingQ = existingQ.eq('large_project_id', large_project_id)
  const { data: existing } = await existingQ.maybeSingle()

  if (existing) {
    // Upgrade GPS entry to manual (user confirmed) if needed
    const updates: any = {}
    if (existing.source === 'gps') updates.source = 'manual'
    if (task_id && !existing.task_id) updates.task_id = task_id
    if (client_dedupe_key && !existing.client_dedupe_key) {
      updates.client_dedupe_key = client_dedupe_key
    }
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('location_time_entries')
        .update(updates)
        .eq('id', existing.id)
      Object.assign(existing, updates)
    }
    return new Response(
      JSON.stringify({ already_active: true, entry: existing }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 2b. RACE/RETRY GUARD (2026-05): even if there is no OPEN entry, a
  // pending start coming back online MUST NOT re-open a timer for a
  // window that has already been stopped and reported. Check for a
  // recently CLOSED or CONSUMED row matching this (staff, target) within
  // ±90s of the requested start, in the last 24h.
  //
  // "Consumed" = there is a time_reports row whose source_entry_id points
  // at this LTE — i.e. the user already saved & stopped the timer.
  {
    const requestedTs = (() => {
      if (started_at && typeof started_at === 'string') {
        const t = new Date(started_at).getTime()
        if (!isNaN(t)) return t
      }
      return Date.now()
    })()
    const windowMs = 90 * 1000
    const dayMs = 24 * 3600 * 1000
    const fromIso = new Date(requestedTs - windowMs).toISOString()
    const toIso = new Date(requestedTs + windowMs).toISOString()
    const since24hIso = new Date(Date.now() - dayMs).toISOString()

    let recentQ = supabase
      .from('location_time_entries')
      .select('id, entered_at, exited_at, location_id, booking_id, large_project_id, source, created_at')
      .eq('staff_id', staffId)
      .gte('entered_at', fromIso)
      .lte('entered_at', toIso)
      .gte('created_at', since24hIso)
      .order('entered_at', { ascending: false })
      .limit(5)
    if (location_id) recentQ = recentQ.eq('location_id', location_id)
    if (booking_id) recentQ = recentQ.eq('booking_id', booking_id)
    if (large_project_id) recentQ = recentQ.eq('large_project_id', large_project_id)
    const { data: recentRows } = await recentQ

    if (recentRows && recentRows.length > 0) {
      const candidateIds = recentRows.map((r: any) => r.id)
      // "Consumed" check — does any time_report point at one of these LTEs?
      const { data: consumingReports } = await supabase
        .from('time_reports')
        .select('id, source_entry_id')
        .in('source_entry_id', candidateIds)

      const consumedIds = new Set(
        (consumingReports || []).map((r: any) => r.source_entry_id),
      )
      const blocker = recentRows.find((r: any) =>
        r.exited_at != null || consumedIds.has(r.id),
      )
      if (blocker) {
        return new Response(
          JSON.stringify({
            status: 'already_closed_or_consumed',
            entry: blocker,
            reason: blocker.exited_at != null ? 'already_closed' : 'already_consumed',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }
  }

  // 3. Resolve start time. Allow caller to specify (within last 24h, not in future).
  let enteredAtIso = new Date().toISOString()
  let entryDate = enteredAtIso.split('T')[0]
  if (started_at && typeof started_at === 'string') {
    const parsed = new Date(started_at)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      enteredAtIso = parsed.toISOString()
      entryDate = new Date(parsed.getTime() + 60 * 60 * 1000).toISOString().split('T')[0]
    }
  }

  // 3b. WORKDAY-FIRST GUARANTEE — never create an LTE without an open workday.
  // Use the same `entered_at` so timer-start ≤ workday start cannot occur.
  try {
    await ensureOpenWorkdayForTimer(supabase, {
      staff_id: staffId,
      organization_id: organizationId,
      start_at: enteredAtIso,
      source: 'start_location_timer',
      target: large_project_id
        ? { kind: 'large_project', id: large_project_id }
        : booking_id
          ? { kind: 'booking', id: booking_id }
          : location_id
            ? { kind: 'location', id: location_id }
            : { kind: 'manual' },
    })
  } catch (wdErr: any) {
    console.error('[start_location_timer] workday-first failed, aborting timer start:', wdErr)
    return new Response(
      JSON.stringify({ error: 'workday_first_failed', detail: wdErr?.message || String(wdErr) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 4. Insert new open entry.
  const insertPayload: any = {
    organization_id: organizationId,
    staff_id: staffId,
    entry_date: entryDate,
    entered_at: enteredAtIso,
    source: 'manual',
  }
  if (location_id) insertPayload.location_id = location_id
  if (booking_id) insertPayload.booking_id = booking_id
  if (large_project_id) insertPayload.large_project_id = large_project_id
  if (task_id) insertPayload.task_id = task_id
  if (client_dedupe_key) insertPayload.client_dedupe_key = client_dedupe_key

  const { data: entry, error } = await supabase
    .from('location_time_entries')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    // 23505 = unique_violation — race where another insert won.
    // Re-fetch and return the winning row so the client converges.
    if ((error as any)?.code === '23505') {
      let raceQ = supabase
        .from('location_time_entries')
        .select('*')
        .eq('staff_id', staffId)
        .is('exited_at', null)
        .limit(1)
      if (location_id) raceQ = raceQ.eq('location_id', location_id)
      if (booking_id) raceQ = raceQ.eq('booking_id', booking_id)
      if (large_project_id) raceQ = raceQ.eq('large_project_id', large_project_id)
      const { data: latest } = await raceQ.maybeSingle()
      if (latest) {
        return new Response(
          JSON.stringify({ already_active: true, entry: latest }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
    console.error('Start location timer error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to start timer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 5. LEGACY MIRROR → active_time_registrations.
  // The new Time Engine treats `active_time_registrations` as the SINGLE
  // source of truth for "is a timer active right now?". This handler is
  // legacy (LTE-backed) — it still creates a workday + LTE for backward
  // compatibility with reports/payroll, but it MUST NOT create a parallel
  // active row in any other timer table. We mirror into active_time_registrations
  // with start_source='user_timer', auto_started=false.
  try {
    let currentKind: string = 'unknown_place'
    let currentLabel: string = 'Okänd plats'
    let currentTargetType: string | null = null
    let currentTargetId: string | null = null
    if (large_project_id) {
      currentKind = 'project'
      currentTargetType = 'large_project'
      currentTargetId = large_project_id
      const { data: lp } = await supabase.from('large_projects')
        .select('name').eq('id', large_project_id).maybeSingle()
      currentLabel = lp?.name ?? 'Projekt'
    } else if (booking_id) {
      currentKind = 'booking'
      currentTargetType = 'booking'
      currentTargetId = booking_id
      const { data: b } = await supabase.from('bookings')
        .select('client, title, booking_number')
        .eq('id', booking_id).maybeSingle()
      currentLabel = b?.client || b?.title || b?.booking_number || 'Bokning'
    } else if (location_id) {
      currentKind = 'warehouse'
      currentTargetType = 'location'
      currentTargetId = location_id
      const { data: l } = await supabase.from('organization_locations')
        .select('name').eq('id', location_id).maybeSingle()
      currentLabel = l?.name ?? 'Plats'
    }

    // Stop any other active row for this staff (unique index also enforces).
    await supabase
      .from('active_time_registrations')
      .update({ status: 'stopped', stopped_at: new Date().toISOString(), stop_source: 'superseded_by_new_start' })
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('status', 'active')

    await supabase.from('active_time_registrations').insert({
      organization_id: organizationId,
      staff_id: staffId,
      status: 'active',
      started_at: enteredAtIso,
      started_by: staffId,
      start_source: 'user_timer',
      auto_started: false,
      start_target_type: currentTargetType,
      start_target_id: currentTargetId,
      start_target_label: currentLabel,
      current_kind: currentKind,
      current_label: currentLabel,
      current_target_type: currentTargetType,
      current_target_id: currentTargetId,
      current_confidence: 1,
      needs_user_choice: false,
      metadata: { linked_location_time_entry_id: entry.id, legacy_lte_mirror: true },
    })
  } catch (regErr) {
    console.warn('[start_location_timer] active_time_registrations mirror failed (non-fatal):', regErr)
  }

  return new Response(
    JSON.stringify({ success: true, entry }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ==================== LAGER (INTERNAL PROJECT) TASKS ====================

/**
 * Returns the warehouse assignments for the logged-in staff member,
 * shown in the Time-app's Lager detail view ("Mina lageruppgifter").
 *
 * Sources:
 *  1. project_tasks under the org's internal Lager project where
 *     assigned_to_ids includes staffId (interna lageruppgifter).
 *  2. warehouse_calendar_events for the dates the staff member is
 *     assigned to a warehouse team (staff_assignments.team_id starts
 *     with 'lager-' or equals 'transport') — best-effort koppling.
 *
 * TODO(next): När vi har en explicit person↔warehouse_calendar_events
 * koppling (t.ex. warehouse_event_assignments), filtrera direkt på den
 * istället för dag/team-härledning.
 */
type LagerAssignmentDTO = {
  id: string
  type: 'packing' | 'return' | 'inventory' | 'internal_task' | 'other'
  title: string
  description: string | null
  date: string | null
  start_time: string | null
  end_time: string | null
  status: string
  action: 'open_scanner' | 'open_return_scanner' | 'open_inventory' | 'complete_task' | 'open_details'
  packing_id: string | null
  packlist_id: string | null
  booking_id: string | null
  booking_number: string | null
  delivery_address: string | null
  customer_name: string | null
  project_task_id: string | null
  warehouse_event_id: string | null
  source: string
  metadata: Record<string, unknown> | null
  // Legacy/back-compat fields kept so existing mobile builds keep working:
  event_type: string
  assignment_type: 'packing' | 'return' | 'inventory' | 'internal_task' | 'other'
  completed: boolean
}

function deriveLagerType(raw: string | null | undefined): LagerAssignmentDTO['type'] {
  const t = (raw || '').toLowerCase()
  if (t === 'packing' || t === 'return' || t === 'inventory' || t === 'internal_task') return t
  if (t === 'unpacking') return 'return'
  return 'other'
}

function deriveLagerAction(
  type: LagerAssignmentDTO['type'],
  raw: string | null | undefined,
): LagerAssignmentDTO['action'] {
  const a = (raw || '').toLowerCase()
  if (a === 'open_scanner' || a === 'open_return_scanner' || a === 'open_inventory' || a === 'complete_task' || a === 'open_details') {
    return a as LagerAssignmentDTO['action']
  }
  if (type === 'packing') return 'open_scanner'
  if (type === 'return') return 'open_return_scanner'
  if (type === 'inventory') return 'open_inventory'
  if (type === 'internal_task') return 'complete_task'
  return 'open_details'
}

async function handleGetLagerAssignments(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const dateFrom: string = (data?.date_from as string) ||
    new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const dateTo: string = (data?.date_to as string) ||
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10)

  const assignments: LagerAssignmentDTO[] = []
  const seenWarehouseEventIds = new Set<string>()
  let canonicalCount = 0

  // 1) Canonical: warehouse_assignments rows for this staff_id (PRIMARY SOURCE)
  try {
    const { data: wa, error: waErr } = await supabase
      .from('warehouse_assignments')
      .select(
        'id, assignment_date, assignment_type, action, title, description, status, start_time, end_time, ' +
        'warehouse_event_id, packing_id, packlist_id, booking_id, booking_number, delivery_address, ' +
        'customer_name, project_task_id, source, metadata',
      )
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .gte('assignment_date', dateFrom)
      .lte('assignment_date', dateTo)
      .order('start_time', { ascending: true, nullsFirst: false })

    if (waErr) {
      console.warn('[get_lager_assignments] warehouse_assignments err:', waErr)
    } else {
      for (const r of wa || []) {
        if (r.warehouse_event_id) seenWarehouseEventIds.add(r.warehouse_event_id)
        const type = deriveLagerType(r.assignment_type)
        const action = deriveLagerAction(type, r.action)
        assignments.push({
          id: `wa-${r.id}`,
          type,
          title: r.title || r.customer_name || 'Lageruppgift',
          description: r.description ?? null,
          date: r.assignment_date ?? (r.start_time ? String(r.start_time).slice(0, 10) : null),
          start_time: r.start_time ?? null,
          end_time: r.end_time ?? null,
          status: r.status || 'planned',
          action,
          packing_id: r.packing_id ?? null,
          packlist_id: r.packlist_id ?? null,
          booking_id: r.booking_id ?? null,
          booking_number: r.booking_number ?? null,
          delivery_address: r.delivery_address ?? null,
          customer_name: r.customer_name ?? null,
          project_task_id: r.project_task_id ?? null,
          warehouse_event_id: r.warehouse_event_id ?? null,
          source: r.source || 'warehouse_assignments',
          metadata: (r.metadata as Record<string, unknown>) ?? null,
          event_type: type,
          assignment_type: type,
          completed: r.status === 'completed',
        })
        canonicalCount += 1
      }
    }
  } catch (e) {
    console.error('[get_lager_assignments] warehouse_assignments block failed:', e)
  }

  // 2) Internal lager project tasks assigned to this staff
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, booking_id')
      .eq('organization_id', organizationId)
      .eq('is_internal', true)
      .maybeSingle()

    if (project) {
      const { data: tasks, error: tErr } = await supabase
        .from('project_tasks')
        .select('id, title, description, deadline, completed, assigned_to_ids, created_at')
        .eq('project_id', project.id)
        .contains('assigned_to_ids', [staffId])
        .order('deadline', { ascending: true, nullsFirst: false })

      if (tErr) {
        console.warn('[get_lager_assignments] project_tasks err:', tErr)
      } else {
        for (const t of tasks || []) {
          const startIso = t.deadline ?? t.created_at
          assignments.push({
            id: `task-${t.id}`,
            type: 'internal_task',
            title: t.title,
            description: t.description ?? null,
            date: startIso ? String(startIso).slice(0, 10) : null,
            start_time: startIso ?? null,
            end_time: t.deadline ?? null,
            status: t.completed ? 'completed' : 'planned',
            action: 'complete_task',
            packing_id: null,
            packlist_id: null,
            booking_id: project.booking_id ?? null,
            booking_number: null,
            delivery_address: null,
            customer_name: null,
            project_task_id: t.id,
            warehouse_event_id: null,
            source: 'project_task',
            metadata: null,
            event_type: 'internal_task',
            assignment_type: 'internal_task',
            completed: !!t.completed,
          })
        }
      }
    } else {
      console.warn('[get_lager_assignments] internal lager project missing for org', organizationId)
    }
  } catch (e) {
    console.error('[get_lager_assignments] tasks block failed:', e)
  }

  // 3) FALLBACK: warehouse_calendar_events on dates where staff has lager team placement
  //    Only used to back-fill events not already represented in warehouse_assignments.
  let lagerDates = new Set<string>()
  let lagerTeams = new Set<string>()
  try {
    const { data: sa, error: saErr } = await supabase
      .from('staff_assignments')
      .select('team_id, assignment_date')
      .eq('staff_id', staffId)
      .gte('assignment_date', dateFrom)
      .lte('assignment_date', dateTo)

    if (saErr) {
      console.warn('[get_lager_assignments] staff_assignments err:', saErr)
    }

    for (const row of sa || []) {
      const tid = String(row.team_id || '')
      if (isWarehouseTeam(tid)) {
        lagerDates.add(row.assignment_date)
        if (tid.startsWith('lager-')) lagerTeams.add(tid)
      }
    }

    if (lagerDates.size > 0) {
      let q = supabase
        .from('warehouse_calendar_events')
        .select('id, title, booking_id, booking_number, start_time, end_time, event_type, delivery_address, resource_id')
        .eq('organization_id', organizationId)
        .gte('start_time', `${dateFrom}T00:00:00`)
        .lte('start_time', `${dateTo}T23:59:59`)

      if (lagerTeams.size > 0) {
        q = q.in('resource_id', Array.from(lagerTeams))
      }

      const { data: wEvents, error: wErr } = await q
      if (wErr) {
        console.warn('[get_lager_assignments] warehouse_calendar_events err:', wErr)
      } else {
        for (const w of wEvents || []) {
          const day = (w.start_time as string)?.slice(0, 10)
          if (!day || !lagerDates.has(day)) continue
          if (seenWarehouseEventIds.has(w.id)) continue
          const type = deriveLagerType(w.event_type)
          const action = deriveLagerAction(type, null)
          assignments.push({
            id: `wce-${w.id}`,
            type,
            title: w.title || w.booking_number || 'Lageruppgift',
            description: null,
            date: day,
            start_time: w.start_time ?? null,
            end_time: w.end_time ?? null,
            status: 'planned',
            action,
            packing_id: null,
            packlist_id: null,
            booking_id: w.booking_id ?? null,
            booking_number: w.booking_number ?? null,
            delivery_address: w.delivery_address ?? null,
            customer_name: w.title ?? null,
            project_task_id: null,
            warehouse_event_id: w.id,
            source: 'warehouse_calendar_event',
            metadata: null,
            event_type: w.event_type || 'warehouse',
            assignment_type: type,
            completed: false,
          })
        }
      }
    }
  } catch (e) {
    console.error('[get_lager_assignments] warehouse block failed:', e)
  }

  // 4) FINAL FALLBACK: legacy lager-team placement without details — show a placeholder per day
  //    so the user still sees "Lager" in the Time-app even if no concrete tasks have been linked yet.
  try {
    const datesWithAssignments = new Set(
      assignments.map((a) => a.date).filter((d): d is string => !!d),
    )
    for (const day of lagerDates) {
      if (datesWithAssignments.has(day)) continue
      assignments.push({
        id: `placeholder-${day}`,
        type: 'other',
        title: 'Lagerpass',
        description: 'Inga detaljerade lageruppgifter tilldelade ännu.',
        date: day,
        start_time: null,
        end_time: null,
        status: 'planned',
        action: 'open_details',
        packing_id: null,
        packlist_id: null,
        booking_id: null,
        booking_number: null,
        delivery_address: null,
        customer_name: null,
        project_task_id: null,
        warehouse_event_id: null,
        source: 'staff_assignment_fallback',
        metadata: { reason: 'no_detailed_warehouse_assignments' },
        event_type: 'warehouse',
        assignment_type: 'other',
        completed: false,
      })
    }
  } catch (e) {
    console.error('[get_lager_assignments] placeholder block failed:', e)
  }

  // Sort: scheduled times first (asc), tasks without time last
  assignments.sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER
    const tb = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER
    return ta - tb
  })

  // Build summary
  const startTimes = assignments.map((a) => a.start_time).filter((x): x is string => !!x).sort()
  const endTimes = assignments.map((a) => a.end_time).filter((x): x is string => !!x).sort()
  const types = Array.from(new Set(assignments.map((a) => a.type)))
  const summary = {
    has_warehouse_work: assignments.length > 0,
    assignment_count: assignments.length,
    canonical_count: canonicalCount,
    first_start_time: startTimes[0] ?? null,
    last_end_time: endTimes[endTimes.length - 1] ?? null,
    types,
  }

  console.log('[get_lager_assignments] returning', { staffId, count: assignments.length, canonicalCount })

  return new Response(
    JSON.stringify({ assignments, summary }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function handleGetLagerTasks(supabase: any, staffId: string, organizationId: string) {
  // Find internal Lager project for org
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_internal', true)
    .maybeSingle()

  if (pErr || !project) {
    return new Response(
      JSON.stringify({ project: null, my_tasks: [], open_tasks: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: tasks, error: tErr } = await supabase
    .from('project_tasks')
    .select('*')
    .eq('project_id', project.id)
    .eq('completed', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })

  if (tErr) {
    console.error('Get lager tasks error:', tErr)
    return new Response(
      JSON.stringify({ error: 'Failed to load tasks' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const allTasks = tasks || []
  const myTasks = allTasks.filter((t: any) =>
    Array.isArray(t.assigned_to_ids) && t.assigned_to_ids.includes(staffId)
  )
  const openTasks = allTasks.filter((t: any) =>
    !Array.isArray(t.assigned_to_ids) || t.assigned_to_ids.length === 0
  )

  return new Response(
    JSON.stringify({ project, my_tasks: myTasks, open_tasks: openTasks }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreateLagerTask(supabase: any, staffId: string, data: any, organizationId: string) {
  const { title, description, deadline, assign_to_me } = data || {}
  if (!title || typeof title !== 'string' || !title.trim()) {
    return new Response(
      JSON.stringify({ error: 'title is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_internal', true)
    .maybeSingle()

  if (!project) {
    return new Response(
      JSON.stringify({ error: 'Internt Lager-projekt saknas' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: task, error } = await supabase
    .from('project_tasks')
    .insert({
      organization_id: organizationId,
      project_id: project.id,
      title: title.trim(),
      description: description?.trim() || null,
      deadline: deadline || null,
      assigned_to_ids: assign_to_me ? [staffId] : [],
      completed: false,
    })
    .select()
    .single()

  if (error) {
    console.error('Create lager task error:', error)
    return new Response(
      JSON.stringify({ error: 'Kunde inte skapa uppgift' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, task }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCompleteLagerTask(supabase: any, data: any, organizationId: string) {
  const { task_id, completed } = data || {}
  if (!task_id) {
    return new Response(
      JSON.stringify({ error: 'task_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update({ completed: completed !== false })
    .eq('id', task_id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    console.error('Complete lager task error:', error)
    return new Response(
      JSON.stringify({ error: 'Kunde inte uppdatera uppgift' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, task }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleClaimLagerTask(supabase: any, staffId: string, data: any, organizationId: string) {
  const { task_id } = data || {}
  if (!task_id) {
    return new Response(
      JSON.stringify({ error: 'task_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Read current assigned_to_ids
  const { data: existing } = await supabase
    .from('project_tasks')
    .select('assigned_to_ids')
    .eq('id', task_id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  const current: string[] = Array.isArray(existing?.assigned_to_ids) ? existing!.assigned_to_ids : []
  if (!current.includes(staffId)) current.push(staffId)

  const { data: task, error } = await supabase
    .from('project_tasks')
    .update({ assigned_to_ids: current })
    .eq('id', task_id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    console.error('Claim lager task error:', error)
    return new Response(
      JSON.stringify({ error: 'Kunde inte ta uppgift' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, task }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ==================== LAGER TEAM / PURCHASES / FILES ====================

async function handleGetLagerTeam(supabase: any, organizationId: string) {
  // Dagens Lager-team = personal som faktiskt är assignad till
  // personalkalenderns Lager-kolumn idag (staff_assignments.team_id='transport').
  // Lager-tagg och warehouse_staff_activations används INTE som källa här —
  // de styr endast tillgänglighet/synlighet i lagerflödet.
  const today = new Date().toISOString().split('T')[0]

  const { data: assignments, error: aErr } = await supabase
    .from('staff_assignments')
    .select('staff_id')
    .eq('organization_id', organizationId)
    .eq('team_id', 'transport')
    .eq('assignment_date', today)

  if (aErr) {
    console.error('[get_lager_team] staff_assignments err:', aErr)
    return new Response(
      JSON.stringify({ team: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const staffIds = Array.from(
    new Set((assignments || []).map((r: any) => r.staff_id).filter(Boolean)),
  )
  if (staffIds.length === 0) {
    console.log('[get_lager_team] no transport assignments today', { organizationId, today })
    return new Response(
      JSON.stringify({ team: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { data: staffMembers, error: sErr } = await supabase
    .from('staff_members')
    .select('id, name, phone, email, role, color')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .in('id', staffIds)

  if (sErr) {
    console.error('[get_lager_team] staff_members err:', sErr)
    return new Response(
      JSON.stringify({ team: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const team = (staffMembers || [])
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      role: s.role,
      color: s.color,
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv'))

  console.log('[get_lager_team] returning team', { organizationId, today, count: team.length })

  return new Response(
    JSON.stringify({ team }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function getInternalLagerProjectId(supabase: any, organizationId: string): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_internal', true)
    .maybeSingle()
  return project?.id || null
}

async function handleGetLagerPurchases(supabase: any, organizationId: string) {
  const projectId = await getInternalLagerProjectId(supabase, organizationId)
  if (!projectId) {
    return new Response(JSON.stringify({ purchases: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: purchases, error } = await supabase
    .from('project_purchases')
    .select('id, description, amount, supplier, category, receipt_url, purchase_date, created_by, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Get lager purchases err:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch purchases' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ purchases: purchases || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreateLagerPurchase(supabase: any, staffId: string, data: any, organizationId: string) {
  const { description, amount, supplier, receipt_image } = data || {}
  if (!description || amount === undefined || amount === null) {
    return new Response(JSON.stringify({ error: 'description and amount are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const projectId = await getInternalLagerProjectId(supabase, organizationId)
  if (!projectId) {
    return new Response(JSON.stringify({ error: 'Internt Lager-projekt saknas' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: staffMember } = await supabase.from('staff_members').select('name').eq('id', staffId).single()

  let receiptUrl: string | null = null
  if (receipt_image && typeof receipt_image === 'string') {
    try {
      const base64Data = receipt_image.replace(/^data:image\/\w+;base64,/, '')
      const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
      let extension = 'jpg'
      if (receipt_image.includes('image/png')) extension = 'png'
      else if (receipt_image.includes('image/webp')) extension = 'webp'
      const fileName = `receipts/${projectId}/${Date.now()}-receipt.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(fileName, imageBuffer, { contentType: `image/${extension}`, upsert: false })
      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(fileName)
        receiptUrl = urlData.publicUrl
      } else {
        console.error('Lager receipt upload error:', uploadError)
      }
    } catch (e) {
      console.error('Lager receipt processing error:', e)
    }
  }

  const { data: purchase, error } = await supabase
    .from('project_purchases')
    .insert({
      project_id: projectId,
      description,
      amount: parseFloat(amount),
      supplier: supplier || null,
      category: 'lager',
      receipt_url: receiptUrl,
      purchase_date: new Date().toISOString().split('T')[0],
      created_by: staffMember?.name || 'Mobile App',
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    console.error('Lager purchase creation error:', error)
    return new Response(JSON.stringify({ error: 'Kunde inte spara inköp' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(
    JSON.stringify({ success: true, purchase }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetLagerFiles(supabase: any, organizationId: string) {
  const projectId = await getInternalLagerProjectId(supabase, organizationId)
  if (!projectId) {
    return new Response(JSON.stringify({ files: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: files } = await supabase
    .from('project_files')
    .select('id, file_name, file_type, url, uploaded_by, uploaded_at')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })

  return new Response(
    JSON.stringify({ files: files || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleUploadLagerFile(supabase: any, staffId: string, data: any, organizationId: string) {
  const { file_name, file_type, file_data } = data || {}
  if (!file_name || !file_data) {
    return new Response(JSON.stringify({ error: 'file_name and file_data are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  if (file_type && !allowedTypes.includes(file_type)) {
    return new Response(JSON.stringify({ error: 'File type not allowed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const projectId = await getInternalLagerProjectId(supabase, organizationId)
  if (!projectId) {
    return new Response(JSON.stringify({ error: 'Internt Lager-projekt saknas' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: staffMember } = await supabase.from('staff_members').select('name').eq('id', staffId).single()

  try {
    const base64Match = file_data.match(/^data:(.+);base64,(.+)$/)
    let fileBuffer: Uint8Array
    let contentType = file_type || 'application/octet-stream'
    if (base64Match) {
      contentType = base64Match[1]
      fileBuffer = Uint8Array.from(atob(base64Match[2]), c => c.charCodeAt(0))
    } else {
      fileBuffer = Uint8Array.from(atob(file_data), c => c.charCodeAt(0))
    }

    if (fileBuffer.length > 10 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large. Max 10MB' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const sanitizedName = file_name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
    const storagePath = `lager/${projectId}/${Date.now()}-${sanitizedName}`

    const { error: uploadError } = await supabase.storage
      .from('project-files')
      .upload(storagePath, fileBuffer, { contentType, upsert: false })

    if (uploadError) {
      console.error('Lager file upload error:', uploadError)
      return new Response(JSON.stringify({ error: 'Failed to upload file' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: urlData } = supabase.storage.from('project-files').getPublicUrl(storagePath)

    const { data: fileRecord, error: fileError } = await supabase
      .from('project_files')
      .insert({
        project_id: projectId,
        file_name,
        file_type: contentType,
        url: urlData.publicUrl,
        uploaded_by: staffMember?.name || 'Mobile App',
        organization_id: organizationId,
      })
      .select()
      .single()

    if (fileError) {
      console.error('Lager file record err:', fileError)
      return new Response(JSON.stringify({ error: 'Failed to create file record' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(
      JSON.stringify({ success: true, file: fileRecord }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('Lager upload error:', err)
    return new Response(JSON.stringify({ error: err?.message || 'Upload failed' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

// LEGACY ONLY.
// Do not use for Time Engine v2.
// New active timer source is active_time_registrations.
async function handleStopLocationTimerLegacyDisabled(supabase: any, staffId: string, data: any, organizationId: string) {
  const { location_id, booking_id, large_project_id, entry_id, stop_source, stop_reason, stop_metadata } = data || {}

  let query = supabase
    .from('location_time_entries')
    .update({
      exited_at: new Date().toISOString(),
      stop_source: stop_source || 'user_manual',
      stop_reason: stop_reason || 'user_pressed_stop',
      stopped_by: staffId,
      stop_metadata: stop_metadata || {},
    })
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('exited_at', null)

  if (entry_id) {
    query = query.eq('id', entry_id)
  } else if (location_id) {
    query = query.eq('location_id', location_id)
  } else if (booking_id) {
    query = query.eq('booking_id', booking_id)
  } else if (large_project_id) {
    query = query.eq('large_project_id', large_project_id)
  } else {
    return new Response(
      JSON.stringify({ error: 'location_id, booking_id, large_project_id or entry_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: updated, error } = await query.select().order('entered_at', { ascending: false }).limit(1).maybeSingle()

  if (error) {
    console.error('Stop location timer error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to stop timer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Mirror stop into active_time_registrations (single source of truth).
  try {
    await supabase
      .from('active_time_registrations')
      .update({
        status: 'stopped',
        stopped_at: new Date().toISOString(),
        stopped_by: staffId,
        stop_source: stop_source || 'user_manual',
      })
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('status', 'active')
  } catch (regErr) {
    console.warn('[stop_location_timer] active_time_registrations mirror failed (non-fatal):', regErr)
  }

  return new Response(
    JSON.stringify({ success: true, entry: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ────────────────────────────────────────────────────────────────────────
// stop_open_entry — universal "stop a server-only LTE" action
// ────────────────────────────────────────────────────────────────────────
// Purpose: a server-side LTE that has no matching local timer must still be
// stoppable from the app. Mirrors what useWorkSession.stopSession does for
// local timers, but operates purely from `entry_id`:
//   1) load the open LTE (org/staff scoped)
//   2) if the target requires a time_report (booking/large_project/location-
//      mapped reportable entry), create one spanning entered_at → stop_at
//   3) close the LTE with exited_at + stop_source/stop_reason/stopped_by
//   4) return the refreshed active_day_state envelope
//
// Body: { entry_id: string, stop_at?: ISO, stop_source?, stop_reason?,
//         skip_time_report?: boolean, break_time?: number }
// LEGACY ONLY.
// Do not use for Time Engine v2.
// New active timer source is active_time_registrations.
async function handleStopOpenEntryLegacyOnly(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    entry_id,
    stop_at,
    stop_source,
    stop_reason,
    skip_time_report,
    break_time,
  } = data || {}

  if (!entry_id || typeof entry_id !== 'string') {
    return new Response(
      JSON.stringify({ error: 'entry_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 1) Load the open LTE (must belong to this staff + org and be still open).
  const { data: entry, error: loadErr } = await supabase
    .from('location_time_entries')
    .select('*')
    .eq('id', entry_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (loadErr) {
    console.error('[stop_open_entry] load failed:', loadErr)
    return new Response(
      JSON.stringify({ error: 'Failed to load entry' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (!entry) {
    return new Response(
      JSON.stringify({ error: 'Entry not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (entry.exited_at) {
    // Idempotent — already closed. Return current state so the UI clears.
    const stateRes = await handleGetActiveDayStateLegacyOnly(supabase, staffId, organizationId)
    const stateBody = await stateRes.json().catch(() => ({}))
    return new Response(
      JSON.stringify({ success: true, already_closed: true, entry, active_day_state: stateBody }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const stopIso = (typeof stop_at === 'string' && stop_at) || new Date().toISOString()
  const startedAt = new Date(entry.entered_at)
  const stoppedAt = new Date(stopIso)
  if (!(stoppedAt > startedAt)) {
    return new Response(
      JSON.stringify({ error: 'stop_at must be after entered_at' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // 2) Optionally create a time_report. Skip for pure "presence" entries
  // (location entries that started without an associated reportable target),
  // for caller-requested skips, and when the entry has no booking/project link.
  const md = (entry.metadata && typeof entry.metadata === 'object') ? entry.metadata : {}
  const presenceOnly = md.presence_only === true || md.role === 'presence'
  const wantsReport = !skip_time_report && !presenceOnly &&
    (entry.booking_id || entry.large_project_id || entry.location_id)

  let createdReportId: string | null = null
  if (wantsReport) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const report_date = `${startedAt.getUTCFullYear()}-${pad(startedAt.getUTCMonth() + 1)}-${pad(startedAt.getUTCDate())}`
    const start_time = `${pad(startedAt.getUTCHours())}:${pad(startedAt.getUTCMinutes())}`
    const end_time = `${pad(stoppedAt.getUTCHours())}:${pad(stoppedAt.getUTCMinutes())}`

    // Encode location-only entries the way handleCreateTimeReport expects.
    let trBookingId: string | null = entry.booking_id || null
    let trLargeProjectId: string | null = entry.large_project_id || null
    if (!trBookingId && !trLargeProjectId && entry.location_id) {
      trBookingId = `location-${entry.location_id}`
    }

    const trRes = await handleCreateTimeReport(supabase, staffId, {
      booking_id: trBookingId || undefined,
      large_project_id: trLargeProjectId || undefined,
      report_date,
      start_time,
      end_time,
      break_time: typeof break_time === 'number' ? break_time : 0,
      description: 'Stoppad från banner (server-only timer)',
    }, organizationId)

    if (trRes.status >= 400) {
      const body = await trRes.json().catch(() => ({}))
      console.warn('[stop_open_entry] time_report create failed, closing LTE anyway:', body)
      // We do NOT abort — closing the orphan LTE is more important than
      // failing the whole stop. The client can offer "Korrigera" afterwards.
    } else {
      const body = await trRes.json().catch(() => ({}))
      createdReportId = body?.report?.id || body?.id || null
    }
  }

  // 3) Close the LTE.
  const stopMd = {
    ...(entry.stop_metadata && typeof entry.stop_metadata === 'object' ? entry.stop_metadata : {}),
    closed_via: 'stop_open_entry',
    created_time_report_id: createdReportId,
    skipped_time_report: !wantsReport,
  }
  const { data: closed, error: closeErr } = await supabase
    .from('location_time_entries')
    .update({
      exited_at: stopIso,
      stop_source: stop_source || 'user_manual',
      stop_reason: stop_reason || 'banner_stop_server_only',
      stopped_by: staffId,
      stop_metadata: stopMd,
    })
    .eq('id', entry.id)
    .is('exited_at', null)
    .select()
    .maybeSingle()

  if (closeErr) {
    console.error('[stop_open_entry] close failed:', closeErr)
    return new Response(
      JSON.stringify({ error: 'Failed to close entry', detail: closeErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Mirror stop into active_time_registrations (single source of truth).
  try {
    await supabase
      .from('active_time_registrations')
      .update({
        status: 'stopped',
        stopped_at: stopIso,
        stopped_by: staffId,
        stop_source: 'banner_stop_server_only',
      })
      .eq('organization_id', organizationId)
      .eq('staff_id', staffId)
      .eq('status', 'active')
  } catch (regErr) {
    console.warn('[stop_open_entry] active_time_registrations mirror failed (non-fatal):', regErr)
  }

  // 4) Return refreshed active_day_state for instant UI rehydrate.
  const stateRes = await handleGetActiveDayStateLegacyOnly(supabase, staffId, organizationId)
  const stateBody = await stateRes.json().catch(() => ({}))

  return new Response(
    JSON.stringify({
      success: true,
      entry: closed || entry,
      created_time_report_id: createdReportId,
      active_day_state: stateBody,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// Dismiss (delete) a GPS-created location entry when user says "Inte nu"
async function handleDismissLocationEntry(supabase: any, staffId: string, data: any, organizationId: string) {
  const { location_id } = data || {}
  if (!location_id) {
    return new Response(
      JSON.stringify({ error: 'location_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Delete (not just close) the GPS entry — user explicitly declined, no time should be recorded
  const { error } = await supabase
    .from('location_time_entries')
    .delete()
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('location_id', location_id)
    .eq('source', 'gps')
    .is('exited_at', null)

  if (error) {
    console.error('Dismiss location entry error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to dismiss location entry' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// LEGACY ONLY.
// Do not use for Time Engine v2.
// New active timer source is active_time_registrations.
async function handleGetLocationTimeEntriesLegacyOnly(supabase: any, staffId: string, data: any, organizationId: string) {
  const { date_from, date_to, limit: queryLimit } = data || {}

  let query = supabase
    .from('location_time_entries')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .order('entered_at', { ascending: false })
    .limit(queryLimit || 100)

  if (date_from) query = query.gte('entry_date', date_from)
  if (date_to) query = query.lte('entry_date', date_to)

  const { data: entries, error } = await query

  if (error) {
    console.error('Get location time entries error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch entries' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ entries: entries || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleStartTravelLog(supabase: any, staffId: string, data: any, organizationId: string) {
  const { from_address, from_latitude, from_longitude, description, auto_detected } = data || {}

  const startIso = new Date().toISOString()

  // Idempotency / recovery: if the client already has an open travel row for
  // this staff member, reuse it instead of creating a second one. This covers
  // stale localStorage, retry storms, and slow network races where the app
  // fires "start travel" twice before the first response comes back.
  const { data: existingOpenTravel, error: existingOpenTravelError } = await supabase
    .from('travel_time_logs')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingOpenTravelError) {
    console.error('[handleStartTravelLog] fetch existing open travel failed:', existingOpenTravelError)
  } else if (existingOpenTravel) {
    console.log(
      `[handleStartTravelLog] Reusing existing open travel ${existingOpenTravel.id} for staff ${staffId}`
    )
    return new Response(
      JSON.stringify({
        success: true,
        recovered_existing: true,
        travel_log: existingOpenTravel,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── GUARD: Reject travel-start if the user is currently inside a known
  // geofence (org_location like FA Warehouse, or a booking delivery point
  // they are assigned to). Without this guard, GPS jitter while walking
  // around the warehouse with a forklift triggers auto-travel detection,
  // which then atomically closes the user's lager-presence timer below.
  // Result: a perfectly valid lager session is killed at e.g. 07:21 even
  // though the staff member never left the property.
  //
  // We only reject auto_detected starts — manual user-initiated travels
  // (a person explicitly tapping "Start travel") still go through, in
  // case they're loading a vehicle and about to drive off.
  if (auto_detected !== false && typeof from_latitude === 'number' && typeof from_longitude === 'number') {
    // ── PRE-WORKDAY GATE ────────────────────────────────────────────
    // Auto-detected travel may NEVER be the day's first work signal.
    // Travel time only counts as work AFTER the staff member has had
    // at least one real work presence today: a fixed location (lager/
    // office), an internal warehouse project, a regular booking, or a
    // large project. Morning commute home → first job is private and
    // must not auto-log travel.
    //
    // We accept any of these as "the day has truly started":
    //   • a location_time_entries row that started today (any kind)
    //   • a time_reports row with a start_time today
    //   • an arrival_signals/assistant_events arrival happened earlier today
    //
    // If none of those exist BEFORE the proposed travel start time,
    // we reject with 409 reason=pre_workday_commute.
    try {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartIso = todayStart.toISOString()

      const [lteRes, trRes, arrRes] = await Promise.all([
        supabase
          .from('location_time_entries')
          .select('entered_at')
          .eq('staff_id', staffId)
          .eq('organization_id', organizationId)
          .gte('entered_at', todayStartIso)
          .lt('entered_at', startIso)
          .limit(1),
        supabase
          .from('time_reports')
          .select('start_time')
          .eq('staff_id', staffId)
          .eq('organization_id', organizationId)
          .gte('start_time', todayStartIso)
          .lt('start_time', startIso)
          .limit(1),
        supabase
          .from('assistant_events')
          .select('happened_at')
          .eq('staff_id', staffId)
          .eq('organization_id', organizationId)
          .eq('event_type', 'arrival')
          .in('target_type', ['location', 'project', 'booking'])
          .gte('happened_at', todayStartIso)
          .lt('happened_at', startIso)
          .limit(1),
      ])

      const hadEarlierWorkPresence =
        (lteRes.data && lteRes.data.length > 0) ||
        (trRes.data && trRes.data.length > 0) ||
        (arrRes.data && arrRes.data.length > 0)

      if (!hadEarlierWorkPresence) {
        console.log(
          `[handleStartTravelLog] BLOCKED — staff ${staffId} has no prior work presence today; refusing to auto-start morning commute travel.`
        )
        return new Response(
          JSON.stringify({
            success: false,
            blocked: true,
            reason: 'pre_workday_commute',
            message: 'Auto-detected travel cannot start before the first work visit of the day.',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (e) {
      // Soft-fail: if the lookup itself errors, proceed. Better to log a
      // travel row that admin can edit than to silently kill all trips.
      console.error('[handleStartTravelLog] pre-workday gate exception (proceeding anyway):', e)
    }

    try {
      const haversine = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const R = 6371000
        const toRad = (d: number) => (d * Math.PI) / 180
        const dLat = toRad(lat2 - lat1)
        const dLng = toRad(lng2 - lng1)
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      }

      // 1. Check organization_locations (warehouses, offices, fixed sites)
      const { data: orgLocs } = await supabase
        .from('organization_locations')
        .select('id, name, latitude, longitude, radius_meters, is_active')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
      if (orgLocs && orgLocs.length > 0) {
        for (const loc of orgLocs) {
          if (loc.latitude == null || loc.longitude == null) continue
          const dist = haversine(from_latitude, from_longitude, loc.latitude, loc.longitude)
          const radius = loc.radius_meters || 200
          if (dist <= radius) {
            console.log(`[handleStartTravelLog] BLOCKED — staff ${staffId} is inside org_location "${loc.name}" (${dist.toFixed(0)}m, radius ${radius}m). Travel will not start.`)
            return new Response(
              JSON.stringify({
                success: false,
                blocked: true,
                reason: 'inside_geofence',
                location_name: loc.name,
                distance_m: Math.round(dist),
              }),
              { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
      }

      // 2. Check bookings the staff is assigned to today (rig/event/rigdown)
      const today = new Date().toISOString().split('T')[0]
      const { data: assignments } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .eq('assignment_date', today)
      const bookingIds = Array.from(new Set((assignments || []).map((a: any) => a.booking_id).filter(Boolean)))
      if (bookingIds.length > 0) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, delivery_latitude, delivery_longitude')
          .in('id', bookingIds)
          .not('delivery_latitude', 'is', null)
          .not('delivery_longitude', 'is', null)
        if (bookings && bookings.length > 0) {
          for (const b of bookings) {
            const dist = haversine(from_latitude, from_longitude, b.delivery_latitude, b.delivery_longitude)
            if (dist <= 200) {
              console.log(`[handleStartTravelLog] BLOCKED — staff ${staffId} is inside booking "${b.client}" geofence (${dist.toFixed(0)}m). Travel will not start.`)
              return new Response(
                JSON.stringify({
                  success: false,
                  blocked: true,
                  reason: 'inside_geofence',
                  location_name: b.client,
                  distance_m: Math.round(dist),
                }),
                { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
          }
        }
      }
    } catch (e) {
      // Non-fatal — if the guard query fails we still proceed. Better to
      // create a stoppable travel row than to silently block all trips.
      console.error('[handleStartTravelLog] geofence guard exception (proceeding anyway):', e)
    }
  }

  // ── Atomic auto-close of any still-open location_time_entries for this staff.
  // Without this, a forgotten warehouse "presence" timer keeps ticking in
  // parallel with the new travel log → admin sees two live timers and the
  // total double-counts. We close them at the exact travel start_time so
  // the two segments meet edge-to-edge with no overlap.
  // total_minutes is a generated column → only set exited_at.
  try {
    const { data: openEntries, error: openErr } = await supabase
      .from('location_time_entries')
      .select('id')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('exited_at', null)
      .lt('entered_at', startIso)
    if (openErr) {
      console.error('[handleStartTravelLog] fetch open LTE failed:', openErr)
    } else if (openEntries && openEntries.length > 0) {
      const ids = openEntries.map((r: any) => r.id)
      const { error: updErr } = await supabase
        .from('location_time_entries')
        .update({
          exited_at: startIso,
          stop_source: 'foreground_geofence_exit',
          stop_reason: 'switched_to_new_work_site',
          stopped_by: staffId,
          stop_metadata: { closed_via: 'start_travel_log', start_iso: startIso },
        })
        .in('id', ids)
        .is('exited_at', null)
      if (updErr) {
        console.error('[handleStartTravelLog] close open LTE failed:', updErr)
      } else {
        console.log(`[handleStartTravelLog] Auto-closed ${ids.length} open location_time_entries for staff ${staffId} at ${startIso}`)
      }
    }
  } catch (e) {
    console.error('[handleStartTravelLog] auto-close exception:', e)
  }

  const { data: log, error } = await supabase
    .from('travel_time_logs')
    .insert({
      staff_id: staffId,
      organization_id: organizationId,
      report_date: startIso.split('T')[0],
      start_time: startIso,
      from_address: from_address || null,
      from_latitude: from_latitude || null,
      from_longitude: from_longitude || null,
      description: description || null,
      auto_detected: auto_detected !== false,
      hours_worked: 0,
    })
    .select()
    .single()

  if (error) {
    console.error('Create travel log error:', error)

    if (String(error?.message || '').includes('single_open_travel_log_violation')) {
      const { data: recoveredOpenTravel, error: recoverErr } = await supabase
        .from('travel_time_logs')
        .select('*')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recoverErr) {
        console.error('[handleStartTravelLog] recover existing open travel failed:', recoverErr)
      } else if (recoveredOpenTravel) {
        console.log(
          `[handleStartTravelLog] Recovered existing open travel ${recoveredOpenTravel.id} after unique guard for staff ${staffId}`
        )
        return new Response(
          JSON.stringify({
            success: true,
            recovered_existing: true,
            travel_log: recoveredOpenTravel,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    return new Response(
      JSON.stringify({ error: 'Failed to create travel log' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Travel log created: ${log.id} by staff ${staffId}`)

  return new Response(
    JSON.stringify({ success: true, travel_log: log }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleStopTravelLog(supabase: any, staffId: string, data: any, organizationId: string) {
  const { travel_log_id, to_address, to_latitude, to_longitude } = data || {}

  if (!travel_log_id) {
    return new Response(
      JSON.stringify({ error: 'travel_log_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get the requested log first. If the client points at a stale/orphan id,
  // fall back to the newest currently-open travel row for this staff member.
  const { data: existing, error: fetchError } = await supabase
    .from('travel_time_logs')
    .select('id, start_time, end_time')
    .eq('id', travel_log_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  let targetLog = existing

  if (!targetLog || fetchError) {
    if (fetchError) {
      console.warn('[handleStopTravelLog] requested travel log lookup failed, trying fallback:', fetchError)
    }

    const { data: fallbackOpenTravel, error: fallbackErr } = await supabase
      .from('travel_time_logs')
      .select('id, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fallbackErr) {
      console.error('[handleStopTravelLog] fallback open travel lookup failed:', fallbackErr)
    } else if (fallbackOpenTravel) {
      console.log(
        `[handleStopTravelLog] Requested ${travel_log_id} missing/stale; falling back to open travel ${fallbackOpenTravel.id} for staff ${staffId}`
      )
      targetLog = fallbackOpenTravel
    }
  }

  if (!targetLog) {
    // Idempotent success: there is nothing open to stop. The client banner
    // is showing a phantom — let it clear without error so the user is not
    // stuck in a "Travelling" state forever.
    console.log(
      `[handleStopTravelLog] No open travel for staff ${staffId} (requested ${travel_log_id}). Returning idempotent success so the client can clear local state.`
    )
    return new Response(
      JSON.stringify({
        success: true,
        already_stopped: true,
        no_open_travel: true,
        travel_log: null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (targetLog.end_time) {
    return new Response(
      JSON.stringify({
        success: true,
        already_stopped: true,
        travel_log: targetLog,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const endTime = new Date()
  const startTime = new Date(targetLog.start_time)
  const hoursWorked = Math.round(((endTime.getTime() - startTime.getTime()) / 3600000) * 100) / 100

  // Try to match destination to a booking address (within 300m)
  let destinationBookingId: string | null = null
  if (to_latitude && to_longitude) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, delivery_latitude, delivery_longitude, client')
      .eq('organization_id', organizationId)
      .not('delivery_latitude', 'is', null)
      .not('delivery_longitude', 'is', null)

    if (bookings) {
      const toRad = (d: number) => (d * Math.PI) / 180
      for (const b of bookings) {
        const R = 6371000
        const dLat = toRad(b.delivery_latitude - to_latitude)
        const dLng = toRad(b.delivery_longitude - to_longitude)
        const a = Math.sin(dLat/2)**2 + Math.cos(toRad(to_latitude)) * Math.cos(toRad(b.delivery_latitude)) * Math.sin(dLng/2)**2
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        if (dist < 300) {
          destinationBookingId = b.id
          console.log(`[StopTravel] Matched destination to booking ${b.id} (${b.client}), distance: ${dist.toFixed(0)}m`)
          break
        }
      }
    }
  }

  // Fallback: if no GPS match, link to the most recent time report's booking for this staff today
  if (!destinationBookingId) {
    const todayStr = new Date().toISOString().split('T')[0]
    const { data: lastReport } = await supabase
      .from('time_reports')
      .select('booking_id')
      .eq('staff_id', staffId)
      .eq('report_date', todayStr)
      .eq('organization_id', organizationId)
      .order('end_time', { ascending: false })
      .limit(1)
      .single()
    if (lastReport?.booking_id) {
      destinationBookingId = lastReport.booking_id
      console.log(`[StopTravel] Fallback: linked to last worked booking ${destinationBookingId}`)
    }
  }

  // ── Classification policy ──
  // We DO NOT silently mint "paid" travel time. Three semantic outcomes:
  //   • destination matched a known booking      → 'work' (assistant is confident)
  //   • caller passed mark_payable: true         → 'work' (explicit user action,
  //                                                 e.g. manual stop dialog)
  //   • everything else (auto-detected unknown)  → 'unclassified'
  // Salary aggregations still sum hours_worked; admin/staff can later flip
  // 'unclassified' rows to 'work' or 'personal' via classify_travel_log.
  const explicitlyPayable = !!data?.mark_payable
  const classification: 'work' | 'unclassified' =
    destinationBookingId || explicitlyPayable ? 'work' : 'unclassified'

  const { data: updated, error } = await supabase
    .from('travel_time_logs')
    .update({
      end_time: endTime.toISOString(),
      hours_worked: hoursWorked,
      to_address: to_address || null,
      to_latitude: to_latitude || null,
      to_longitude: to_longitude || null,
      destination_booking_id: destinationBookingId,
      manual_project_name: destinationBookingId ? null : (to_address || null),
      classification,
    })
    .eq('id', targetLog.id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('end_time', null)
    .select()
    .maybeSingle()

  if (error) {
    console.error('Stop travel log error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to stop travel log' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!updated) {
    // Race: another caller closed this row between our SELECT and UPDATE.
    // Re-fetch the now-closed row so the client still gets a consistent
    // success payload and the banner clears.
    const { data: refetched } = await supabase
      .from('travel_time_logs')
      .select('*')
      .eq('id', targetLog.id)
      .maybeSingle()
    console.log(
      `[handleStopTravelLog] Update returned no row (race) for ${targetLog.id}; returning refetched closed row as success.`
    )
    return new Response(
      JSON.stringify({
        success: true,
        already_stopped: true,
        travel_log: refetched || targetLog,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(
    `Travel log stopped: ${targetLog.id}, hours: ${hoursWorked}, ` +
    `matchedBooking: ${destinationBookingId}, classification: ${classification}`
  )

  return new Response(
    JSON.stringify({ success: true, travel_log: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Classify a travel log as 'work' | 'personal' | 'unclassified'.
 *
 * This is the explicit decision path for resolving auto-detected travel logs
 * (e.g. when the user picks "Detta var arbetsresa" / "Privat resa" in the
 * TravelCompletedDialog). It NEVER touches hours_worked — only the semantic
 * label that admins use to filter what to follow up on.
 */
async function handleClassifyTravelLog(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { travel_log_id, classification } = data || {}

  if (!travel_log_id || typeof travel_log_id !== 'string') {
    return new Response(
      JSON.stringify({ error: 'travel_log_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!['work', 'personal', 'unclassified'].includes(classification)) {
    return new Response(
      JSON.stringify({ error: 'classification must be one of: work, personal, unclassified' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { data: updated, error } = await supabase
    .from('travel_time_logs')
    .update({ classification })
    .eq('id', travel_log_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    console.error('Classify travel log error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to classify travel log' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  console.log(`Travel log ${travel_log_id} classified as: ${classification}`)

  return new Response(
    JSON.stringify({ success: true, travel_log: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

async function handleUpdateTravelLog(supabase: any, staffId: string, data: any, organizationId: string) {
  const { travel_log_id, description, manual_project_name } = data || {}

  if (!travel_log_id) {
    return new Response(
      JSON.stringify({ error: 'travel_log_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const updateFields: any = {}
  if (description !== undefined) updateFields.description = description
  if (manual_project_name !== undefined) updateFields.manual_project_name = manual_project_name

  const { data: updated, error } = await supabase
    .from('travel_time_logs')
    .update(updateFields)
    .eq('id', travel_log_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    console.error('Update travel log error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to update travel log' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, travel_log: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetTravelLogs(supabase: any, staffId: string, data: any, organizationId: string) {
  const { limit: queryLimit } = data || {}

  const { data: logs, error } = await supabase
    .from('travel_time_logs')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .order('start_time', { ascending: false })
    .limit(queryLimit || 50)

  if (error) {
    console.error('Get travel logs error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch travel logs' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ travel_logs: logs || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── GET CONTACTS ──
//
// Normalised contact list (messenger-style):
// • Sammanslår staff_members + profiles + user_roles → en post per person.
// • Dedup nyckelordning: user_id → email (lowercased) → staff_members.id.
// • Bästa namn vinner (staff_members.name > profiles.full_name > email local-part).
// • Roller bevaras (staff/planner/admin/projekt/lager) men `type` håller UI-kompat.
// • Stabil sortering: namn (sv) → id.
async function handleGetContacts(supabase: any, staffId: string, organizationId: string) {
  // Hämta auth user_id för anroparen så vi inte returnerar oss själva via planner-spåret
  const { data: meStaff } = await supabase
    .from('staff_members')
    .select('user_id, email')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  const myUserId: string | null = meStaff?.user_id ?? null
  const myEmail: string | null = meStaff?.email ? String(meStaff.email).toLowerCase() : null

  // Parallella läsningar för snabb laddning
  const [staffRes, profileRes] = await Promise.all([
    supabase
      .from('staff_members')
      .select('id, name, email, user_id, role, is_active')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .neq('id', staffId),
    supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .eq('organization_id', organizationId),
  ])

  if (staffRes.error) {
    console.error('Get contacts staff error:', staffRes.error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch contacts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (profileRes.error) {
    console.error('Get contacts planners error:', profileRes.error)
  }

  // Roller: hämta alla user_roles för aktuella user_ids (en query, indexerad på user_id)
  const userIdSet = new Set<string>()
  for (const s of (staffRes.data || [])) if (s.user_id) userIdSet.add(s.user_id)
  for (const p of (profileRes.data || [])) if (p.user_id) userIdSet.add(p.user_id)

  let rolesByUser = new Map<string, string[]>()
  if (userIdSet.size > 0) {
    const { data: roleRows, error: roleErr } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', Array.from(userIdSet))
    if (roleErr) {
      console.warn('Get contacts roles error (non-fatal):', roleErr.message)
    } else {
      for (const r of (roleRows || [])) {
        const list = rolesByUser.get(r.user_id) || []
        if (!list.includes(r.role)) list.push(r.role)
        rolesByUser.set(r.user_id, list)
      }
    }
  }

  type Contact = {
    id: string
    name: string
    type: 'staff' | 'planner' | 'admin'
    subtitle?: string
    roles: string[]
    _sortKey: string
  }
  // Två index för dedup: user_id → contact, lower(email) → contact
  const byUserId = new Map<string, Contact>()
  const byEmail = new Map<string, Contact>()
  const byStaffId = new Map<string, Contact>()

  const pickName = (...candidates: (string | null | undefined)[]): string => {
    for (const c of candidates) {
      const t = (c || '').trim()
      if (t) return t
    }
    return 'Okänd'
  }
  const emailLocal = (e?: string | null): string => {
    const s = (e || '').trim()
    if (!s || !s.includes('@')) return ''
    return s.split('@')[0]
  }
  const decideType = (hasStaff: boolean, roles: string[]): 'staff' | 'planner' | 'admin' => {
    if (roles.includes('admin')) return 'admin'
    if (!hasStaff && (roles.includes('projekt') || roles.includes('lager'))) return 'planner'
    if (roles.some(r => ['projekt', 'lager'].includes(r)) && !hasStaff) return 'planner'
    return hasStaff ? 'staff' : 'planner'
  }

  // 1) Lägg in staff_members först — de är "auktoritativa" för namn/avatar
  for (const s of (staffRes.data || [])) {
    const roles = s.user_id ? (rolesByUser.get(s.user_id) || []) : []
    const name = pickName(s.name)
    const emailKey = s.email ? String(s.email).toLowerCase() : ''
    const contact: Contact = {
      id: s.id, // staff_members.id — fungerar för DM (recipient_id slår staff_members först)
      name,
      type: decideType(true, roles),
      subtitle: s.email || undefined,
      roles: ['staff', ...roles],
      _sortKey: name.toLocaleLowerCase('sv'),
    }
    byStaffId.set(s.id, contact)
    if (s.user_id) byUserId.set(s.user_id, contact)
    if (emailKey) byEmail.set(emailKey, contact)
  }

  // 2) Slå in profiles — slå ihop med befintlig staff via user_id eller email
  for (const p of (profileRes.data || [])) {
    if (!p.user_id) continue
    // Hoppa över oss själva (om vi nås via planner-spåret)
    if (myUserId && p.user_id === myUserId) continue
    const emailKey = p.email ? String(p.email).toLowerCase() : ''
    if (myEmail && emailKey && emailKey === myEmail) continue

    const existing = byUserId.get(p.user_id) || (emailKey ? byEmail.get(emailKey) : undefined)
    const roles = rolesByUser.get(p.user_id) || []

    if (existing) {
      // Berika existerande staff-post med roller och ev. bättre namn/email
      for (const r of roles) if (!existing.roles.includes(r)) existing.roles.push(r)
      // Befordra typ om personen har planner/admin-roll
      if (roles.includes('admin')) existing.type = 'admin'
      else if (existing.type === 'staff' && roles.some(r => ['projekt', 'lager'].includes(r))) {
        // Behåll 'staff' som primär (de är fortfarande personal) — UI visar ändå "Personal"
      }
      if (!existing.subtitle && p.email) existing.subtitle = p.email
      // Indexera även via user_id/email så framtida träffar hittar samma post
      byUserId.set(p.user_id, existing)
      if (emailKey) byEmail.set(emailKey, existing)
      continue
    }

    // Ren planner/admin (ingen staff-post)
    const name = pickName(p.full_name, emailLocal(p.email))
    const contact: Contact = {
      id: p.user_id,
      name,
      type: decideType(false, roles),
      subtitle: p.email || undefined,
      roles: roles.length ? roles : ['planner'],
      _sortKey: name.toLocaleLowerCase('sv'),
    }
    byUserId.set(p.user_id, contact)
    if (emailKey) byEmail.set(emailKey, contact)
  }

  // Samla unika kontakter (Set hindrar dubbletter när samma referens finns i flera index)
  const unique = new Set<Contact>()
  for (const c of byStaffId.values()) unique.add(c)
  for (const c of byUserId.values()) unique.add(c)
  for (const c of byEmail.values()) unique.add(c)

  // Stabil sortering: namn (sv) → id
  const contacts = Array.from(unique)
    .map(({ _sortKey, ...c }) => c)
    .sort((a, b) => {
      const n = a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' })
      return n !== 0 ? n : a.id.localeCompare(b.id)
    })

  return new Response(
    JSON.stringify({ contacts }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ============= Chat archive + attachments =============

async function handleArchiveDM(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { partner_id } = data || {}
  if (!partner_id) {
    return new Response(JSON.stringify({ success: false, error: 'partner_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const ids = userId && userId !== staffId ? [staffId, userId] : [staffId]

  // Atomic, idempotent, race-safe single round-trip via SQL function.
  const { data: affected, error } = await supabase.rpc('archive_dm_thread', {
    _org_id: organizationId,
    _my_ids: ids,
    _partner_id: partner_id,
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, archived_count: affected ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleUnarchiveDM(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { partner_id } = data || {}
  if (!partner_id) {
    return new Response(JSON.stringify({ success: false, error: 'partner_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const ids = userId && userId !== staffId ? [staffId, userId] : [staffId]

  const { data: affected, error } = await supabase.rpc('unarchive_dm_thread', {
    _org_id: organizationId,
    _my_ids: ids,
    _partner_id: partner_id,
  })

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ success: true, unarchived_count: affected ?? 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleUploadChatAttachment(supabase: any, staffId: string, data: any, organizationId: string) {
  try {
    // 1. Auth/org guard
    if (!staffId || !organizationId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: missing staff or organization context' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { file_name, file_type, file_data_base64 } = data || {}
    if (!file_name || !file_data_base64) {
      return new Response(JSON.stringify({ error: 'file_name and file_data_base64 are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // ────────────────────────────────────────────────────────────────────
    // CHAT_UPLOAD_POLICY — keep in sync with `src/lib/chat/uploadPolicy.ts`
    // (single source of truth for chat attachments). If you change one
    // side, change the other too.
    // ────────────────────────────────────────────────────────────────────
    const ALLOWED_MIME = new Set([
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv',
    ])
    const ALLOWED_EXT = new Set([
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv',
    ])
    const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
    const MAX_MB = MAX_BYTES / (1024 * 1024)

    const mimeType = (file_type || 'application/octet-stream').toLowerCase()
    const lastDot = String(file_name).lastIndexOf('.')
    const ext = lastDot >= 0 ? String(file_name).slice(lastDot).toLowerCase() : ''
    const mimeOk = ALLOWED_MIME.has(mimeType)
    const extOk = ext.length > 0 && ALLOWED_EXT.has(ext)
    if (!mimeOk && !extOk) {
      return new Response(JSON.stringify({ error: `Filtypen stöds inte (${mimeType || 'okänd'})` }),
        { status: 415, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3. Decode + size validation
    let binary: Uint8Array
    try {
      binary = Uint8Array.from(atob(file_data_base64), c => c.charCodeAt(0))
    } catch (_e) {
      return new Response(JSON.stringify({ error: 'Invalid base64 payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (binary.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Filen är tom' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (binary.byteLength > MAX_BYTES) {
      return new Response(JSON.stringify({ error: `Filen är för stor (max ${MAX_MB} MB)` }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 4. Unique path per org/user/timestamp
    const safeName = String(file_name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
    const path = `${organizationId}/${staffId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safeName}`

    // 5. Upload
    const { error: upErr } = await supabase.storage
      .from('chat-attachments')
      .upload(path, binary, {
        contentType: mimeType,
        upsert: false,
      })
    if (upErr) {
      return new Response(JSON.stringify({ error: `Upload failed: ${upErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 6. Resolve URL (public, fallback to 7-day signed)
    let url = ''
    const { data: pub } = supabase.storage.from('chat-attachments').getPublicUrl(path)
    if (pub?.publicUrl) {
      url = pub.publicUrl
    } else {
      const { data: signed, error: signErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 7)
      if (signErr || !signed?.signedUrl) {
        return new Response(JSON.stringify({ error: `Could not resolve URL: ${signErr?.message || 'unknown'}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      url = signed.signedUrl
    }

    // NOTE: Both `file_type` and `mime_type` are returned for backwards
    // compatibility — the chat input reads `file_type`, older callers read `mime_type`.
    return new Response(JSON.stringify({
      success: true,
      path,
      url,
      file_name: safeName,
      file_type: mimeType,
      mime_type: mimeType,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
}

// ============= Anomalies (background absence tracking) =============

async function handleStartAnomaly(supabase: any, staffId: string, data: any, organizationId: string) {
  const { location_id, booking_id, large_project_id, started_at } = data || {}
  if (!location_id && !booking_id) {
    return new Response(JSON.stringify({ error: 'location_id or booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Check for already-open anomaly (idempotent)
  let existingQuery = supabase
    .from('time_report_anomalies')
    .select('id, started_at')
    .eq('staff_id', staffId)
    .is('ended_at', null)
    .limit(1)
  if (location_id) existingQuery = existingQuery.eq('location_id', location_id)
  else existingQuery = existingQuery.eq('booking_id', booking_id)

  const { data: existing } = await existingQuery
  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ success: true, anomaly: existing[0], already_open: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: inserted, error } = await supabase
    .from('time_report_anomalies')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      location_id: location_id || null,
      booking_id: booking_id || null,
      large_project_id: large_project_id || null,
      started_at: started_at || new Date().toISOString(),
      source: 'geofence',
    })
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, anomaly: inserted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleStopAnomaly(supabase: any, staffId: string, data: any, organizationId: string) {
  const { location_id, booking_id, anomaly_id, ended_at } = data || {}
  if (!location_id && !booking_id && !anomaly_id) {
    return new Response(JSON.stringify({ error: 'location_id, booking_id or anomaly_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let query = supabase
    .from('time_report_anomalies')
    .select('id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('ended_at', null)
    .limit(1)
  if (anomaly_id) query = query.eq('id', anomaly_id)
  else if (location_id) query = query.eq('location_id', location_id)
  else query = query.eq('booking_id', booking_id)

  const { data: rows } = await query
  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ success: true, no_open: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const stopAt = ended_at || new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('time_report_anomalies')
    .update({ ended_at: stopAt })
    .eq('id', rows[0].id)
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Auto-discard absences shorter than 60 seconds (noise / GPS bouncing)
  if (updated && updated.duration_minutes !== null && updated.duration_minutes < 1) {
    const startMs = new Date(updated.started_at).getTime()
    const endMs = new Date(updated.ended_at).getTime()
    if (endMs - startMs < 60_000) {
      await supabase.from('time_report_anomalies').delete().eq('id', updated.id)
      return new Response(JSON.stringify({ success: true, discarded: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  return new Response(JSON.stringify({ success: true, anomaly: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleListPendingAnomalies(supabase: any, staffId: string, organizationId: string) {
  // Pending = ended (closed) but not yet classified
  const { data, error } = await supabase
    .from('time_report_anomalies')
    .select('id, location_id, booking_id, large_project_id, started_at, ended_at, duration_minutes, classification, work_description, time_report_id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .not('ended_at', 'is', null)
    .is('classification', null)
    .order('started_at', { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Resolve location names
  const locationIds = Array.from(new Set((data || []).map((a: any) => a.location_id).filter(Boolean)))
  let locMap: Record<string, string> = {}
  if (locationIds.length > 0) {
    const { data: locs } = await supabase
      .from('organization_locations')
      .select('id, name')
      .in('id', locationIds)
    locMap = Object.fromEntries((locs || []).map((l: any) => [l.id, l.name]))
  }

  const enriched = (data || []).map((a: any) => ({
    ...a,
    location_name: a.location_id ? (locMap[a.location_id] || 'Plats') : null,
  }))

  return new Response(JSON.stringify({ anomalies: enriched }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleClassifyAnomaly(supabase: any, staffId: string, data: any, organizationId: string) {
  const { anomaly_id, classification, work_description } = data || {}
  if (!anomaly_id || !classification || !['break', 'work'].includes(classification)) {
    return new Response(JSON.stringify({ error: 'anomaly_id and valid classification (break|work) required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Verify ownership
  const { data: existing, error: fetchErr } = await supabase
    .from('time_report_anomalies')
    .select('*')
    .eq('id', anomaly_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (fetchErr || !existing) {
    return new Response(JSON.stringify({ error: 'Anomaly not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (classification === 'work' && (existing.duration_minutes || 0) > 10) {
    if (!work_description || !work_description.trim()) {
      return new Response(JSON.stringify({ error: 'work_description required for work > 10 min' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  const updates: any = {
    classification,
    work_description: classification === 'work' ? (work_description || null) : null,
    classified_at: new Date().toISOString(),
  }

  const { data: updated, error: updErr } = await supabase
    .from('time_report_anomalies')
    .update(updates)
    .eq('id', anomaly_id)
    .select()
    .single()

  if (updErr) {
    return new Response(JSON.stringify({ error: updErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // C9: If classified as break, deduct from linked time_report — but only ONCE.
  // We previously had a bug where re-classifying the same anomaly would double-deduct.
  // Guard with `existing.classification` so we only run on FIRST classification.
  if (
    classification === 'break'
    && existing.time_report_id
    && existing.duration_minutes
    && existing.classification !== 'break'
  ) {
    const breakHours = Number((existing.duration_minutes / 60).toFixed(2))
    const { data: tr } = await supabase
      .from('time_reports')
      .select('id, hours_worked, break_time')
      .eq('id', existing.time_report_id)
      .single()
    if (tr) {
      const newHours = Math.max(0, Number((tr.hours_worked - breakHours).toFixed(2)))
      const newBreak = Number(((tr.break_time || 0) + breakHours).toFixed(2))
      await supabase.from('time_reports')
        .update({ hours_worked: newHours, break_time: newBreak })
        .eq('id', existing.time_report_id)
    }
  }

  return new Response(JSON.stringify({ success: true, anomaly: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleCloseOpenAnomalies(supabase: any, staffId: string, data: any, organizationId: string) {
  // Safety net: closes any orphan anomalies for this staff that were never properly stopped
  // (e.g. user left geofence, never returned, app closed). Called when a job timer stops.
  const { ended_at } = data || {}
  const stopAt = ended_at || new Date().toISOString()

  const { data: openRows } = await supabase
    .from('time_report_anomalies')
    .select('id, started_at')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('ended_at', null)

  if (!openRows || openRows.length === 0) {
    return new Response(JSON.stringify({ success: true, closed: 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Close each, then delete those shorter than 60s (noise)
  const toDelete: string[] = []
  for (const row of openRows) {
    const { data: upd } = await supabase
      .from('time_report_anomalies')
      .update({ ended_at: stopAt })
      .eq('id', row.id)
      .select('id, started_at, ended_at')
      .single()
    if (upd) {
      const startMs = new Date(upd.started_at).getTime()
      const endMs = new Date(upd.ended_at).getTime()
      if (endMs - startMs < 60_000) toDelete.push(upd.id)
    }
  }
  if (toDelete.length > 0) {
    await supabase.from('time_report_anomalies').delete().in('id', toDelete)
  }

  return new Response(JSON.stringify({ success: true, closed: openRows.length, discarded: toDelete.length }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= workday_flags handlers (PROMPT 6 — anomaly model v2) =============
//
// workday_flags is the first-class store for "system saw something it can't
// safely decide on its own". These handlers NEVER touch time_reports — they
// only annotate, prompt, and let staff/admin resolve uncertainty.
//
// Vocabulary (mirrors the CHECK constraint in the migration):
//   missing_break, unclear_day_end, presence_without_report,
//   activity_ended_day_continues, geofence_presence_mismatch,
//   team_time_deviation, unreasonable_travel, time_gap, missing_report,
//   long_day, overlapping_times.

const WORKDAY_FLAG_TYPES = new Set([
  'missing_break', 'unclear_day_end', 'presence_without_report',
  'activity_ended_day_continues', 'geofence_presence_mismatch',
  'team_time_deviation', 'unreasonable_travel', 'time_gap',
  'missing_report', 'long_day', 'overlapping_times',
  'home_arrival_end_day_adjusted', 'home_arrival_auto_ended',
  'auto_closed_overnight', 'auto_closed_travel', 'auto_closed_report',
  'unclear_start_target',
])

async function handleCreateWorkdayFlag(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    flag_type, flag_date, title, description,
    severity, needs_user_input, assistant_decision_kind,
    related_time_report_id, related_booking_id, related_large_project_id,
    related_location_id, related_anomaly_id, context,
  } = data || {}

  if (!flag_type || !WORKDAY_FLAG_TYPES.has(flag_type)) {
    return new Response(JSON.stringify({ error: 'invalid flag_type' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!flag_date || !/^\d{4}-\d{2}-\d{2}$/.test(flag_date)) {
    return new Response(JSON.stringify({ error: 'flag_date must be YYYY-MM-DD' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!title || typeof title !== 'string') {
    return new Response(JSON.stringify({ error: 'title is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Idempotency: don't pile multiple identical open flags on the same day.
  // Same (staff, date, type) + open ⇒ return the existing row.
  const { data: existing } = await supabase
    .from('workday_flags')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .eq('flag_type', flag_type)
    .eq('flag_date', flag_date)
    .eq('resolved', false)
    .limit(1)
    .maybeSingle()
  if (existing) {
    return new Response(JSON.stringify({ success: true, flag: existing, already_open: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: inserted, error } = await supabase
    .from('workday_flags')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      flag_type,
      flag_date,
      title,
      description: description ?? null,
      severity: ['info','warning','error'].includes(severity) ? severity : 'warning',
      needs_user_input: !!needs_user_input,
      assistant_decision_kind: assistant_decision_kind ?? null,
      related_time_report_id: related_time_report_id ?? null,
      related_booking_id: related_booking_id ?? null,
      related_large_project_id: related_large_project_id ?? null,
      related_location_id: related_location_id ?? null,
      related_anomaly_id: related_anomaly_id ?? null,
      context: context ?? {},
    })
    .select()
    .single()

  if (error) {
    console.error('[workday_flags] insert error:', error)
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, flag: inserted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleListWorkdayFlags(supabase: any, staffId: string, data: any, organizationId: string) {
  const { resolved, limit } = data || {}
  let q = supabase
    .from('workday_flags')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .order('flag_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.min(typeof limit === 'number' ? limit : 100, 500))

  if (resolved === true || resolved === false) {
    q = q.eq('resolved', resolved)
  }

  const { data: rows, error } = await q
  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ flags: rows || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * list_workdays_review — Review-entrypoint för dagavstämning.
 *
 * Returnerar workdays för senaste N dagar (default 7) tillsammans med
 * aggregerad räknare för öppna assistant_events och oklara resor. Detta
 * är källan för MobileDayReview-vyn. Ändrar inte data.
 */
async function handleListWorkdaysReview(supabase: any, staffId: string, data: any, organizationId: string) {
  const days = Math.min(Math.max(typeof data?.days === 'number' ? data.days : 7, 1), 30)
  const sinceIso = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()

  const { data: workdays, error: wdErr } = await supabase
    .from('workdays')
    .select('id, started_at, ended_at, review_status, review_reasons, review_computed_at, notes')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })
    .limit(50)

  if (wdErr) {
    return new Response(JSON.stringify({ error: wdErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: events } = await supabase
    .from('assistant_events')
    .select('id, happened_at, event_type, target_label, target_type, target_id, resolution_status, stale_for_prompt, still_relevant_for_review, suggested_action, metadata')
    .eq('organization_id', organizationId)
    .eq('staff_id', staffId)
    .gte('happened_at', sinceIso)
    .order('happened_at', { ascending: false })
    .limit(500)

  let openTravel: any[] = []
  try {
    const { data: travels } = await supabase
      .from('travel_time_logs')
      .select('id, started_at, ended_at')
      .eq('staff_id', staffId)
      .gte('started_at', sinceIso)
      .is('ended_at', null)
    openTravel = travels || []
  } catch { /* tabell finns inte i alla miljöer */ }

  const dayKeyOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)
  const aggByDay: Record<string, { open_events: number; stale_review_events: number; open_travel: number }> = {}
  for (const ev of events || []) {
    const key = dayKeyOf(ev.happened_at)
    aggByDay[key] ??= { open_events: 0, stale_review_events: 0, open_travel: 0 }
    if (ev.resolution_status === 'pending' && !ev.stale_for_prompt) aggByDay[key].open_events++
    if (ev.resolution_status === 'pending' && ev.stale_for_prompt && ev.still_relevant_for_review) aggByDay[key].stale_review_events++
  }
  for (const tr of openTravel) {
    const key = dayKeyOf(tr.started_at)
    aggByDay[key] ??= { open_events: 0, stale_review_events: 0, open_travel: 0 }
    aggByDay[key].open_travel++
  }

  const enriched = (workdays || []).map((wd: any) => {
    const key = dayKeyOf(wd.started_at)
    const agg = aggByDay[key] || { open_events: 0, stale_review_events: 0, open_travel: 0 }
    return {
      ...wd,
      day_key: key,
      counts: agg,
      events_for_day: (events || []).filter((e: any) => dayKeyOf(e.happened_at) === key),
      travels_for_day: openTravel.filter((t: any) => dayKeyOf(t.started_at) === key),
      synthetic: false,
    }
  })

  // ----- Syntetiska review-dagar -----
  // Om assistant_events eller öppna resor finns för ett datum men ingen workday
  // skapats (användaren missade hela dagen), måste dagen ändå gå att reviewa.
  // Skapa en virtuell workday-post per saknat datum.
  const realDayKeys = new Set((workdays || []).map((w: any) => dayKeyOf(w.started_at)))
  const syntheticDays: any[] = []
  for (const [key, agg] of Object.entries(aggByDay)) {
    if (realDayKeys.has(key)) continue
    const hasSignal = agg.open_events > 0 || agg.stale_review_events > 0 || agg.open_travel > 0
    if (!hasSignal) continue

    const dayEvents = (events || []).filter((e: any) => dayKeyOf(e.happened_at) === key)
    const dayTravels = openTravel.filter((t: any) => dayKeyOf(t.started_at) === key)
    const firstEventIso = [...dayEvents].sort((a: any, b: any) =>
      new Date(a.happened_at).getTime() - new Date(b.happened_at).getTime()
    )[0]?.happened_at || `${key}T00:00:00.000Z`

    const reasons: string[] = ['no_workday_started']
    if (agg.open_events > 0 || agg.stale_review_events > 0) reasons.push('open_assistant_events')
    if (agg.stale_review_events > 0) reasons.push('stale_review_events')
    if (agg.open_travel > 0) reasons.push('unresolved_travel')
    reasons.push('missing_end')

    syntheticDays.push({
      id: `synthetic:${key}`,
      started_at: firstEventIso,
      ended_at: null,
      review_status: 'needs_review',
      review_reasons: reasons,
      review_computed_at: new Date().toISOString(),
      notes: null,
      day_key: key,
      counts: agg,
      events_for_day: dayEvents,
      travels_for_day: dayTravels,
      synthetic: true,
    })
  }

  const all = [...enriched, ...syntheticDays].sort((a, b) =>
    (b.day_key || '').localeCompare(a.day_key || '')
  )

  return new Response(JSON.stringify({ workdays: all }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleResolveWorkdayFlag(supabase: any, staffId: string, data: any, organizationId: string) {
  const { flag_id, resolution_source, resolution_note } = data || {}
  if (!flag_id || !['staff','admin','auto'].includes(resolution_source)) {
    return new Response(JSON.stringify({ error: 'flag_id + valid resolution_source required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Ownership: staff can only resolve their own. Admin path goes through
  // the admin web UI which uses the user's session (separate flow); here
  // we strictly bind to the calling staffId to prevent cross-staff writes.
  const { data: existing } = await supabase
    .from('workday_flags')
    .select('id, staff_id, resolved')
    .eq('id', flag_id)
    .eq('organization_id', organizationId)
    .single()
  if (!existing) {
    return new Response(JSON.stringify({ error: 'flag not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (existing.staff_id !== staffId && resolution_source === 'staff') {
    return new Response(JSON.stringify({ error: 'forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (existing.resolved) {
    return new Response(JSON.stringify({ success: true, already_resolved: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: updated, error } = await supabase
    .from('workday_flags')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_source,
      resolution_note: resolution_note ?? null,
      resolved_by: staffId,
      needs_user_input: false,
    })
    .eq('id', flag_id)
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, flag: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= End-of-day stop helpers =============

/**
 * Returns the most recent geofence exit (location_time_entries.exited_at)
 * for this staff member within the last 24h. Used by the timer-stop dialog
 * to ask "Du lämnade arbetsplatsen kl XX:XX, använd som sluttid?".
 */
async function handleGetLastWorkplaceExit(supabase: any, staffId: string, organizationId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('location_time_entries')
    .select('exited_at, location_id, organization_locations(name)')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .not('exited_at', 'is', null)
    .gte('exited_at', since)
    .order('exited_at', { ascending: false })
    .limit(1)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const row = rows && rows[0]
  return new Response(JSON.stringify({
    last_exit: row ? {
      exited_at: row.exited_at,
      location_id: row.location_id,
      location_name: (row as any).organization_locations?.name || null,
    } : null,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * End-of-day "Nej" path: user declined the suggested exit time and
 * provided their own end-time + a description of what they did.
 * We create an anomaly that's pre-classified as work, with the GPS
 * position captured at submit-time stored as end-location.
 */
async function handleCreateEndOfDayAnomaly(supabase: any, staffId: string, data: any, organizationId: string) {
  const {
    started_at,           // last geofence exit time (anomaly start)
    ended_at,             // user-provided end time
    work_description,     // required if duration > 10 min
    end_location_lat,     // current GPS at submit (optional)
    end_location_lng,
    location_id,          // workplace location they left (optional)
    booking_id,           // active booking timer (optional)
    large_project_id,
    time_report_id,       // newly created time_report this anomaly belongs to
  } = data || {}

  if (!started_at || !ended_at) {
    return new Response(JSON.stringify({ error: 'started_at and ended_at are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const startMs = new Date(started_at).getTime()
  const endMs = new Date(ended_at).getTime()
  if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) {
    return new Response(JSON.stringify({ error: 'ended_at must be after started_at' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const durationMin = Math.round((endMs - startMs) / 60000)
  if (durationMin > 10 && (!work_description || !String(work_description).trim())) {
    return new Response(JSON.stringify({ error: 'work_description required for absences > 10 min' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // If client didn't send GPS, look it up from history at ended_at (±5 min)
  let resolvedLat: number | null = end_location_lat ?? null
  let resolvedLng: number | null = end_location_lng ?? null
  let resolvedRecordedAt: string | null =
    (resolvedLat != null && resolvedLng != null) ? new Date().toISOString() : null

  if (resolvedLat == null || resolvedLng == null) {
    try {
      const windowMs = 5 * 60 * 1000
      const fromIso = new Date(endMs - windowMs).toISOString()
      const toIso = new Date(endMs + windowMs).toISOString()
      const { data: histRows } = await supabase
        .from('staff_location_history')
        .select('lat, lng, recorded_at')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .gte('recorded_at', fromIso)
        .lte('recorded_at', toIso)

      if (histRows && histRows.length > 0) {
        let best = histRows[0]
        let bestDiff = Math.abs(new Date(best.recorded_at).getTime() - endMs)
        for (const r of histRows) {
          const diff = Math.abs(new Date(r.recorded_at).getTime() - endMs)
          if (diff < bestDiff) { best = r; bestDiff = diff }
        }
        resolvedLat = best.lat
        resolvedLng = best.lng
        resolvedRecordedAt = best.recorded_at
      }
    } catch (lookupErr) {
      console.warn('[end_of_day] history lookup failed:', lookupErr)
    }
  }

  // Reuse open anomaly that started AT this geofence-exit time (don't create duplicates).
  // Filter strictly on started_at == lastExitIso to avoid grabbing an unrelated open row.
  const { data: openRows } = await supabase
    .from('time_report_anomalies')
    .select('id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('started_at', started_at)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)

  let row: any
  if (openRows && openRows.length > 0) {
    const { data: upd, error: updErr } = await supabase
      .from('time_report_anomalies')
      .update({
        ended_at,
        classification: 'work',
        work_description: work_description ? String(work_description).trim() : null,
        classified_at: new Date().toISOString(),
        time_report_id: time_report_id || null,
        end_location_lat: resolvedLat,
        end_location_lng: resolvedLng,
        end_location_recorded_at: resolvedRecordedAt,
      })
      .eq('id', openRows[0].id)
      .select()
      .single()
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    row = upd
  } else {
    const { data: ins, error: insErr } = await supabase
      .from('time_report_anomalies')
      .insert({
        organization_id: organizationId,
        staff_id: staffId,
        location_id: location_id || null,
        booking_id: booking_id || null,
        large_project_id: large_project_id || null,
        time_report_id: time_report_id || null,
        started_at,
        ended_at,
        classification: 'work',
        work_description: work_description ? String(work_description).trim() : null,
        classified_at: new Date().toISOString(),
        end_location_lat: resolvedLat,
        end_location_lng: resolvedLng,
        end_location_recorded_at: resolvedRecordedAt,
      })
      .select()
      .single()
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    row = ins
  }

  return new Response(JSON.stringify({ success: true, anomaly: row }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= GPS history lookup =============

/**
 * Returns the GPS position closest to a given timestamp from staff_location_history.
 * Searches within ±5 minutes window. Used by EndOfDayStopDialog when the user
 * enters a custom end-time so we can record where they were at that moment.
 */
async function handleGetPositionAtTime(supabase: any, staffId: string, data: any, organizationId: string) {
  const { at } = data || {}
  if (!at) {
    return new Response(JSON.stringify({ error: 'at (ISO timestamp) is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const targetMs = new Date(at).getTime()
  if (!isFinite(targetMs)) {
    return new Response(JSON.stringify({ error: 'invalid timestamp' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const windowMs = 5 * 60 * 1000
  const fromIso = new Date(targetMs - windowMs).toISOString()
  const toIso = new Date(targetMs + windowMs).toISOString()

  const { data: rows, error } = await supabase
    .from('staff_location_history')
    .select('lat, lng, accuracy, recorded_at')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .gte('recorded_at', fromIso)
    .lte('recorded_at', toIso)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  if (!rows || rows.length === 0) {
    return new Response(JSON.stringify({ position: null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Pick row closest to target time
  let best = rows[0]
  let bestDiff = Math.abs(new Date(best.recorded_at).getTime() - targetMs)
  for (const r of rows) {
    const diff = Math.abs(new Date(r.recorded_at).getTime() - targetMs)
    if (diff < bestDiff) {
      best = r
      bestDiff = diff
    }
  }
  return new Response(JSON.stringify({ position: best }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * Returns all GPS history points for a given staff member on a given date.
 * Used by admin movement map (StaffMovementMap) in StaffTimeReportDetail.
 */
async function handleGetMovementForDay(supabase: any, callerStaffId: string, data: any, organizationId: string) {
  const { staff_id, date } = data || {}
  if (!staff_id || !date) {
    return new Response(JSON.stringify({ error: 'staff_id and date are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Authorization: all authenticated users in the same organization may view any
  // staff member's movement. Org isolation is enforced via the organizationId
  // filter in the queries below.

  // Day window in Europe/Stockholm; simplified to UTC day for indexing speed
  const fromIso = `${date}T00:00:00.000Z`
  const toIso = `${date}T23:59:59.999Z`

  // Day-wide GPS via canonical paginated reader (replaces .limit(5000)).
  const movementFetch = await fetchAllStaffLocationPings({
    supabaseAdmin: supabase,
    organizationId,
    staffId: staff_id,
    startUtc: fromIso,
    endUtc: toIso,
  })
  if (movementFetch.diagnostics.errorMessage) {
    return new Response(JSON.stringify({ error: movementFetch.diagnostics.errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ points: movementFetch.rows, fetchDiagnostics: movementFetch.diagnostics }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= Arrival prompt (B-flow) =============

/**
 * Returns whether this staff member should see a "starta dagen?"-prompt right now.
 * Same source-of-truth used by both the mobile app (polling) and arrival-reminder cron.
 *
 * Rule: prompt if there is an open geofence-entry for this staff AND they have no
 * open time_report for the entry's date AND the prompt log isn't resolved.
 */
/**
 * Convert an ISO timestamp to its Europe/Stockholm calendar date (YYYY-MM-DD).
 * Uses sv-SE locale which produces ISO-like output.
 */
function stockholmDate(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
}

/**
 * Resolve a generic arrival target into a human-readable label + address.
 * Used so the prompt UI is identical regardless of target kind.
 */
async function resolveArrivalTargetLabel(
  supabase: any,
  organizationId: string,
  targetType: 'location' | 'project' | 'booking',
  targetId: string,
): Promise<{ label: string; address: string | null }> {
  try {
    if (targetType === 'location') {
      const { data } = await supabase
        .from('organization_locations')
        .select('name, address')
        .eq('id', targetId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      return { label: data?.name || 'Arbetsplats', address: data?.address || null }
    }
    if (targetType === 'project') {
      const { data } = await supabase
        .from('large_projects')
        .select('name, address')
        .eq('id', targetId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      return { label: data?.name || 'Projekt', address: data?.address || null }
    }
    // booking
    const { data } = await supabase
      .from('bookings')
      .select('client, deliveryaddress')
      .eq('id', targetId)
      .eq('organization_id', organizationId)
      .maybeSingle()
    return { label: data?.client || 'Uppdrag', address: data?.deliveryaddress || null }
  } catch {
    return { label: 'Arbetsplats', address: null }
  }
}

/**
 * Generic arrival state — works the same way for location, project and booking
 * arrivals. Looks for the most recent UNRESOLVED arrival_prompt_log entry for
 * this staff (across all target kinds) and decides whether to prompt.
 *
 * Backwards compatibility: also honours legacy `location_time_entries` rows
 * (open, source='gps') as implicit location-arrivals so existing fixed-location
 * data keeps working without re-recording.
 */
async function handleGetArrivalState(supabase: any, staffId: string, organizationId: string) {
  // 1. Most recent unresolved arrival from the generic log (any target kind).
  const { data: log } = await supabase
    .from('arrival_prompt_log')
    .select('id, target_type, target_id, location_id, arrived_at, prompt_count, resolved')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('resolved', false)
    .order('arrived_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let targetType: 'location' | 'project' | 'booking' | null = null
  let targetId: string | null = null
  let arrivedAt: string | null = null
  let promptCount = 0

  if (log) {
    targetType = (log.target_type as any) || (log.location_id ? 'location' : null)
    targetId = (log.target_id as string | null) || (log.location_id as string | null)
    arrivedAt = log.arrived_at as string
    promptCount = log.prompt_count ?? 0
  } else {
    // 2. Legacy fallback: open GPS location_time_entries → implicit location arrival.
    //    Skip entries that already have a RESOLVED arrival_prompt_log row for the
    //    same (staff, location, entered_at) — otherwise the user would get prompted
    //    again on every poll after dismissing.
    const { data: openEntry } = await supabase
      .from('location_time_entries')
      .select('location_id, entered_at')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .is('exited_at', null)
      .not('location_id', 'is', null)
      .order('entered_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openEntry) {
      const { data: alreadyResolved } = await supabase
        .from('arrival_prompt_log')
        .select('id')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .eq('target_type', 'location')
        .eq('target_id', openEntry.location_id)
        .eq('arrived_at', openEntry.entered_at)
        .eq('resolved', true)
        .limit(1)
        .maybeSingle()
      if (!alreadyResolved) {
        targetType = 'location'
        targetId = openEntry.location_id as string
        arrivedAt = openEntry.entered_at as string
      }
    }
  }

  if (!targetType || !targetId || !arrivedAt) {
    return new Response(JSON.stringify({
      should_prompt: false,
      target: null,
      prompts_sent: 0,
      // legacy mirror
      arrived_at: null, location_id: null, location_name: null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 3. "Already covered" check — same rule for all kinds.
  //    Resolved if there is an OPEN time_report OR a CLOSED report on the
  //    Stockholm calendar date of arrival whose start_time <= arrival HH:mm.
  const arrivedDateStockholm = stockholmDate(arrivedAt)
  const arrivedHHMM = new Date(arrivedAt).toLocaleTimeString('sv-SE', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm', hour12: false,
  })

  const { data: openReports } = await supabase
    .from('time_reports')
    .select('id')
    .eq('staff_id', staffId)
    .is('end_time', null)
    .limit(1)
  const { data: dayReports } = await supabase
    .from('time_reports')
    .select('id, start_time')
    .eq('staff_id', staffId)
    .eq('report_date', arrivedDateStockholm)
    .not('start_time', 'is', null)
    .limit(20)
  const coveringReport = (dayReports || []).find((r: any) => {
    const s = String(r.start_time || '').slice(0, 5)
    return s && s <= arrivedHHMM
  })

  const { label, address } = await resolveArrivalTargetLabel(supabase, organizationId, targetType, targetId)

  if ((openReports && openReports.length > 0) || coveringReport) {
    return new Response(JSON.stringify({
      should_prompt: false,
      target: { kind: targetType, target_id: targetId, label, arrived_at: arrivedAt, address },
      prompts_sent: promptCount,
      // legacy mirror
      arrived_at: arrivedAt,
      location_id: targetType === 'location' ? targetId : null,
      location_name: targetType === 'location' ? label : null,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({
    should_prompt: true,
    target: { kind: targetType, target_id: targetId, label, arrived_at: arrivedAt, address },
    prompts_sent: promptCount,
    // legacy mirror — only populated for location kind so existing UI keeps working
    arrived_at: arrivedAt,
    location_id: targetType === 'location' ? targetId : null,
    location_name: targetType === 'location' ? label : null,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * Marks an arrival prompt as resolved (user took an action: started timer,
 * adjusted time, or dismissed). Works identically for all three target kinds.
 *
 * Accepts BOTH the new generic shape `{ target_type, target_id, arrived_at }`
 * and the legacy `{ location_id, arrived_at }` shape so older clients keep
 * working during rollout.
 */
async function handleMarkArrivalResolved(supabase: any, staffId: string, data: any, organizationId: string) {
  const targetType: 'location' | 'project' | 'booking' | undefined =
    data?.target_type || (data?.location_id ? 'location' : undefined)
  const targetId: string | undefined = data?.target_id || data?.location_id
  const arrivedAt: string | undefined = data?.arrived_at

  if (!targetType || !targetId || !arrivedAt) {
    return new Response(JSON.stringify({
      error: 'target_type, target_id and arrived_at are required (location_id+arrived_at also accepted for backwards compat)'
    }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: existing } = await supabase
    .from('arrival_prompt_log')
    .select('id')
    .eq('staff_id', staffId)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('arrived_at', arrivedAt)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('arrival_prompt_log')
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase
      .from('arrival_prompt_log')
      .insert({
        organization_id: organizationId,
        staff_id: staffId,
        target_type: targetType,
        target_id: targetId,
        // legacy mirror: keep location_id populated for location arrivals
        location_id: targetType === 'location' ? targetId : null,
        arrived_at: arrivedAt,
        prompt_count: 0,
        resolved: true,
        resolved_at: new Date().toISOString(),
      })
  }

  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * Generic arrival registration — called by the mobile app the moment a
 * geofence enter fires (for ANY target kind: location, project, booking).
 *
 * Idempotent on (staff, target, arrived_at): repeated calls within a small
 * window return the existing row so we never get duplicate prompts.
 *
 * For `kind=location` this is mostly redundant with `report_location` (the
 * GPS path already inserts a location_time_entries row). But registering it
 * explicitly here keeps the contract identical for all three kinds, which is
 * the whole point of the unification.
 */
async function handleReportArrival(supabase: any, staffId: string, data: any, organizationId: string) {
  const kind: 'location' | 'project' | 'booking' | undefined = data?.kind
  const targetId: string | undefined = data?.target_id
  const arrivedAtRaw: string | undefined = data?.arrived_at

  if (!kind || !['location', 'project', 'booking'].includes(kind) || !targetId) {
    return new Response(JSON.stringify({ error: 'kind and target_id are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Validate arrived_at: must be a valid past timestamp within the last 24h.
  let arrivedAt = new Date().toISOString()
  if (arrivedAtRaw) {
    const parsed = new Date(arrivedAtRaw)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      arrivedAt = parsed.toISOString()
    }
  }

  // ── ARRIVAL = SIGNAL ONLY (2026-04 cleanup) ──
  // handleReportArrival loggar arrival och speglar till assistant_events som
  // audit. Ingen workday-autostart här — frontend äger startkedjan via
  // tryStartFromArrival → ensureWorkDayActive → startSession. Detta tar bort
  // dubbla skrivvägar mot workdays-tabellen vid geofence-enter.

  // ── prompt-log (alla arrivals — assigned eller ej) ──
  // Dedupe: if there is already an UNRESOLVED log row for the same
  // (staff, target, ~arrived_at) within the last 6h, return it instead of
  // creating a new one. This makes repeated geofence pings safe.
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('arrival_prompt_log')
    .select('id, arrived_at, prompt_count, resolved')
    .eq('staff_id', staffId)
    .eq('target_type', kind)
    .eq('target_id', targetId)
    .eq('resolved', false)
    .gte('arrived_at', sixHoursAgo)
    .order('arrived_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    return new Response(JSON.stringify({ success: true, arrival: existing, idempotent: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: inserted, error } = await supabase
    .from('arrival_prompt_log')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      target_type: kind,
      target_id: targetId,
      location_id: kind === 'location' ? targetId : null,
      arrived_at: arrivedAt,
      prompt_count: 0,
      resolved: false,
    })
    .select('id, arrived_at, prompt_count, resolved')
    .maybeSingle()

  if (error) {
    console.error('[mobile-app-api] report_arrival insert error:', error)
    return new Response(JSON.stringify({ error: 'Failed to register arrival' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ── DUAL-WRITE → assistant_events (Runda 1b) ──
  // Skriv parallellt till den nya event-modellen. Best-effort: misslyckande
  // får INTE förstöra prompt-flödet (gammal väg är fortfarande source of truth).
  await dualWriteAssistantEvent(supabase, {
    organization_id: organizationId,
    staff_id: staffId,
    event_type: 'arrival',
    target_type: kind,
    target_id: targetId,
    happened_at: arrivedAt,
    source: 'geofence_foreground',
    suggested_action: 'start_activity',
  })

  // NOTE: No server-side workday autostart here — workday is owned by the
  // frontend central start chain (tryStartFromArrival → ensureWorkDayActive).
  // Backend keeps arrival as pure signal/audit to avoid double writes.

  return new Response(JSON.stringify({ success: true, arrival: inserted }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── Dual-write helper för assistant_events ─────────────────────────────────
// Best-effort. Loggar fel men kastar aldrig.
async function dualWriteAssistantEvent(supabase: any, payload: {
  organization_id: string
  staff_id: string
  event_type: 'arrival' | 'departure' | 'home_arrival' | 'travel_edge'
  target_type: 'location' | 'project' | 'booking' | 'home' | 'unknown'
  target_id: string | null
  target_label?: string | null
  target_address?: string | null
  happened_at: string
  source?: string
  suggested_action?: string
  metadata?: Record<string, unknown>
}) {
  try {
    const bucket = Math.floor(new Date(payload.happened_at).getTime() / (5 * 60_000))
    const dedupeKey = `${payload.staff_id}:${payload.event_type}:${payload.target_type}:${payload.target_id ?? 'null'}:${bucket}`

    // CRITICAL: spegla target_type/target_id även in i metadata så
    // klientsidans `eventToTarget()` (review-flödet) kan mappa eventet
    // till en WorkTarget. Utan target_kind i metadata blev hela
    // recovery-flödet en no-op.
    const mergedMeta: Record<string, unknown> = {
      ...(payload.metadata ?? {}),
      target_kind: payload.target_type,
      target_id: payload.target_id,
    }

    const { error } = await supabase
      .from('assistant_events')
      .insert({
        organization_id: payload.organization_id,
        staff_id: payload.staff_id,
        event_type: payload.event_type,
        target_type: payload.target_type,
        target_id: payload.target_id,
        target_label: payload.target_label ?? null,
        target_address: payload.target_address ?? null,
        happened_at: payload.happened_at,
        source: payload.source ?? 'geofence_foreground',
        suggested_action: payload.suggested_action ?? 'review_only',
        dedupe_key: dedupeKey,
        metadata: mergedMeta,
      })

    if (error && String(error.code) !== '23505') {
      console.warn('[dualWriteAssistantEvent] insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[dualWriteAssistantEvent] unhandled error:', err)
  }
}

// ── handleReportDeparture (Runda 1b) ───────────────────────────────────────
// Klienten anropar detta när geofence detekterar att användaren lämnat en
// target hen varit inne på i ≥5 min. Skapar enbart assistant_event — INGEN
// auto-stop av timer eller anomalitet.
async function handleReportDeparture(supabase: any, staffId: string, data: any, organizationId: string) {
  const kind: 'location' | 'project' | 'booking' | undefined = data?.kind
  const targetId: string | undefined = data?.target_id
  const targetLabel: string | null = data?.target_label ?? null
  const departedAtRaw: string | undefined = data?.departed_at
  const dwellMinutes: number | undefined = data?.dwell_minutes

  if (!kind || !['location', 'project', 'booking'].includes(kind) || !targetId) {
    return new Response(JSON.stringify({ error: 'kind and target_id are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let departedAt = new Date().toISOString()
  if (departedAtRaw) {
    const parsed = new Date(departedAtRaw)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      departedAt = parsed.toISOString()
    }
  }

  await dualWriteAssistantEvent(supabase, {
    organization_id: organizationId,
    staff_id: staffId,
    event_type: 'departure',
    target_type: kind,
    target_id: targetId,
    target_label: targetLabel,
    happened_at: departedAt,
    source: 'geofence_foreground',
    suggested_action: 'end_activity',
    metadata: typeof dwellMinutes === 'number' ? { dwell_minutes: dwellMinutes } : {},
  })

  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ── handleReportHomeArrival (Runda 1b) ─────────────────────────────────────
// Geofence inom användarens "hem"-radie → skapa home_arrival-event.
// Suggested_action = end_workday. Ingen auto-end, bara underlag.
async function handleReportHomeArrival(supabase: any, staffId: string, data: any, organizationId: string) {
  const arrivedAtRaw: string | undefined = data?.arrived_at
  let arrivedAt = new Date().toISOString()
  if (arrivedAtRaw) {
    const parsed = new Date(arrivedAtRaw)
    const now = Date.now()
    if (!isNaN(parsed.getTime()) && parsed.getTime() <= now && parsed.getTime() >= now - 24 * 3600 * 1000) {
      arrivedAt = parsed.toISOString()
    }
  }

  await dualWriteAssistantEvent(supabase, {
    organization_id: organizationId,
    staff_id: staffId,
    event_type: 'home_arrival',
    target_type: 'home',
    target_id: null,
    happened_at: arrivedAt,
    source: 'geofence_foreground',
    suggested_action: 'end_workday',
  })

  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ════════════════════════════════════════════════════════════════════════════
// Centralized chat READ handlers (PROMPT 1) — single backend layer for messaging
// All apply: org isolation + dual-identity (staffId + userId) + auth required.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build conditions for a DM thread between caller (myIds) and a partner (partnerIds).
 * Mirrors the previous client-side fetchDirectMessages OR-filter.
 */
function buildDMThreadOrFilter(myIds: string[], partnerIds: string[]): string {
  const conds: string[] = []
  for (const me of myIds) {
    for (const partner of partnerIds) {
      conds.push(`and(sender_id.eq.${me},recipient_id.eq.${partner})`)
      conds.push(`and(sender_id.eq.${partner},recipient_id.eq.${me})`)
    }
  }
  return conds.join(',')
}

// NOTE: handleGetDMThread is defined earlier (cursor-paginated implementation,
// see ~line 3045). The duplicate non-paginated version that lived here was
// removed to fix a "Identifier already declared" boot error in the deployed
// Edge Function. The paginated version is the one wired into the dispatcher
// for both `get_dm_thread` and `get_dm_messages` actions.

/** Inbox view grouped by conversation partner (last message + unread count). */
async function handleGetDMInboxGrouped(
  supabase: any,
  staffId: string,
  organizationId: string,
  userId: string | null,
) {
  const myIds = [staffId]
  if (userId && userId !== staffId) myIds.push(userId)
  const myIdSet = new Set(myIds)
  const orFilter = myIds.map((id) => `sender_id.eq.${id},recipient_id.eq.${id}`).join(',')

  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .or(orFilter)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[get_dm_inbox_grouped] error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch DM inbox' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  type Group = {
    recipientId: string
    recipientName: string
    lastMessage: string
    lastTimestamp: string
    unreadCount: number
    isSentByMe: boolean
  }
  const conv = new Map<string, Group>()

  for (const m of (data || [])) {
    const arch = Array.isArray(m.is_archived_by) ? m.is_archived_by : []
    if (myIds.some((id) => arch.includes(id))) continue

    const isMe = myIdSet.has(m.sender_id)
    const partnerId = isMe ? m.recipient_id : m.sender_id
    const partnerName = isMe ? m.recipient_name : m.sender_name
    if (myIdSet.has(partnerId)) continue

    if (!conv.has(partnerId)) {
      conv.set(partnerId, {
        recipientId: partnerId,
        recipientName: partnerName,
        lastMessage: m.content,
        lastTimestamp: m.created_at,
        unreadCount: 0,
        isSentByMe: isMe,
      })
    }
    if (!isMe && !m.is_read) {
      conv.get(partnerId)!.unreadCount++
    }
  }

  const conversations = Array.from(conv.values()).sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime(),
  )

  return new Response(JSON.stringify({ conversations }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/** Unread DM count for caller (sum across all identities). */
async function handleGetUnreadDMCount(
  supabase: any,
  staffId: string,
  organizationId: string,
  userId: string | null,
) {
  const myIds = [staffId]
  if (userId && userId !== staffId) myIds.push(userId)

  const { count, error } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .in('recipient_id', myIds)
    .eq('is_read', false)

  if (error) {
    console.error('[get_unread_dm_count] error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch unread count' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ count: count || 0 }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/** Resolve participants for a job chat (staff assigned for the date + planners). */
async function handleGetJobParticipants(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
  userId: string | null,
) {
  const booking_id = data?.booking_id
  const date = data?.date || new Date().toISOString().slice(0, 10)
  if (!booking_id) {
    return new Response(JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const denied = await assertJobAccess(supabase, booking_id, staffId, organizationId, userId)
  if (denied) return denied

  const participants: { id: string; name: string; role: 'planner' | 'team_leader' | 'staff' }[] = []

  const { data: assignments } = await supabase
    .from('booking_staff_assignments')
    .select('staff_id')
    .eq('booking_id', booking_id)
    .eq('assignment_date', date)
    .eq('organization_id', organizationId)

  const staffIds = [...new Set((assignments || []).map((a: any) => a.staff_id))]
  if (staffIds.length > 0) {
    const { data: staffData } = await supabase
      .from('staff_members')
      .select('id, name, role')
      .in('id', staffIds)
      .eq('organization_id', organizationId)

    for (const s of (staffData || []) as any[]) {
      const r = String(s.role || '').toLowerCase()
      const isLeader = r.includes('ledare') || r.includes('leader')
      participants.push({ id: s.id, name: s.name, role: isLeader ? 'team_leader' : 'staff' })
    }
  }

  // Planners in this org
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name, email')
    .eq('organization_id', organizationId)

  for (const p of (profiles || []) as any[]) {
    participants.push({
      id: p.user_id,
      name: p.full_name || p.email || 'Planerare',
      role: 'planner',
    })
  }

  return new Response(JSON.stringify({ participants }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/** Recent broadcasts in the org (no filtering — caller decides what to show). */
async function handleGetRecentBroadcasts(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('broadcast_messages')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[get_recent_broadcasts] error:', error)
    return new Response(JSON.stringify({ error: 'Failed to fetch broadcasts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ broadcasts: data || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * handleCreateTravelFromGap — central, idempotent skapelse av restid
 * från ett gap mellan två arbetsaktiviteter (gap-modellen).
 *
 * Modellen (Tidappen):
 *   • Restid = GAPET mellan föregående stopp och nästa start.
 *   • Endast riktiga arbetstargets räknas (project | booking | location).
 *   • Tröskelregler:
 *       <10 min   → klienten ska inte ens anropa (ignoreras här ändå)
 *       10–180 min → 'work', skapas direkt
 *       >180 min  → needs_review=true, skapas men kräver attest
 *
 * Idempotens:
 *   • UNIQUE-index på (staff_id, organization_id, start_time, end_time)
 *     WHERE source='gap_derived' garanterar att samma gap aldrig
 *     dubbelregistreras (race-säker).
 *   • Vi gör en pre-check också så vi kan returnera "redan skapad" snyggt
 *     utan att klienten ser ett 23505-fel.
 */
async function handleCreateTravelFromGap(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const {
    previous_target_type,
    previous_target_id,
    previous_target_label,
    next_target_type,
    next_target_id,
    next_target_label,
    start_time,
    end_time,
  } = data || {}

  // ── Validation ────────────────────────────────────────────────────
  const ALLOWED_KINDS = ['project', 'booking', 'location']
  if (!start_time || !end_time) {
    return new Response(
      JSON.stringify({ error: 'start_time and end_time are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (
    !ALLOWED_KINDS.includes(previous_target_type) ||
    !ALLOWED_KINDS.includes(next_target_type)
  ) {
    return new Response(
      JSON.stringify({ error: 'previous_target_type/next_target_type must be project|booking|location' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  if (!previous_target_id || !next_target_id) {
    return new Response(
      JSON.stringify({ error: 'previous_target_id/next_target_id are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Trunkera till hel sekund så ms-drift aldrig kringgår dedupe-indexet.
  const truncSec = (iso: string) => {
    const ms = new Date(iso).getTime()
    if (!Number.isFinite(ms)) return null
    return new Date(Math.floor(ms / 1000) * 1000).toISOString()
  }
  const startIso = truncSec(start_time)
  const endIso = truncSec(end_time)
  if (!startIso || !endIso) {
    return new Response(
      JSON.stringify({ error: 'invalid time range' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (endMs <= startMs) {
    return new Response(
      JSON.stringify({ error: 'invalid time range' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const gapMin = Math.round((endMs - startMs) / 60000)

  // <10 min är klientens ansvar att filtrera bort, men vi vägrar här ändå.
  if (gapMin < 10) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'gap_too_short', gap_minutes: gapMin }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Cross-day → vi vägrar (gap-modellen rör enbart samma dag).
  const startDate = startIso.split('T')[0]
  const endDate = endIso.split('T')[0]
  if (startDate !== endDate) {
    return new Response(
      JSON.stringify({ skipped: true, reason: 'cross_day' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── Idempotens-koll (sekund-trunkad) ──────────────────────────────
  const { data: existing, error: existingErr } = await supabase
    .from('travel_time_logs')
    .select('*')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('source', 'gap_derived')
    .eq('start_time', startIso)
    .eq('end_time', endIso)
    .maybeSingle()

  if (existingErr) {
    console.error('[handleCreateTravelFromGap] dedupe lookup failed:', existingErr)
  } else if (existing) {
    console.log(
      `[handleCreateTravelFromGap] gap already exists for staff ${staffId} (${gapMin} min) → returning existing`,
    )
    return new Response(
      JSON.stringify({ success: true, deduplicated: true, travel_log: existing }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // ── GPS-berikning: hämta närmsta ping vid start/end och reverse-geocoda ──
  // Vi söker en ±15 min fönster runt varje ändpunkt i staff_location_history.
  const WINDOW_MIN = 15
  const winStartMin = new Date(startMs - WINDOW_MIN * 60_000).toISOString()
  const winStartMax = new Date(startMs + WINDOW_MIN * 60_000).toISOString()
  const winEndMin = new Date(endMs - WINDOW_MIN * 60_000).toISOString()
  const winEndMax = new Date(endMs + WINDOW_MIN * 60_000).toISOString()

  const pickClosest = (rows: any[], targetMs: number) => {
    if (!rows || rows.length === 0) return null
    let best: any = null
    let bestDelta = Infinity
    for (const r of rows) {
      const t = new Date(r.recorded_at).getTime()
      const d = Math.abs(t - targetMs)
      if (d < bestDelta) { bestDelta = d; best = r }
    }
    return best
  }

  const [{ data: pingsAroundStart }, { data: pingsAroundEnd }] = await Promise.all([
    supabase.from('staff_location_history')
      .select('lat,lng,recorded_at')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .gte('recorded_at', winStartMin)
      .lte('recorded_at', winStartMax)
      .order('recorded_at', { ascending: true })
      .limit(50),
    supabase.from('staff_location_history')
      .select('lat,lng,recorded_at')
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
      .gte('recorded_at', winEndMin)
      .lte('recorded_at', winEndMax)
      .order('recorded_at', { ascending: true })
      .limit(50),
  ])

  const fromPing = pickClosest(pingsAroundStart || [], startMs)
  const toPing = pickClosest(pingsAroundEnd || [], endMs)

  // Mapbox reverse-geocode (best effort, blockerar inte insert vid fel).
  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN') || Deno.env.get('MAPBOX_TOKEN') || null
  async function reverseGeocode(lat: number | null | undefined, lng: number | null | undefined): Promise<string | null> {
    if (!mapboxToken || lat == null || lng == null) return null
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=sv&limit=1&types=address,poi,neighborhood,locality,place`
      const res = await fetch(url)
      if (!res.ok) return null
      const data = await res.json()
      const feature = data?.features?.[0]
      if (!feature) return null
      const place = (feature.context || []).find((c: any) =>
        typeof c.id === 'string' && (c.id.startsWith('place.') || c.id.startsWith('locality.'))
      )?.text
      const name = feature.text
      if (name && place && name !== place) return `${name}, ${place}`
      return feature.place_name?.split(',').slice(0, 2).join(',').trim() ?? name ?? null
    } catch (e) {
      console.warn('[handleCreateTravelFromGap] reverseGeocode failed:', (e as Error)?.message)
      return null
    }
  }

  const fromLat = fromPing ? Number(fromPing.lat) : null
  const fromLng = fromPing ? Number(fromPing.lng) : null
  const toLat = toPing ? Number(toPing.lat) : null
  const toLng = toPing ? Number(toPing.lng) : null

  const [fromAddress, toAddress] = await Promise.all([
    reverseGeocode(fromLat, fromLng),
    reverseGeocode(toLat, toLng),
  ])

  // ── Beslutsregler för needs_review ────────────────────────────────
  const needsReview = gapMin > 180
  const classification = needsReview ? 'unclassified' : 'work'
  const hours = Number((gapMin / 60).toFixed(2))

  const description =
    `Gap: ${previous_target_label || previous_target_type} → ` +
    `${next_target_label || next_target_type} (${gapMin} min)`

  const insertPayload: Record<string, unknown> = {
    staff_id: staffId,
    organization_id: organizationId,
    report_date: startDate,
    start_time: startIso,
    end_time: endIso,
    hours_worked: hours,
    description,
    auto_detected: true,
    source: 'gap_derived',
    needs_review: needsReview,
    classification,
    previous_target_type,
    previous_target_id,
    next_target_type,
    next_target_id,
    from_latitude: fromLat,
    from_longitude: fromLng,
    to_latitude: toLat,
    to_longitude: toLng,
    from_address: fromAddress,
    to_address: toAddress,
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('travel_time_logs')
    .insert(insertPayload)
    .select('*')
    .single()

  if (insertErr) {
    if ((insertErr as any)?.code === '23505') {
      const { data: raceRow } = await supabase
        .from('travel_time_logs')
        .select('*')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .eq('source', 'gap_derived')
        .eq('start_time', startIso)
        .eq('end_time', endIso)
        .maybeSingle()
      if (raceRow) {
        return new Response(
          JSON.stringify({ success: true, deduplicated: true, travel_log: raceRow }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }
    console.error('[handleCreateTravelFromGap] insert failed:', insertErr)
    return new Response(
      JSON.stringify({ error: 'insert_failed', detail: (insertErr as any)?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  console.log(
    `[handleCreateTravelFromGap] created ${inserted.id} (${gapMin} min, needs_review=${needsReview}, from="${fromAddress}", to="${toAddress}") for staff ${staffId}`,
  )
  return new Response(
    JSON.stringify({ success: true, travel_log: inserted, gap_minutes: gapMin, needs_review: needsReview }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}


// ============================================================================
// Smart-karta — arrival-context handlers
// ----------------------------------------------------------------------------
// Scenario A: user accepted that the arrival is related to a planned booking
// they are NOT assigned to. We:
//   1. Mark the travel_log with related_booking_id + comment
//   2. Open a location_time_entry for that booking (presence signal only)
//   3. Mark the arrival_context_suggestions row as accepted
//   4. Create a workday_flag of severity 'info' so admin sees the visit
// We never create a booking_staff_assignment.
// ============================================================================

async function handleAcceptUnplannedSiteVisit(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { suggestion_id, travel_log_id, booking_id, note } = data || {}

  if (!booking_id || typeof booking_id !== 'string') {
    return new Response(JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const trimmedNote = typeof note === 'string' ? note.trim().slice(0, 200) : ''
  if (trimmedNote.length < 3) {
    return new Response(JSON.stringify({ error: 'Note must be at least 3 characters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)

  // 1. Annotate travel_log
  if (travel_log_id) {
    await supabase
      .from('travel_time_logs')
      .update({
        related_booking_id: booking_id,
        related_booking_note: trimmedNote,
      })
      .eq('id', travel_log_id)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
  }

  // 2. Open a location_time_entry (idempotent: re-use any open one for same booking)
  let entry: any = null
  const { data: openEntry } = await supabase
    .from('location_time_entries')
    .select('*')
    .eq('staff_id', staffId)
    .eq('booking_id', booking_id)
    .is('exited_at', null)
    .limit(1)
    .maybeSingle()
  if (openEntry) {
    entry = openEntry
  } else {
    // Workday-first: never create an LTE without an open workday.
    try {
      await ensureOpenWorkdayForTimer(supabase, {
        staff_id: staffId,
        organization_id: organizationId,
        start_at: nowIso,
        source: 'accept_unplanned_site_visit',
        target: { kind: 'booking', id: booking_id },
      })
    } catch (wdErr: any) {
      console.error('[accept_unplanned_site_visit] workday-first failed, aborting:', wdErr)
      return new Response(
        JSON.stringify({ error: 'workday_first_failed', detail: wdErr?.message || String(wdErr) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    const { data: inserted, error: insErr } = await supabase
      .from('location_time_entries')
      .insert({
        organization_id: organizationId,
        staff_id: staffId,
        booking_id,
        entered_at: nowIso,
        entry_date: today,
        source: 'arrival_context_unplanned_visit',
      })
      .select()
      .single()
    if (insErr) {
      console.error('[accept_unplanned_site_visit] entry insert error:', insErr)
    } else {
      entry = inserted
    }
  }

  // 3. Mark suggestion accepted
  if (suggestion_id) {
    await supabase
      .from('arrival_context_suggestions')
      .update({ decision: 'accepted', decided_at: nowIso })
      .eq('id', suggestion_id)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
  }

  // 4. Workday flag for admin visibility (info-only, no user input needed)
  await supabase
    .from('workday_flags')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      flag_type: 'presence_without_report',
      severity: 'info',
      flag_date: today,
      title: 'Besök vid planerat jobb utan tilldelning',
      description: trimmedNote,
      needs_user_input: false,
      assistant_decision_kind: 'arrival_context_unplanned_visit',
      related_booking_id: booking_id,
      context: { source: 'arrival_context', travel_log_id: travel_log_id || null },
    })
    .then(() => {}, (e: any) => console.warn('[accept_unplanned_site_visit] flag insert failed:', e))

  return new Response(JSON.stringify({ success: true, entry }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleEndUnplannedSiteVisit(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { entry_id } = data || {}
  if (!entry_id) {
    return new Response(JSON.stringify({ error: 'entry_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const { data: updated, error } = await supabase
    .from('location_time_entries')
    .update({
      exited_at: new Date().toISOString(),
      stop_source: 'user_manual',
      stop_reason: 'user_pressed_stop',
      stopped_by: staffId,
      stop_metadata: { closed_via: 'end_unplanned_site_visit' },
    })
    .eq('id', entry_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .is('exited_at', null)
    .select()
    .maybeSingle()
  if (error) {
    console.error('[end_unplanned_site_visit] error:', error)
    return new Response(JSON.stringify({ error: 'Failed to close visit' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ success: true, entry: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * Scenario B: user said "this stop was lunch". If they have an open
 * time_report for today, bump break_time (hours, capped 5–90 min). If no
 * open report, just mark the suggestion accepted — no time_report is
 * created automatically.
 */
async function handleRegisterBreakFromTravel(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { suggestion_id, duration_minutes } = data || {}
  const nowIso = new Date().toISOString()
  const today = nowIso.slice(0, 10)

  const minutes = Math.max(5, Math.min(90, Math.round(Number(duration_minutes) || 30)))
  const hours = +(minutes / 60).toFixed(2)

  // Find today's open / latest time_report for staff
  const { data: reports } = await supabase
    .from('time_reports')
    .select('id, break_time')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .eq('report_date', today)
    .order('start_time', { ascending: false })
    .limit(1)

  let updatedReportId: string | null = null
  if (reports && reports.length > 0) {
    const r = reports[0]
    const newBreak = +(Number(r.break_time || 0) + hours).toFixed(2)
    await supabase
      .from('time_reports')
      .update({ break_time: newBreak })
      .eq('id', r.id)
    updatedReportId = r.id
  }

  if (suggestion_id) {
    await supabase
      .from('arrival_context_suggestions')
      .update({ decision: 'accepted', decided_at: nowIso, payload: { break_minutes: minutes } })
      .eq('id', suggestion_id)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
  }

  return new Response(JSON.stringify({
    success: true,
    minutes,
    updated_time_report_id: updatedReportId,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

/**
 * Scenario C: user said the supply-store visit was for a specific project.
 * We just record the intent on travel_log + suggestion. Receipt upload
 * is handled by existing pipeline elsewhere.
 */
async function handleLinkPurchaseIntent(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { suggestion_id, travel_log_id, booking_id, large_project_id, location_id, supplier_name } = data || {}
  const nowIso = new Date().toISOString()

  if (travel_log_id) {
    await supabase
      .from('travel_time_logs')
      .update({
        related_booking_id: booking_id || null,
        related_booking_note: supplier_name ? `Inköp ${supplier_name}` : 'Inköp',
      })
      .eq('id', travel_log_id)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
  }

  if (suggestion_id) {
    await supabase
      .from('arrival_context_suggestions')
      .update({
        decision: 'accepted',
        decided_at: nowIso,
        payload: {
          purchase_target: { booking_id, large_project_id, location_id },
          supplier_name,
        },
      })
      .eq('id', suggestion_id)
      .eq('staff_id', staffId)
      .eq('organization_id', organizationId)
  }

  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function handleRejectArrivalSuggestion(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { suggestion_id } = data || {}
  if (!suggestion_id) {
    return new Response(JSON.stringify({ error: 'suggestion_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  await supabase
    .from('arrival_context_suggestions')
    .update({ decision: 'rejected', decided_at: new Date().toISOString() })
    .eq('id', suggestion_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
  return new Response(JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= Auto-start decline log =============
// User explicitly tapped "Nej" / "Detta är inte arbete" on an arrival prompt.
// Persist a hard suppression so GPS auto-start never tries the same target /
// place again until expires_at (defaults to end-of-local-day).
//
// Mobile app owns only day start/stop. GPS/geofence is evidence only —
// this row blocks the auto-start engine, NOT manual start.
async function handleRecordAutoStartDecline(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const {
    target_type,        // 'project' | 'booking' | 'warehouse' | 'organization_location' | null
    target_id,          // UUID/text or null
    target_label,       // optional human label for diagnostics
    lat, lng, radius_m, // optional geographic point (used when target_id is null)
    local_date,         // 'YYYY-MM-DD' Stockholm-local; defaults to today
    expires_at,         // optional ISO; defaults to local end-of-day
    source,             // optional, defaults to 'user_arrival_prompt'
    metadata,           // optional jsonb
  } = data || {}

  // Compute defaults: rest of the local day at minimum.
  const nowIso = new Date().toISOString()
  const today = (local_date && /^\d{4}-\d{2}-\d{2}$/.test(local_date))
    ? local_date
    : new Date().toISOString().slice(0, 10)
  const defaultExpiry = `${today}T23:59:59.000Z`
  const finalExpiry = (typeof expires_at === 'string' && expires_at) ? expires_at : defaultExpiry

  // Need at least target_id OR a coordinate pair to be useful.
  if (!target_id && (typeof lat !== 'number' || typeof lng !== 'number')) {
    return new Response(
      JSON.stringify({ error: 'record_auto_start_decline requires target_id or lat+lng' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { data: inserted, error } = await supabase
    .from('auto_start_decline_log')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      declined_at: nowIso,
      local_date: today,
      target_type: target_type ?? null,
      target_id: target_id ?? null,
      target_label: target_label ?? null,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      radius_m: typeof radius_m === 'number' ? radius_m : null,
      expires_at: finalExpiry,
      day_scope: true,
      source: source || 'user_arrival_prompt',
      response: 'declined',
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    })
    .select('id, expires_at')
    .maybeSingle()

  if (error) {
    console.error('[mobile-app-api] record_auto_start_decline failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({
    success: true,
    decline_id: inserted?.id ?? null,
    expires_at: inserted?.expires_at ?? finalExpiry,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============= Stale day end correction =============
// Called from StaleDayCorrectionDialog when the user picks the actual
// end-of-day time. Adjusts the affected entries (listed in flag.context.
// affected_entries) to the chosen ISO time, recomputes durations, and
// resolves the workday_flag.
async function handleCorrectStaleDayEnd(
  supabase: any,
  staffId: string,
  data: any,
  organizationId: string,
) {
  const { flag_id, chosen_end_iso } = data || {}
  if (!flag_id || !chosen_end_iso) {
    return new Response(
      JSON.stringify({ error: 'flag_id and chosen_end_iso required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const chosen = new Date(chosen_end_iso)
  if (isNaN(chosen.getTime())) {
    return new Response(JSON.stringify({ error: 'invalid chosen_end_iso' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: flag } = await supabase
    .from('workday_flags')
    .select('id, staff_id, context, resolved')
    .eq('id', flag_id)
    .eq('organization_id', organizationId)
    .single()
  if (!flag) {
    return new Response(JSON.stringify({ error: 'flag not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (flag.staff_id !== staffId) {
    return new Response(JSON.stringify({ error: 'forbidden' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (flag.resolved) {
    return new Response(JSON.stringify({ success: true, already_resolved: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const affected: Array<{ table: string; id: string }> =
    (flag.context as any)?.affected_entries || []

  for (const entry of affected) {
    if (entry.table === 'location_time_entries') {
      const { data: row } = await supabase
        .from('location_time_entries')
        .select('entered_at')
        .eq('id', entry.id)
        .single()
      if (row?.entered_at) {
        const minutes = Math.max(
          0,
          Math.round((chosen.getTime() - new Date(row.entered_at).getTime()) / 60000),
        )
        await supabase
          .from('location_time_entries')
          .update({
            exited_at: chosen.toISOString(),
            total_minutes: minutes,
            stop_source: 'user_manual',
            stop_reason: 'user_saved_time_report',
            stopped_by: staffId,
            stop_metadata: { closed_via: 'resolve_workday_flag', flag_id: (flag as any)?.id },
          })
          .eq('id', entry.id)
      }
    } else if (entry.table === 'travel_time_logs') {
      const { data: row } = await supabase
        .from('travel_time_logs')
        .select('start_time')
        .eq('id', entry.id)
        .single()
      if (row?.start_time) {
        const hours = Math.max(
          0,
          (chosen.getTime() - new Date(row.start_time).getTime()) / (1000 * 60 * 60),
        )
        await supabase
          .from('travel_time_logs')
          .update({
            end_time: chosen.toISOString(),
            hours_worked: Number(hours.toFixed(2)),
          })
          .eq('id', entry.id)
      }
    } else if (entry.table === 'time_reports') {
      const { data: row } = await supabase
        .from('time_reports')
        .select('report_date, start_time')
        .eq('id', entry.id)
        .single()
      if (row?.report_date && row?.start_time) {
        const startIso = new Date(`${row.report_date}T${row.start_time}Z`).getTime()
        const hours = Math.max(0, (chosen.getTime() - startIso) / (1000 * 60 * 60))
        const endTimeOnly = chosen.toISOString().slice(11, 19)
        await supabase
          .from('time_reports')
          .update({ end_time: endTimeOnly, hours_worked: Number(hours.toFixed(2)) })
          .eq('id', entry.id)
      }
    }
  }

  const { data: updated } = await supabase
    .from('workday_flags')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_source: 'staff',
      resolution_note: `User confirmed end time: ${chosen.toISOString()}`,
      resolved_by: staffId,
      needs_user_input: false,
    })
    .eq('id', flag_id)
    .select()
    .single()

  return new Response(JSON.stringify({ success: true, flag: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============================================================================
// PLANNER OVERVIEW HANDLERS
// ----------------------------------------------------------------------------
// Backend for the mobile "Översikt"-tab that only system users (any row in
// user_roles) get to see. All three handlers strictly:
//   1. Verify caller is a planner (user_roles row exists). 403 otherwise.
//   2. Filter all reads by organization_id (multi-tenant isolation).
//   3. Return data shaped for the mobile UI (no joins the client can't use).
// ============================================================================

async function callerIsPlanner(supabase: any, callerUserId: string | null): Promise<boolean> {
  if (!callerUserId) return false
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', callerUserId)
    .limit(1)
  if (error) {
    console.error('[overview] planner check failed:', error)
    return false
  }
  return Array.isArray(data) && data.length > 0
}

function plannerForbidden() {
  return new Response(
    JSON.stringify({ error: 'Forbidden: planner role required' }),
    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── get_overview_calendar ──
// Returns calendar_events PLUS synthetic rows derived from bookings and
// large_projects. The synthetic rows guarantee that the planner overview
// never drops a job during a transient calendar_events sync gap.
//
// Identity for de-dupe: `${booking_id}|${event_type}|${source_date}`.
// If a real calendar_events row exists for an identity, the synthetic row
// for the same identity is skipped (real data wins for times/team).
async function handleGetOverviewCalendar(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerIsPlanner(supabase, callerUserId))) return plannerForbidden()

  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const defaultTo = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
  const fromIso = (typeof data?.from === 'string' && data.from) || defaultFrom.toISOString()
  const toIso = (typeof data?.to === 'string' && data.to) || defaultTo.toISOString()
  const fromDate = fromIso.slice(0, 10)
  const toDate = toIso.slice(0, 10)

  // ── 1) Real calendar_events ────────────────────────────────────────────
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('id, title, start_time, end_time, event_type, resource_id, booking_id, booking_number, delivery_address, source_date')
    .eq('organization_id', organizationId)
    .neq('event_type', 'event')
    .gte('start_time', fromIso)
    .lt('start_time', toIso)
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[overview-calendar] fetch failed:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch calendar events' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const real = events || []
  const seen = new Set<string>()
  for (const ev of real) {
    const key = `${ev.booking_id || ''}|${ev.event_type || ''}|${ev.source_date || (ev.start_time || '').slice(0, 10)}`
    seen.add(key)
  }

  // ── 2) Bookings in window (anti-flicker source of truth) ───────────────
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, client, booking_number, deliveryaddress, large_project_id, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time, status')
    .eq('organization_id', organizationId)
    .or(`and(rigdaydate.gte.${fromDate},rigdaydate.lte.${toDate}),and(eventdate.gte.${fromDate},eventdate.lte.${toDate}),and(rigdowndate.gte.${fromDate},rigdowndate.lte.${toDate})`)

  if (bookErr) {
    console.error('[overview-calendar] booking fallback failed:', bookErr)
  }

  // ── 3) Large projects in window ────────────────────────────────────────
  const { data: projects, error: lpErr } = await supabase
    .from('large_projects')
    .select('id, name, address, start_date, event_date, end_date, status')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)

  if (lpErr) {
    console.error('[overview-calendar] large project fallback failed:', lpErr)
  }

  const synthetic: any[] = []
  const phaseDefaults: Record<string, [string, string]> = {
    rig: ['08:00:00', '12:00:00'],
    event: ['08:00:00', '17:00:00'],
    rigDown: ['08:00:00', '12:00:00'],
  }
  const buildIso = (date: string, t: string | null | undefined, fallback: string) => {
    const time = (t && /^\d{2}:\d{2}/.test(t)) ? `${t}${t.length === 5 ? ':00' : ''}` : fallback
    return `${date}T${time}`
  }
  const pushSynthetic = (
    bookingId: string | null,
    bookingNumber: string | null,
    title: string,
    address: string | null,
    eventType: 'rig' | 'event' | 'rigDown',
    date: string,
    startT: string | null,
    endT: string | null,
    largeProjectId: string | null = null,
  ) => {
    if (!date || date < fromDate || date > toDate) return
    const key = `${bookingId || largeProjectId || ''}|${eventType}|${date}`
    if (seen.has(key)) return
    const [defS, defE] = phaseDefaults[eventType]
    const idSuffix = bookingId || (largeProjectId ? `lp-${largeProjectId}` : 'lp')
    synthetic.push({
      id: `synthetic-${idSuffix}-${eventType}-${date}`,
      title,
      start_time: buildIso(date, startT, defS),
      end_time: buildIso(date, endT, defE),
      event_type: eventType,
      resource_id: null,
      booking_id: bookingId,
      large_project_id: largeProjectId,
      booking_number: bookingNumber,
      delivery_address: address,
      source_date: date,
      _synthetic: true,
    })
    seen.add(key)
  }

  for (const b of bookings || []) {
    if (b.status && String(b.status).toUpperCase() === 'OFFER') continue
    const title = b.client || 'Bokning'
    if (b.rigdaydate) pushSynthetic(b.id, b.booking_number, `${title} - rig`, b.deliveryaddress, 'rig', b.rigdaydate, b.rig_start_time, b.rig_end_time)
    if (b.rigdowndate) pushSynthetic(b.id, b.booking_number, `${title} - rigDown`, b.deliveryaddress, 'rigDown', b.rigdowndate, b.rigdown_start_time, b.rigdown_end_time)
  }

  for (const p of projects || []) {
    const title = p.name || 'Stort projekt'
    for (const d of p.start_date || []) pushSynthetic(null, null, `${title} - rig`, p.address, 'rig', d, null, null, p.id)
    for (const d of p.end_date || []) pushSynthetic(null, null, `${title} - rigDown`, p.address, 'rigDown', d, null, null, p.id)
  }

  const merged = [...real, ...synthetic].sort((a, b) =>
    String(a.start_time).localeCompare(String(b.start_time))
  )

  return new Response(
    JSON.stringify({
      events: merged,
      from: fromIso,
      to: toIso,
      meta: { real: real.length, synthetic: synthetic.length },
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── get_overview_assignments ──
// Mirrors the personalkalender source-of-truth: same logic as
// src/services/staffCalendarService.ts → deriveStaffEvents.
//
// Inputs:
//   - booking_staff_assignments (per-booking, per-date)
//   - large_project_staff (project-wide visibility)
//   - bookings + large_projects + large_project_bookings (timing/labels)
//   - calendar_events (ENRICHMENT only — never the sole source)
//
// One row per staff × target × date × phase. Mobile Overview consumes the
// existing fields (staff_id, staff_name, role, assignment_date, booking_id,
// team_id, client) plus the richer target_* / planned_* fields.
async function handleGetOverviewAssignments(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerIsPlanner(supabase, callerUserId))) return plannerForbidden()

  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const defaultTo = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fromDate = (typeof data?.from === 'string' && data.from) || defaultFrom
  const toDate = (typeof data?.to === 'string' && data.to) || defaultTo

  // ── 1) BSA in window ────────────────────────────────────────────────
  const { data: bsaRows, error: bsaErr } = await supabase
    .from('booking_staff_assignments')
    .select('id, booking_id, staff_id, team_id, assignment_date, role')
    .eq('organization_id', organizationId)
    .gte('assignment_date', fromDate)
    .lte('assignment_date', toDate)
  if (bsaErr) {
    console.error('[overview-assignments] BSA fetch failed:', bsaErr)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch assignments' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const bsa = bsaRows || []

  // ── 2) Large project memberships (project-wide visibility) ──────────
  const { data: lpsRows } = await supabase
    .from('large_project_staff')
    .select('staff_id, large_project_id, role')
    .eq('organization_id', organizationId)
  const lps = lpsRows || []

  // ── 3) Hydrate staff ────────────────────────────────────────────────
  const staffIds = [...new Set([
    ...bsa.map((r: any) => r.staff_id),
    ...lps.map((r: any) => r.staff_id),
  ].filter(Boolean))]
  const staffMap = new Map<string, { id: string; name: string; role: string | null }>()
  if (staffIds.length > 0) {
    const { data: staffRows } = await supabase
      .from('staff_members')
      .select('id, name, role')
      .in('id', staffIds)
      .eq('organization_id', organizationId)
    for (const s of staffRows || []) staffMap.set(s.id, s)
  }

  // ── 4) Hydrate bookings referenced by BSA ───────────────────────────
  const bookingIds = [...new Set(bsa.map((r: any) => r.booking_id).filter(Boolean))]
  const bookings = new Map<string, any>()
  if (bookingIds.length > 0) {
    const { data: bookRows } = await supabase
      .from('bookings')
      .select('id, client, booking_number, deliveryaddress, large_project_id, status, rigdaydate, eventdate, rigdowndate, rig_start_time, rig_end_time, event_start_time, event_end_time, rigdown_start_time, rigdown_end_time')
      .in('id', bookingIds)
      .eq('organization_id', organizationId)
    for (const b of bookRows || []) bookings.set(b.id, b)
  }

  // ── 5) Hydrate large projects referenced via LPS or via bookings ────
  const lpIdsFromBookings = [...bookings.values()].map((b: any) => b.large_project_id).filter(Boolean)
  const lpIds = [...new Set([...lps.map((r: any) => r.large_project_id), ...lpIdsFromBookings])]
  const projects = new Map<string, any>()
  const lpBookings: Array<{ large_project_id: string; booking_id: string }> = []
  if (lpIds.length > 0) {
    const [{ data: lpRows }, { data: lpbRows }] = await Promise.all([
      supabase
        .from('large_projects')
        .select('id, name, address, start_date, event_date, end_date, status')
        .in('id', lpIds)
        .eq('organization_id', organizationId)
        .is('deleted_at', null),
      supabase
        .from('large_project_bookings')
        .select('large_project_id, booking_id')
        .in('large_project_id', lpIds)
        .eq('organization_id', organizationId),
    ])
    for (const p of lpRows || []) projects.set(p.id, p)
    for (const r of lpbRows || []) lpBookings.push(r)
  }

  // ── 6) Calendar events for enrichment ───────────────────────────────
  const enrichBookingIds = [...new Set([...bookingIds, ...lpBookings.map(r => r.booking_id)])]
  const ceByBooking = new Map<string, any[]>()
  if (enrichBookingIds.length > 0) {
    const { data: ceRows } = await supabase
      .from('calendar_events')
      .select('id, booking_id, start_time, end_time, event_type, resource_id, source_date, delivery_address, booking_number')
      .in('booking_id', enrichBookingIds)
      .eq('organization_id', organizationId)
      .gte('start_time', `${fromDate}T00:00:00`)
      .lt('start_time', `${toDate}T23:59:59`)
    for (const ce of ceRows || []) {
      if (!ce.booking_id) continue
      const arr = ceByBooking.get(ce.booking_id) || []
      arr.push(ce)
      ceByBooking.set(ce.booking_id, arr)
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────
  const PHASE_FROM_TYPE: Record<string, 'rig' | 'event' | 'rigDown' | undefined> = {
    rig: 'rig', event: 'event', rigDown: 'rigDown', rigdown: 'rigDown',
  }
  const DEFAULT_HOURS: Record<string, [string, string]> = {
    rig: ['08:00:00', '12:00:00'],
    event: ['08:00:00', '17:00:00'],
    rigDown: ['08:00:00', '12:00:00'],
  }
  const isoTime = (v: any): string | null => {
    if (!v) return null
    const s = String(v)
    // "08:30" / "08:30:00" / full ISO → time-of-day
    const m = s.match(/T(\d{2}:\d{2}(?::\d{2})?)/) || s.match(/^(\d{2}:\d{2}(?::\d{2})?)$/)
    if (!m) return null
    return m[1].length === 5 ? `${m[1]}:00` : m[1]
  }
  const buildTimes = (date: string, phase: string, s: any, e: any) => {
    const [defS, defE] = DEFAULT_HOURS[phase] || DEFAULT_HOURS.event
    const st = isoTime(s) || defS
    const et = isoTime(e) || defE
    return { start: `${date}T${st}`, end: `${date}T${et}` }
  }
  const phasesForBookingDate = (b: any, date: string): Array<'rig' | 'event' | 'rigDown'> => {
    const out: Array<'rig' | 'event' | 'rigDown'> = []
    if (b.rigdaydate === date) out.push('rig')
    if (b.eventdate === date) out.push('event')
    if (b.rigdowndate === date) out.push('rigDown')
    return out
  }
  const findCE = (bookingId: string, phase: string, date: string) => {
    const list = ceByBooking.get(bookingId) || []
    return list.find((ce: any) => {
      const p = PHASE_FROM_TYPE[ce.event_type || '']
      const d = ce.source_date || (ce.start_time || '').slice(0, 10)
      return p === phase && d === date
    })
  }

  // ── 7) Derive ───────────────────────────────────────────────────────
  type Out = {
    id: string;
    staff_id: string;
    staff_name: string;
    role: string;
    assignment_date: string;
    target_type: 'booking' | 'large_project';
    target_id: string;
    target_name: string;
    booking_id: string | null;
    booking_number: string | null;
    booking_title: string | null;
    client: string | null;
    planned_start: string;
    planned_end: string;
    address: string | null;
    team_id: string | null;
    status: string | null;
    phase: 'rig' | 'event' | 'rigDown';
  }
  const seen = new Map<string, Out>()
  const upsert = (row: Out) => {
    const existing = seen.get(row.id)
    if (!existing) { seen.set(row.id, row); return }
    if (row.planned_start < existing.planned_start) existing.planned_start = row.planned_start
    if (row.planned_end > existing.planned_end) existing.planned_end = row.planned_end
  }

  // 7a) BSA → per phase
  for (const a of bsa) {
    const booking = bookings.get(a.booking_id)
    if (!booking) continue
    const staff = staffMap.get(a.staff_id)
    const lpId = booking.large_project_id
    const phases = phasesForBookingDate(booking, a.assignment_date)
    for (const phase of phases) {
      const ce = findCE(booking.id, phase, a.assignment_date)
      const times = ce
        ? { start: ce.start_time, end: ce.end_time }
        : buildTimes(
            a.assignment_date,
            phase,
            phase === 'rig' ? booking.rig_start_time : phase === 'event' ? booking.event_start_time : booking.rigdown_start_time,
            phase === 'rig' ? booking.rig_end_time : phase === 'event' ? booking.event_end_time : booking.rigdown_end_time,
          )
      const targetIsLP = !!lpId && projects.has(lpId)
      const project = targetIsLP ? projects.get(lpId) : null
      const targetId = targetIsLP ? lpId : booking.id
      const targetName = targetIsLP ? (project?.name || 'Stort projekt') : (booking.client || 'Bokning')
      const id = `bsa-${a.staff_id}-${targetIsLP ? 'lp-' + lpId : 'b-' + booking.id}-${a.assignment_date}-${phase}`
      upsert({
        id,
        staff_id: a.staff_id,
        staff_name: staff?.name || '',
        role: a.role || staff?.role || '',
        assignment_date: a.assignment_date,
        target_type: targetIsLP ? 'large_project' : 'booking',
        target_id: targetId,
        target_name: targetName,
        booking_id: booking.id,
        booking_number: booking.booking_number || null,
        booking_title: booking.client || null,
        client: booking.client || null,
        planned_start: times.start,
        planned_end: times.end,
        address: (ce?.delivery_address) || booking.deliveryaddress || (project?.address ?? null),
        team_id: ce?.resource_id || a.team_id || null,
        status: targetIsLP ? (project?.status ?? null) : (booking.status ?? null),
        phase,
      })
    }
  }

  // 7b) large_project_staff → project-wide visibility
  const bookingsByLP = new Map<string, string[]>()
  for (const r of lpBookings) {
    const arr = bookingsByLP.get(r.large_project_id) || []
    arr.push(r.booking_id)
    bookingsByLP.set(r.large_project_id, arr)
  }
  for (const m of lps) {
    const project = projects.get(m.large_project_id)
    if (!project) continue
    const staff = staffMap.get(m.staff_id)
    const phaseDates: Array<{ date: string; phase: 'rig' | 'event' | 'rigDown' }> = [
      ...((project.start_date || []).map((d: string) => ({ date: d, phase: 'rig' as const }))),
      ...((project.end_date || []).map((d: string) => ({ date: d, phase: 'rigDown' as const }))),
    ].filter(p => p.date && p.date >= fromDate && p.date <= toDate)

    const linked = bookingsByLP.get(m.large_project_id) || []
    for (const { date, phase } of phaseDates) {
      let ce: any
      let bookingHint: string | null = linked[0] || null
      for (const bid of linked) {
        const c = findCE(bid, phase, date)
        if (c) { ce = c; bookingHint = bid; break }
      }
      const times = ce ? { start: ce.start_time, end: ce.end_time } : buildTimes(date, phase, null, null)
      const id = `lps-${m.staff_id}-lp-${m.large_project_id}-${date}-${phase}`
      upsert({
        id,
        staff_id: m.staff_id,
        staff_name: staff?.name || '',
        role: m.role || staff?.role || '',
        assignment_date: date,
        target_type: 'large_project',
        target_id: m.large_project_id,
        target_name: project.name || 'Stort projekt',
        booking_id: bookingHint,
        booking_number: ce?.booking_number || null,
        booking_title: project.name || null,
        client: project.name || null,
        planned_start: times.start,
        planned_end: times.end,
        address: ce?.delivery_address || project.address || null,
        team_id: ce?.resource_id || null,
        status: project.status || null,
        phase,
      })
    }
  }

  const enriched = [...seen.values()].sort((a, b) =>
    a.assignment_date.localeCompare(b.assignment_date) || a.planned_start.localeCompare(b.planned_start)
  )

  return new Response(
    JSON.stringify({ assignments: enriched, from: fromDate, to: toDate }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// ── get_overview_threads ──
// Cross-project unified inbox for planners: every active project chat
// (job_messages aggregated per booking) the org has touched in the last 30
// days, regardless of whether the planner is assigned to it.
async function handleGetOverviewThreads(
  supabase: any,
  callerUserId: string | null,
  organizationId: string,
) {
  if (!(await callerIsPlanner(supabase, callerUserId))) return plannerForbidden()

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: messages, error: msgErr } = await supabase
    .from('job_messages')
    .select('id, booking_id, content, created_at, sender_name, read_by')
    .eq('organization_id', organizationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000)

  if (msgErr) {
    console.error('[overview-threads] message fetch failed:', msgErr)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch threads' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const byBooking = new Map<string, { last: any; unread: number; total: number }>()
  for (const m of messages || []) {
    if (!m.booking_id) continue
    const readBy = Array.isArray(m.read_by) ? m.read_by : []
    const isUnread = !readBy.includes(callerUserId!)
    const existing = byBooking.get(m.booking_id)
    if (!existing) {
      byBooking.set(m.booking_id, { last: m, unread: isUnread ? 1 : 0, total: 1 })
    } else {
      existing.total += 1
      if (isUnread) existing.unread += 1
      // messages are pre-sorted desc → first one we saw is "last"
    }
  }

  const bookingIds = [...byBooking.keys()]
  const bookingsMap: Record<string, { id: string; client: string; booking_number: string | null }> = {}
  if (bookingIds.length > 0) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, client, booking_number')
      .in('id', bookingIds)
      .eq('organization_id', organizationId)
    for (const b of bookings || []) bookingsMap[b.id] = b
  }

  const threads = bookingIds
    .map((id) => {
      const agg = byBooking.get(id)!
      const bk = bookingsMap[id]
      return {
        booking_id: id,
        client: bk?.client || 'Okänd kund',
        booking_number: bk?.booking_number || null,
        last_message: agg.last.content,
        last_message_at: agg.last.created_at,
        last_sender: agg.last.sender_name,
        unread_count: agg.unread,
        total_messages: agg.total,
      }
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))

  return new Response(
    JSON.stringify({ threads }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ─────────────────────────────────────────────────────────────────────
// Admin day-review actions (set workday review status, mark gap as
// break or travel). All actions are admin/projekt-only and operate on
// behalf of a target staff member within the same organization.
// ─────────────────────────────────────────────────────────────────────

/**
 * admin_set_workday_review — set review_status (+ optional note) for a
 * workday. Used by Admin Day Review panel for "approve / needs_review /
 * returned to staff".
 */
async function handleAdminSetWorkdayReview(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { workday_id, status, note } = data || {}
  const ALLOWED = ['approved', 'needs_review', 'returned', 'ready', 'draft']
  if (!workday_id || !ALLOWED.includes(status)) {
    return new Response(
      JSON.stringify({ error: 'workday_id and a valid status are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const update: Record<string, any> = {
    review_status: status,
    review_computed_at: new Date().toISOString(),
  }
  if (typeof note === 'string') update.review_note = note.slice(0, 2000)

  const { data: row, error } = await supabase
    .from('workdays')
    .update(update)
    .eq('id', workday_id)
    .eq('organization_id', organizationId)
    .select('id, review_status, review_note, review_computed_at')
    .single()

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  return new Response(
    JSON.stringify({ workday: row }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * admin_mark_gap_break — record an admin decision that an unallocated
 * gap in the staff timeline was a break. Stored as a workday_flag
 * (flag_type='gap_marked_break') so it shows up in audit/history without
 * mutating the time_reports themselves.
 */
async function handleAdminMarkGapBreak(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { target_staff_id, flag_date, start_time, end_time, note } = data || {}
  if (!target_staff_id || !flag_date || !start_time || !end_time) {
    return new Response(
      JSON.stringify({ error: 'target_staff_id, flag_date, start_time, end_time required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const startMs = new Date(start_time).getTime()
  const endMs = new Date(end_time).getTime()
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60000))

  const { data: row, error } = await supabase
    .from('workday_flags')
    .insert({
      organization_id: organizationId,
      staff_id: target_staff_id,
      flag_type: 'gap_marked_break',
      severity: 'info',
      flag_date,
      title: `Lucka markerad som rast (${minutes} min)`,
      description: note || null,
      needs_user_input: false,
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_source: 'admin',
      resolution_note: note || null,
      resolved_by: callerUserId,
      context: { start_time, end_time, minutes },
    })
    .select('id, flag_type, flag_date, context')
    .single()

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  return new Response(
    JSON.stringify({ flag: row }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * admin_mark_gap_travel — wrap handleCreateTravelFromGap so admin can
 * convert a gap to travel time on behalf of the target staff. Reuses
 * the central idempotent travel-from-gap pipeline (rules, dedupe,
 * needs_review thresholds).
 */
async function handleAdminMarkGapTravel(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const { target_staff_id, ...rest } = data || {}
  if (!target_staff_id) {
    return new Response(
      JSON.stringify({ error: 'target_staff_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  return await handleCreateTravelFromGap(supabase, target_staff_id, rest, organizationId)
}

/**
 * admin_approve_day — godkänner en hel arbetsdag för en personal.
 *
 * Säkerhetskontroller (server-side, oavsett UI):
 *   - workday måste finnas och vara stängd (ended_at != null)
 *   - inga öppna time_reports (end_time IS NULL) får finnas på dagen
 *   - inga öppna travel_time_logs (end_time IS NULL) får finnas på dagen
 *   - om kritiska anomalies → kräv override_reason från admin
 *
 * Effekt:
 *   - sätt workdays.review_status='approved', approved_at, approved_by
 *   - cascade: sätt approved=true på alla time_reports och travel_time_logs
 *     som ligger inom workday-fönstret OCH inte redan är approved.
 */
async function handleAdminApproveDay(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { workday_id, override_reason, force } = data || {}
  if (!workday_id) {
    return new Response(
      JSON.stringify({ error: 'workday_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Hämta workday
  const { data: wd, error: wdErr } = await supabase
    .from('workdays')
    .select('id, staff_id, started_at, ended_at, organization_id')
    .eq('id', workday_id)
    .eq('organization_id', organizationId)
    .single()

  if (wdErr || !wd) {
    return new Response(
      JSON.stringify({ error: 'workday_not_found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  if (!wd.ended_at) {
    return new Response(
      JSON.stringify({ error: 'workday_open', detail: 'Arbetsdagen är fortfarande öppen.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const dayDate = new Date(wd.started_at).toISOString().slice(0, 10)
  const startIso = wd.started_at
  const endIso = wd.ended_at

  // Hård kontroll: öppna time_reports / travel_time_logs på dagen
  const [{ data: openReports }, { data: openTravel }] = await Promise.all([
    supabase
      .from('time_reports')
      .select('id')
      .eq('staff_id', wd.staff_id)
      .eq('organization_id', organizationId)
      .eq('report_date', dayDate)
      .is('end_time', null)
      .limit(1),
    supabase
      .from('travel_time_logs')
      .select('id')
      .eq('staff_id', wd.staff_id)
      .eq('organization_id', organizationId)
      .is('end_time', null)
      .gte('start_time', startIso)
      .lte('start_time', endIso)
      .limit(1),
  ])

  if ((openReports?.length || 0) > 0 || (openTravel?.length || 0) > 0) {
    return new Response(
      JSON.stringify({ error: 'open_timer', detail: 'En aktivitet eller resa är fortfarande igång.' }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Pending assistant_events?
  const { data: pendingEvents } = await supabase
    .from('assistant_events')
    .select('id')
    .eq('staff_id', wd.staff_id)
    .eq('organization_id', organizationId)
    .eq('resolution_status', 'pending')
    .gte('happened_at', startIso)
    .lte('happened_at', endIso)
    .limit(1)

  if ((pendingEvents?.length || 0) > 0 && !force) {
    return new Response(
      JSON.stringify({
        error: 'pending_assistant_events',
        detail: 'Det finns assistent-händelser som inte är behandlade.',
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Om force=true men ingen reason → blockera
  if (force && (!override_reason || String(override_reason).trim().length < 3)) {
    return new Response(
      JSON.stringify({ error: 'override_reason_required', detail: 'Ange en kommentar för override.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const nowIso = new Date().toISOString()

  // 1) Markera workday som approved
  const { data: approvedWd, error: approveErr } = await supabase
    .from('workdays')
    .update({
      review_status: 'approved',
      review_computed_at: nowIso,
      approved_at: nowIso,
      approved_by: callerUserId,
      approval_override_reason: force ? String(override_reason).slice(0, 2000) : null,
    })
    .eq('id', workday_id)
    .eq('organization_id', organizationId)
    .select('id, staff_id, started_at, ended_at, review_status, approved_at, approved_by, approval_override_reason')
    .single()

  if (approveErr) {
    return new Response(
      JSON.stringify({ error: approveErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // 2) Cascade — godkänn alla time_reports för dagen som inte redan är approved
  const { data: cascadedReports } = await supabase
    .from('time_reports')
    .update({ approved: true, updated_at: nowIso })
    .eq('staff_id', wd.staff_id)
    .eq('organization_id', organizationId)
    .eq('report_date', dayDate)
    .eq('approved', false)
    .not('end_time', 'is', null)
    .select('id')

  // 3) Cascade — travel_time_logs (har egen approved-kolumn om den finns)
  let cascadedTravelCount = 0
  try {
    const { data: cascadedTravel } = await supabase
      .from('travel_time_logs')
      .update({ approved: true, updated_at: nowIso })
      .eq('staff_id', wd.staff_id)
      .eq('organization_id', organizationId)
      .gte('start_time', startIso)
      .lte('start_time', endIso)
      .eq('approved', false)
      .select('id')
    cascadedTravelCount = cascadedTravel?.length || 0
  } catch (_e) {
    // travel_time_logs kanske saknar approved-kolumn — ignorera
    cascadedTravelCount = 0
  }

  return new Response(
    JSON.stringify({
      workday: approvedWd,
      cascaded_time_reports: cascadedReports?.length || 0,
      cascaded_travel_logs: cascadedTravelCount,
      override: !!force,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * admin_unapprove_day — backa godkännande av en dag (failsafe om något var fel).
 * Sätter workday tillbaka till 'needs_review' och rensar approved_at/by.
 * Time_reports och travel_time_logs förblir approved (måste backas individuellt
 * via befintligt edit-flöde) — avsiktligt försiktigt.
 */
async function handleAdminUnapproveDay(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const { workday_id, note } = data || {}
  if (!workday_id) {
    return new Response(
      JSON.stringify({ error: 'workday_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  const { data: row, error } = await supabase
    .from('workdays')
    .update({
      review_status: 'needs_review',
      review_computed_at: new Date().toISOString(),
      review_note: typeof note === 'string' ? note.slice(0, 2000) : null,
      approved_at: null,
      approved_by: null,
      approval_override_reason: null,
    })
    .eq('id', workday_id)
    .eq('organization_id', organizationId)
    .select('id, review_status, approved_at, approved_by')
    .single()

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
  return new Response(
    JSON.stringify({ workday: row }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * admin_create_workday_from_planned — admin escalation path for the
 * "planned time without signal" case (Prompt 6).
 *
 * Triggered from ActualDayPanel "Föreslagna korrigeringar" when staff was
 * scheduled (e.g. 08:00) but no GPS/timer signal arrived until much later.
 *
 * Creates (or backdates) the workday from a chosen start time and persists
 * audit metadata so it is OBVIOUS the period before first GPS comes from
 * planning/confirmation, NOT from GPS evidence.
 *
 * Modes:
 *   - mode='planned'      → start = plannedStartIso
 *                            source='admin_from_assignment_no_signal'
 *   - mode='first_signal' → start = firstSignalIso (regular evidence)
 *                            source='admin_from_first_signal'
 *   - mode='custom'       → start = customStartIso
 *                            source='admin_custom_start_no_signal'
 *   - mode='absence'      → no workday created; just a workday_flag
 *                            (planned_time_without_signal, resolved=true)
 */
async function handleAdminCreateWorkdayFromPlanned(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(
      JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const {
    target_staff_id,
    flag_date,
    mode,
    planned_start_iso,
    first_signal_iso,
    custom_start_iso,
    assignment_id,
    note,
  } = data || {}

  const ALLOWED_MODES = ['planned', 'first_signal', 'custom', 'absence']
  if (!target_staff_id || !flag_date || !ALLOWED_MODES.includes(mode)) {
    return new Response(
      JSON.stringify({ error: 'target_staff_id, flag_date, valid mode required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  // Common context written into both workdays.metadata and workday_flags.context
  const plannedMs = planned_start_iso ? new Date(planned_start_iso).getTime() : null
  const firstMs = first_signal_iso ? new Date(first_signal_iso).getTime() : null
  const noSignalGapMin = (plannedMs != null && firstMs != null)
    ? Math.max(0, Math.round((firstMs - plannedMs) / 60_000))
    : null

  // ── Mode: absence — no workday, just a resolved flag.
  if (mode === 'absence') {
    const { data: flag, error: fErr } = await supabase
      .from('workday_flags')
      .insert({
        organization_id: organizationId,
        staff_id: target_staff_id,
        flag_type: 'planned_time_without_signal',
        severity: 'info',
        flag_date,
        title: 'Markerad som frånvaro av admin (planerad tid utan signal)',
        description: note || null,
        needs_user_input: false,
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolution_source: 'admin',
        resolution_note: note || null,
        resolved_by: callerUserId,
        context: {
          source: 'admin_marked_absence_no_signal',
          assignment_id: assignment_id || null,
          planned_start: planned_start_iso || null,
          first_signal_at: first_signal_iso || null,
          no_signal_gap_minutes: noSignalGapMin,
          confirmation_required: false,
        },
      })
      .select('id, flag_type, flag_date')
      .single()
    if (fErr) {
      return new Response(JSON.stringify({ error: fErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ created: 'flag', flag, workday: null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ── Mode: workday creation/backdating.
  let startedAtIso: string | null = null
  let source: string = ''
  if (mode === 'planned') {
    if (!planned_start_iso) {
      return new Response(JSON.stringify({ error: 'planned_start_iso required for mode=planned' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    startedAtIso = planned_start_iso
    source = 'admin_from_assignment_no_signal'
  } else if (mode === 'first_signal') {
    if (!first_signal_iso) {
      return new Response(JSON.stringify({ error: 'first_signal_iso required for mode=first_signal' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    startedAtIso = first_signal_iso
    source = 'admin_from_first_signal'
  } else if (mode === 'custom') {
    if (!custom_start_iso) {
      return new Response(JSON.stringify({ error: 'custom_start_iso required for mode=custom' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    startedAtIso = custom_start_iso
    source = 'admin_custom_start_no_signal'
  }

  if (!startedAtIso) {
    return new Response(JSON.stringify({ error: 'could not derive startedAtIso' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const metadata = {
    source,
    assignment_id: assignment_id || null,
    planned_start: planned_start_iso || null,
    first_signal_at: first_signal_iso || null,
    no_signal_gap_minutes: noSignalGapMin,
    confirmation_required: mode === 'planned' || mode === 'custom',
    created_by_admin: true,
    admin_user_id: callerUserId,
    admin_note: note || null,
  }

  // Find existing workday on this date for the target staff (if any).
  const dayStart = `${flag_date}T00:00:00.000Z`
  const dayEnd = `${flag_date}T23:59:59.999Z`
  const { data: existing } = await supabase
    .from('workdays')
    .select('id, started_at, ended_at, metadata')
    .eq('staff_id', target_staff_id)
    .eq('organization_id', organizationId)
    .gte('started_at', dayStart)
    .lte('started_at', dayEnd)
    .order('started_at', { ascending: true })
    .limit(1)

  let workdayId: string | null = null
  let createdNew = false

  if (existing && existing.length > 0) {
    const wd = existing[0]
    workdayId = wd.id
    const mergedMeta = { ...(wd.metadata ?? {}), admin_backdated: { ...metadata, previous_started_at: wd.started_at } }
    const { error: upErr } = await supabase
      .from('workdays')
      .update({
        started_at: startedAtIso,
        metadata: mergedMeta,
        review_status: 'needs_review',
        review_note: `Admin justerade arbetsdagsstart (${source}). ${note || ''}`.slice(0, 2000),
      })
      .eq('id', wd.id)
      .eq('organization_id', organizationId)
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } else {
    const { data: ins, error: insErr } = await supabase
      .from('workdays')
      .insert({
        staff_id: target_staff_id,
        organization_id: organizationId,
        started_at: startedAtIso,
        started_by: 'admin',
        notes: `Admin skapade arbetsdag (${source}). ${note || ''}`.slice(0, 2000),
        metadata,
        review_status: 'needs_review',
      })
      .select('id')
      .single()
    if (insErr) {
      return new Response(JSON.stringify({ error: insErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    workdayId = ins.id
    createdNew = true
  }

  // Always log a resolved workday_flag so admins can see the audit trail.
  await supabase
    .from('workday_flags')
    .insert({
      organization_id: organizationId,
      staff_id: target_staff_id,
      flag_type: 'planned_time_without_signal',
      severity: 'info',
      flag_date,
      title: createdNew
        ? `Arbetsdag skapad av admin (${source})`
        : `Arbetsdagsstart justerad av admin (${source})`,
      description: note || null,
      needs_user_input: false,
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolution_source: 'admin',
      resolution_note: note || null,
      resolved_by: callerUserId,
      context: { ...metadata, workday_id: workdayId, mode, started_at: startedAtIso },
    })

  return new Response(
    JSON.stringify({
      created: createdNew ? 'workday' : 'workday_updated',
      workday_id: workdayId,
      started_at: startedAtIso,
      source,
      metadata,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

/**
 * admin_repair_workday_from_evidence — skapar workday från starka arbetsbevis
 * (assignment + GPS, timer/LTE finns, ≥2 arbetsplatser, server-engine confidence).
 * UI:n beräknar proposed_start_iso via computeStrongWorkIndicators.
 */
async function handleAdminRepairWorkdayFromEvidence(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
    return new Response(JSON.stringify({ error: 'Forbidden: admin or projekt role required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const { target_staff_id, flag_date, proposed_start_iso, proposed_end_iso, reason_codes } = data || {}
  if (!target_staff_id || !flag_date || !proposed_start_iso) {
    return new Response(JSON.stringify({ error: 'target_staff_id, flag_date, proposed_start_iso required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const dayStart = `${flag_date}T00:00:00.000Z`
  const dayEnd = `${flag_date}T23:59:59.999Z`
  const { data: existing } = await supabase
    .from('workdays')
    .select('id, started_at, metadata')
    .eq('staff_id', target_staff_id)
    .eq('organization_id', organizationId)
    .gte('started_at', dayStart).lte('started_at', dayEnd)
    .order('started_at', { ascending: true }).limit(1)

  const metadata = {
    auto_started: true,
    auto_start_source: 'server_background_gps_repair',
    confidence: 'high',
    reason_codes: Array.isArray(reason_codes) ? reason_codes : [],
    repaired_by_admin: true,
    admin_user_id: callerUserId,
    proposed_end_iso: proposed_end_iso || null,
  }

  if (existing && existing.length > 0) {
    const wd = existing[0]
    const merged = { ...(wd.metadata ?? {}), repair: { ...metadata, previous_started_at: wd.started_at } }
    const { error } = await supabase
      .from('workdays')
      .update({ started_at: proposed_start_iso, metadata: merged, review_status: 'needs_review' })
      .eq('id', wd.id).eq('organization_id', organizationId)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ created: 'workday_updated', workday_id: wd.id, started_at: proposed_start_iso }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: ins, error: insErr } = await supabase
    .from('workdays')
    .insert({
      staff_id: target_staff_id,
      organization_id: organizationId,
      started_at: proposed_start_iso,
      ended_at: proposed_end_iso || null,
      started_by: 'server_auto_start_repair',
      notes: 'Auto-repair från starka arbetsbevis (admin)',
      metadata,
      review_status: 'needs_review',
    })
    .select('id').single()
  if (insErr) {
    return new Response(JSON.stringify({ error: insErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ created: 'workday', workday_id: ins.id, started_at: proposed_start_iso, metadata }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}


/**
 * auto_repair_missing_workdays_from_evidence — cron-/system-säker auto-repair.
 *
 * Hittar dagar (default: igår + idag, eller given `dates[]` / `from`/`to`) där
 * det finns LTE eller time_report men ingen workday för samma staff/org/dag.
 *
 * High-confidence regel:
 *   - timer_or_time_report_exists   (alltid sant här — vi kräver LTE/TR)
 *   OCH (
 *      gps_on_known_work_site       (LTE/TR är knuten till booking/large_project/location
 *                                     ELLER en GPS-LTE finns för dagen)
 *      ELLER
 *      server_engine_confident      (auto_started LTE med metadata.confidence ∈ medium/high)
 *   )
 *
 * Planering utan GPS/timer auto-repareras INTE.
 *
 * Skapar workday med:
 *   started_at = tidigaste arbetsrelevanta start (LTE.entered_at / TR.start)
 *   source     = 'auto_repair_from_timer_or_gps'
 *   metadata   = { auto_started, confidence:'high', reason_codes, evidence_summary }
 *
 * Idempotent: skipps om workday redan finns för dagen (start..end).
 *
 * Caller:
 *   - Admin/projekt-roll (UI-knapp)
 *   - Cron: pg_cron + pg_net med x-cron-secret header (matchar CRON_SECRET env)
 *
 * Optional payload:
 *   { target_staff_id?: string, dates?: string[], from?: string, to?: string, dry_run?: boolean }
 */
async function handleAutoRepairMissingWorkdaysFromEvidence(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  // Auth: admin/projekt OR cron secret header (handled in caller via header check below).
  // Since we don't have access to req here, we rely on role check. Cron path uses
  // service-role JWT which has no user_id → fall through to role check (deny),
  // so cron must pass `cron_secret` in body.
  const cronSecret = Deno.env.get('CRON_SECRET') || ''
  const providedSecret: string | undefined = data?.cron_secret
  const isCron = !!(cronSecret && providedSecret && providedSecret === cronSecret)
  if (!isCron) {
    if (!(await callerHasAdminOrProjektRole(supabase, callerUserId))) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin/projekt role or cron_secret required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  const dryRun = data?.dry_run === true
  const targetStaffId: string | undefined = data?.target_staff_id

  // Resolve date window — default to last 2 days (today + yesterday in UTC).
  let dates: string[] = []
  if (Array.isArray(data?.dates) && data.dates.length > 0) {
    dates = data.dates.filter((d: any) => typeof d === 'string')
  } else {
    const from: string | undefined = data?.from
    const to: string | undefined = data?.to
    const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(Date.now() - 24 * 3600 * 1000)
    const end = to ? new Date(`${to}T00:00:00.000Z`) : new Date()
    for (let t = start.getTime(); t <= end.getTime(); t += 24 * 3600 * 1000) {
      dates.push(new Date(t).toISOString().slice(0, 10))
    }
  }

  type RepairResult = {
    staff_id: string
    date: string
    action: 'created' | 'skipped_existing_workday' | 'skipped_no_evidence' | 'skipped_low_confidence' | 'error'
    workday_id?: string
    started_at?: string
    reason_codes?: string[]
    error?: string
  }
  const results: RepairResult[] = []

  for (const date of dates) {
    const dayStart = `${date}T00:00:00.000Z`
    const dayEnd = `${date}T23:59:59.999Z`

    // Fetch LTE + time_reports for the day (optionally scoped to staff).
    let lteQ = supabase
      .from('location_time_entries')
      .select('id, staff_id, entered_at, exited_at, source, location_id, booking_id, large_project_id, metadata')
      .eq('organization_id', organizationId)
      .eq('entry_date', date)
    if (targetStaffId) lteQ = lteQ.eq('staff_id', targetStaffId)
    const { data: ltes, error: lteErr } = await lteQ
    if (lteErr) {
      console.error('[auto_repair] LTE query failed:', lteErr)
      continue
    }

    let trQ = supabase
      .from('time_reports')
      .select('id, staff_id, start_time, end_time, report_date, booking_id, large_project_id, location_id, is_subdivision')
      .eq('organization_id', organizationId)
      .eq('report_date', date)
      .eq('is_subdivision', false)
    if (targetStaffId) trQ = trQ.eq('staff_id', targetStaffId)
    const { data: trs, error: trErr } = await trQ
    if (trErr) {
      console.error('[auto_repair] TR query failed:', trErr)
      continue
    }

    // Group by staff_id
    const byStaff = new Map<string, { ltes: any[]; trs: any[] }>()
    for (const r of ltes ?? []) {
      const k = r.staff_id
      if (!byStaff.has(k)) byStaff.set(k, { ltes: [], trs: [] })
      byStaff.get(k)!.ltes.push(r)
    }
    for (const r of trs ?? []) {
      const k = r.staff_id
      if (!byStaff.has(k)) byStaff.set(k, { ltes: [], trs: [] })
      byStaff.get(k)!.trs.push(r)
    }

    for (const [staffId, ev] of byStaff) {
      // Skip if workday already exists for this staff/day.
      const { data: existingWd } = await supabase
        .from('workdays')
        .select('id')
        .eq('staff_id', staffId)
        .eq('organization_id', organizationId)
        .gte('started_at', dayStart).lte('started_at', dayEnd)
        .limit(1)
      if (existingWd && existingWd.length > 0) {
        results.push({ staff_id: staffId, date, action: 'skipped_existing_workday' })
        continue
      }

      // Evidence evaluation
      const reasonCodes = new Set<string>()
      reasonCodes.add('timer_or_time_report_exists')

      // gps_on_known_work_site:
      //   - any LTE has a known target (location/booking/large_project) OR source='gps'
      //   - any TR has a known target
      const hasKnownTargetLte = ev.ltes.some(
        (l) => !!(l.location_id || l.booking_id || l.large_project_id) || l.source === 'gps',
      )
      const hasKnownTargetTr = ev.trs.some((t) => !!(t.location_id || t.booking_id || t.large_project_id))
      if (hasKnownTargetLte || hasKnownTargetTr) reasonCodes.add('gps_on_known_work_site')

      // server_engine_confident: auto_started LTE with confidence medium/high
      const hasConfidentAutoStart = ev.ltes.some((l) => {
        const m = (l.metadata ?? {}) as any
        const conf = m?.confidence ?? m?.auto_start?.confidence
        const auto = m?.auto_started === true || m?.autoStarted === true
        return auto && (conf === 'medium' || conf === 'high')
      })
      if (hasConfidentAutoStart) reasonCodes.add('server_engine_confident')

      const highConfidence =
        reasonCodes.has('timer_or_time_report_exists') &&
        (reasonCodes.has('gps_on_known_work_site') || reasonCodes.has('server_engine_confident'))

      if (!highConfidence) {
        results.push({
          staff_id: staffId,
          date,
          action: 'skipped_low_confidence',
          reason_codes: Array.from(reasonCodes),
        })
        continue
      }

      // Earliest work-relevant start
      const candidates: string[] = []
      for (const l of ev.ltes) if (l.entered_at) candidates.push(l.entered_at)
      for (const t of ev.trs) {
        if (t.start_time && t.report_date) {
          candidates.push(new Date(`${t.report_date}T${t.start_time}`).toISOString())
        }
      }
      if (!candidates.length) {
        results.push({ staff_id: staffId, date, action: 'skipped_no_evidence' })
        continue
      }
      const startedAtIso = candidates.sort()[0]

      if (dryRun) {
        results.push({
          staff_id: staffId,
          date,
          action: 'created',
          started_at: startedAtIso,
          reason_codes: Array.from(reasonCodes),
        })
        continue
      }

      // Insert workday — use ensureOpenWorkdayForTimer for consistency.
      try {
        const wd = await ensureOpenWorkdayForTimer(supabase, {
          staff_id: staffId,
          organization_id: organizationId,
          start_at: startedAtIso,
          source: 'auto_repair_from_timer_or_gps',
          target: { kind: 'auto_repair', name: date },
        })
        if (!wd) {
          results.push({ staff_id: staffId, date, action: 'error', error: 'ensure_workday_returned_null' })
          continue
        }
        if (!wd.created) {
          results.push({
            staff_id: staffId,
            date,
            action: 'skipped_existing_workday',
            workday_id: wd.id,
            started_at: wd.started_at,
          })
          continue
        }
        // Enrich metadata with high-confidence evidence summary.
        await supabase
          .from('workdays')
          .update({
            metadata: {
              auto_started: true,
              auto_start_source: 'auto_repair_from_timer_or_gps',
              confidence: 'high',
              reason_codes: Array.from(reasonCodes),
              repaired_by: isCron ? 'cron' : 'admin',
              admin_user_id: isCron ? null : callerUserId,
              evidence_summary: {
                lte_count: ev.ltes.length,
                tr_count: ev.trs.length,
                has_known_target_lte: hasKnownTargetLte,
                has_known_target_tr: hasKnownTargetTr,
                has_confident_auto_start: hasConfidentAutoStart,
              },
              guarantee: 'no_timer_without_workday',
            },
            review_status: 'needs_review',
          })
          .eq('id', wd.id)
          .eq('organization_id', organizationId)
        results.push({
          staff_id: staffId,
          date,
          action: 'created',
          workday_id: wd.id,
          started_at: wd.started_at,
          reason_codes: Array.from(reasonCodes),
        })
      } catch (e: any) {
        console.error('[auto_repair] insert failed:', e)
        results.push({ staff_id: staffId, date, action: 'error', error: e?.message || String(e) })
      }
    }
  }

  const summary = {
    dates,
    total: results.length,
    created: results.filter(r => r.action === 'created').length,
    skipped_existing: results.filter(r => r.action === 'skipped_existing_workday').length,
    skipped_low_confidence: results.filter(r => r.action === 'skipped_low_confidence').length,
    errors: results.filter(r => r.action === 'error').length,
    dry_run: dryRun,
  }
  console.log('[auto_repair_missing_workdays_from_evidence] summary:', summary)
  return new Response(JSON.stringify({ summary, results }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}


// ============================================================================
import { buildDayReality, type RealitySessionInput, type KnownSite } from '../_shared/dayReality.ts'
import { fetchAllStaffLocationPings } from '../_shared/timeEngine/fetchAllStaffLocationPings.ts'

async function handleGetStaffDayReality(supabase: any, callerStaffId: string, data: any, organizationId: string) {
  const { staff_id, date } = data || {}
  if (!staff_id || !date) {
    return new Response(JSON.stringify({ error: 'staff_id and date are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Authorization: all authenticated users in the same organization may view any
  // staff member's day reality. Org isolation is enforced via the organizationId
  // filter in the queries below.

  const fromIso = `${date}T00:00:00.000Z`
  const toIso = `${date}T23:59:59.999Z`

  // Day-wide pings via canonical paginated reader (replaces .limit(5000)).
  const pingsFetch = await fetchAllStaffLocationPings({
    supabaseAdmin: supabase,
    organizationId,
    staffId: staff_id,
    startUtc: fromIso,
    endUtc: toIso,
  })
  const pingsRes = { data: pingsFetch.rows, error: pingsFetch.diagnostics.errorMessage ? { message: pingsFetch.diagnostics.errorMessage } : null }

  const [reportsRes, ltesRes, workdaysRes, locationsRes] = await Promise.all([
    supabase.from('time_reports')
      .select('id, booking_id, large_project_id, location_id, start_time, end_time, report_date')
      .eq('staff_id', staff_id).eq('organization_id', organizationId).eq('report_date', date).eq('is_subdivision', false),
    supabase.from('time_reports')
      .select('id, booking_id, large_project_id, location_id, start_time, end_time, report_date')
      .eq('staff_id', staff_id).eq('organization_id', organizationId).eq('report_date', date).eq('is_subdivision', false),
    supabase.from('location_time_entries')
      .select('id, booking_id, large_project_id, location_id, entered_at, exited_at')
      .eq('staff_id', staff_id).eq('organization_id', organizationId).eq('entry_date', date),
    supabase.from('workdays').select('id, started_at, ended_at')
      .eq('staff_id', staff_id).eq('organization_id', organizationId)
      .gte('started_at', fromIso).lte('started_at', toIso).order('started_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('organization_locations').select('id, name, latitude, longitude, radius_meters')
      .eq('organization_id', organizationId).eq('is_active', true),
  ])

  const pings = (pingsRes.data || []).map((p: any) => ({
    recorded_at: p.recorded_at, lat: Number(p.lat), lng: Number(p.lng),
    accuracy: p.accuracy != null ? Number(p.accuracy) : null,
    speed: p.speed != null ? Number(p.speed) : null,
  }))

  // Resolve site coords for each session via booking / large_project / location.
  const bookingIds = new Set<string>()
  const largeIds = new Set<string>()
  const locIds = new Set<string>()
  const collect = (r: any) => {
    if (r.booking_id) bookingIds.add(String(r.booking_id))
    if (r.large_project_id) largeIds.add(String(r.large_project_id))
    if (r.location_id) locIds.add(String(r.location_id))
  }
  ;(reportsRes.data || []).forEach(collect)
  ;(ltesRes.data || []).forEach(collect)

  const [bookingsRes, largeRes, locRes] = await Promise.all([
    bookingIds.size ? supabase.from('bookings').select('id, client, delivery_latitude, delivery_longitude').in('id', [...bookingIds]) : { data: [] },
    largeIds.size ? supabase.from('large_projects').select('id, name, address_latitude, address_longitude, address_radius_meters').in('id', [...largeIds]) : { data: [] },
    locIds.size ? supabase.from('organization_locations').select('id, name, latitude, longitude, radius_meters').in('id', [...locIds]) : { data: [] },
  ])

  const bookingMap = new Map((bookingsRes.data || []).map((b: any) => [String(b.id), b]))
  const largeMap = new Map((largeRes.data || []).map((l: any) => [String(l.id), l]))
  const locMap = new Map((locRes.data || []).map((l: any) => [String(l.id), l]))

  const composeIso = (t: string | null): string | null => {
    if (!t) return null
    return new Date(`${date}T${t}`).toISOString()
  }

  const sessions: RealitySessionInput[] = []

  for (const r of reportsRes.data || []) {
    let site: any = null; let label = 'Tidrapport'; let targetType: any = 'unknown'; let targetId: string | null = null
    if (r.large_project_id && largeMap.has(String(r.large_project_id))) {
      const lp: any = largeMap.get(String(r.large_project_id))
      label = lp.name || 'Stort projekt'; targetType = 'large_project'; targetId = String(r.large_project_id)
      if (lp.address_latitude != null && lp.address_longitude != null) site = { lat: Number(lp.address_latitude), lng: Number(lp.address_longitude), radiusMeters: lp.address_radius_meters ?? null }
    } else if (r.booking_id && bookingMap.has(String(r.booking_id))) {
      const b: any = bookingMap.get(String(r.booking_id))
      label = b.client || `Booking ${r.booking_id}`; targetType = 'booking'; targetId = String(r.booking_id)
      if (b.delivery_latitude != null && b.delivery_longitude != null) site = { lat: Number(b.delivery_latitude), lng: Number(b.delivery_longitude), radiusMeters: null }
    } else if (r.location_id && locMap.has(String(r.location_id))) {
      const l: any = locMap.get(String(r.location_id))
      label = l.name || 'Plats'; targetType = 'location'; targetId = String(r.location_id)
      if (l.latitude != null && l.longitude != null) site = { lat: Number(l.latitude), lng: Number(l.longitude), radiusMeters: l.radius_meters ?? null }
    }
    const start = composeIso(r.start_time); if (!start) continue
    sessions.push({ id: String(r.id), kind: 'time_report', start, end: composeIso(r.end_time), label, targetType, targetId, site })
  }

  for (const e of ltesRes.data || []) {
    let site: any = null; let label = 'Plats'; let targetType: any = 'unknown'; let targetId: string | null = null
    if (e.location_id && locMap.has(String(e.location_id))) {
      const l: any = locMap.get(String(e.location_id))
      label = l.name || 'Plats'; targetType = 'location'; targetId = String(e.location_id)
      if (l.latitude != null && l.longitude != null) site = { lat: Number(l.latitude), lng: Number(l.longitude), radiusMeters: l.radius_meters ?? null }
    } else if (e.booking_id && bookingMap.has(String(e.booking_id))) {
      const b: any = bookingMap.get(String(e.booking_id))
      label = b.client || 'Booking'; targetType = 'booking'; targetId = String(e.booking_id)
      if (b.delivery_latitude != null && b.delivery_longitude != null) site = { lat: Number(b.delivery_latitude), lng: Number(b.delivery_longitude), radiusMeters: null }
    } else if (e.large_project_id && largeMap.has(String(e.large_project_id))) {
      const lp: any = largeMap.get(String(e.large_project_id))
      label = lp.name || 'Projekt'; targetType = 'large_project'; targetId = String(e.large_project_id)
      if (lp.address_latitude != null && lp.address_longitude != null) site = { lat: Number(lp.address_latitude), lng: Number(lp.address_longitude), radiusMeters: lp.address_radius_meters ?? null }
    }
    if (!e.entered_at) continue
    sessions.push({ id: String(e.id), kind: 'location_entry', start: e.entered_at, end: e.exited_at ?? null, label, targetType, targetId, site })
  }

  // Build a knownSites pool for wrong_reported_site detection.
  const knownSites: KnownSite[] = []
  for (const l of (locationsRes.data || [])) {
    if (l.latitude != null && l.longitude != null) {
      knownSites.push({ id: String(l.id), type: 'location', label: l.name || 'Plats', lat: Number(l.latitude), lng: Number(l.longitude), radiusMeters: l.radius_meters ?? null })
    }
  }
  for (const b of bookingMap.values() as any) {
    if (b.delivery_latitude != null && b.delivery_longitude != null) {
      knownSites.push({ id: String(b.id), type: 'booking', label: b.client || 'Booking', lat: Number(b.delivery_latitude), lng: Number(b.delivery_longitude) })
    }
  }
  for (const lp of largeMap.values() as any) {
    if (lp.address_latitude != null && lp.address_longitude != null) {
      knownSites.push({ id: String(lp.id), type: 'large_project', label: lp.name || 'Projekt', lat: Number(lp.address_latitude), lng: Number(lp.address_longitude), radiusMeters: lp.address_radius_meters ?? null })
    }
  }

  const reality = buildDayReality({
    staffId: staff_id, date, pings, sessions,
    workday: workdaysRes.data ? { id: workdaysRes.data.id, started_at: workdaysRes.data.started_at, ended_at: workdaysRes.data.ended_at } : null,
    knownSites,
  })

  return new Response(JSON.stringify(reality),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// =========================================================================
// get_active_day_state — single source of truth snapshot the mobile app
// uses to render header workday + activity banner without relying on
// localStorage. Returns:
//   { workday, open_entries, latest_ping, latest_ping_age_ms, stale_ping,
//     anomalies }
// =========================================================================
// LEGACY ONLY.
// Do not use for Time Engine v2.
// New active timer source is active_time_registrations.
async function handleGetActiveDayStateLegacyOnly(supabase: any, staffId: string, organizationId: string) {
  const STALE_PING_MS = 5 * 60 * 1000

  // Use a 2-day window so a workday/LTE that started late yesterday is still
  // visible after a phone restart soon after midnight.
  const today = new Date()
  const yest = new Date(today.getTime() - 24 * 60 * 60 * 1000)
  const dateFrom = yest.toISOString().split('T')[0]

  const [workdayRes, ltesRes, pingRes, anomaliesRes, locationsRes] = await Promise.all([
    supabase.from('workdays')
      .select('id, started_at, ended_at, review_status')
      .eq('staff_id', staffId).eq('organization_id', organizationId)
      .is('ended_at', null)
      .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('location_time_entries')
      .select('id, location_id, booking_id, large_project_id, entered_at, source, metadata')
      .eq('staff_id', staffId).eq('organization_id', organizationId)
      .gte('entry_date', dateFrom)
      .is('exited_at', null)
      .order('entered_at', { ascending: true }),
    supabase.from('staff_locations')
      .select('latitude, longitude, accuracy, updated_at')
      .eq('staff_id', staffId).eq('organization_id', organizationId)
      .maybeSingle(),
    supabase.from('workday_flags')
      .select('id, kind, severity, created_at, resolved_at, payload')
      .eq('staff_id', staffId).eq('organization_id', organizationId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('organization_locations')
      .select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true),
  ])

  const ltes = (ltesRes.data || []) as any[]

  // Resolve labels for booking/large_project targets in two batched queries.
  const bookingIds = Array.from(new Set(ltes.map(e => e.booking_id).filter(Boolean).map(String)))
  const projectIds = Array.from(new Set(ltes.map(e => e.large_project_id).filter(Boolean).map(String)))
  const [bookingsRes, projectsRes] = await Promise.all([
    bookingIds.length
      ? supabase.from('bookings')
          .select('id, booking_number, client, assigned_project_name')
          .in('id', bookingIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? supabase.from('large_projects')
          .select('id, name')
          .in('id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const bookingMap = new Map<string, any>(((bookingsRes.data || []) as any[]).map((b: any) => [String(b.id), b]))
  const projectMap = new Map<string, any>(((projectsRes.data || []) as any[]).map((p: any) => [String(p.id), p]))

  const locMap = new Map<string, string>(
    ((locationsRes.data || []) as any[]).map((l: any) => [String(l.id), l.name || 'Plats'])
  )

  // Compute global ping age once so per-entry status can reuse it.
  const ping = pingRes.data as any
  const pingUpdatedAt: string | null = ping?.updated_at || null
  const pingAgeMs: number | null = pingUpdatedAt
    ? Math.max(0, Date.now() - new Date(pingUpdatedAt).getTime())
    : null
  const pingIsStale = pingAgeMs == null || pingAgeMs > STALE_PING_MS

  const open_entries = ltes.map((e: any) => {
    let target_kind: 'location' | 'booking' | 'large_project' | 'unknown' = 'unknown'
    let target_id: string | null = null
    let target_label = 'Aktivitet'
    if (e.location_id) {
      target_kind = 'location'; target_id = String(e.location_id)
      target_label = locMap.get(target_id) || 'Plats'
    } else if (e.large_project_id) {
      target_kind = 'large_project'; target_id = String(e.large_project_id)
      const p = projectMap.get(target_id)
      target_label = p?.name || 'Projekt'
    } else if (e.booking_id) {
      target_kind = 'booking'; target_id = String(e.booking_id)
      const b = bookingMap.get(target_id)
      const num = b?.booking_number ? String(b.booking_number) : null
      const name = b?.assigned_project_name || b?.client || null
      target_label = [num, name].filter(Boolean).join(' · ') || 'Uppdrag'
    }

    const md = (e.metadata && typeof e.metadata === 'object') ? e.metadata : {}
    const auto_started = Boolean(md.auto_started ?? md.auto_start ?? false)
    const auto_start_source = md.auto_start_source ?? md.geofence_source ?? null
    const confidence = md.confidence ?? null

    // Per-entry status — server has no direct geofence-distance check here, so
    // we expose what we can derive and let the client refine. `active_signal_lost`
    // wins when GPS hasn't pinged in >STALE_PING_MS; otherwise `active_unknown`
    // (the client's geofencing layer reclassifies to on_site/left_site).
    const status: 'active_on_site' | 'active_but_left_site' | 'active_signal_lost' | 'active_unknown' =
      pingIsStale ? 'active_signal_lost' : 'active_unknown'

    // Departure heuristics — currently not derived server-side. Surface the
    // contract so clients can populate / display when a future engine fills it.
    const last_known_arrival_at: string | null = e.entered_at || null
    const last_known_departure_at: string | null = md.last_known_departure_at ?? null
    const departure_detected: boolean = Boolean(md.departure_detected ?? false)
    const suggested_stop_at: string | null = md.suggested_stop_at ?? last_known_departure_at ?? null

    return {
      id: e.id,
      target_kind,
      target_id,
      target_label,
      entered_at: e.entered_at,
      source: e.source ?? null,
      metadata: md,
      auto_started,
      auto_start_source,
      confidence,
      latest_ping_at: pingUpdatedAt,
      latest_ping_age_ms: pingAgeMs,
      stale_ping: pingIsStale,
      last_known_arrival_at,
      last_known_departure_at,
      departure_detected,
      suggested_stop_at,
      status,
      correction_actions: ['stop_now', 'stop_from_departure', 'change_target', 'mark_not_work'],
    }
  })

  const latest_ping = ping && ping.updated_at ? {
    latitude: ping.latitude != null ? Number(ping.latitude) : null,
    longitude: ping.longitude != null ? Number(ping.longitude) : null,
    accuracy: ping.accuracy != null ? Number(ping.accuracy) : null,
    updated_at: ping.updated_at,
  } : null
  const latest_ping_age_ms = pingAgeMs
  const stale_ping = pingIsStale

  const wd = workdayRes.data as any
  const workday = wd ? {
    id: wd.id,
    started_at: wd.started_at,
    ended_at: wd.ended_at,
    review_status: wd.review_status ?? null,
  } : null

  return new Response(JSON.stringify({
    workday,
    open_entries,
    latest_ping,
    latest_ping_age_ms,
    stale_ping,
    anomalies: anomaliesRes.data || [],
    server_time: new Date().toISOString(),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// ============================================================================
// get_ops_overview — Unified planner dashboard endpoint
// ----------------------------------------------------------------------------
// Combines calendar + assignments + threads + live staff status + anomalies
// into one payload so MobileOverview only needs a single round-trip.
//
// Input:  { from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', mode?: 'day'|'week',
//           include_anomalies?: boolean }
// Output: { jobs[], assignments[], staffStatus[], anomalies[],
//           messageThreads[], summary, from, to }
// ============================================================================
async function handleGetOpsOverview(
  supabase: any,
  callerUserId: string | null,
  data: any,
  organizationId: string,
) {
  if (!(await callerIsPlanner(supabase, callerUserId))) return plannerForbidden()

  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const mode: 'day' | 'week' = data?.mode === 'week' ? 'week' : 'day'
  const defaultFrom = todayKey
  const defaultTo = mode === 'week'
    ? new Date(today.getTime() + 6 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    : todayKey
  const fromDate: string = (typeof data?.from === 'string' && data.from) || defaultFrom
  const toDate: string = (typeof data?.to === 'string' && data.to) || defaultTo
  const fromIso = `${fromDate}T00:00:00.000Z`
  const toIso = `${toDate}T23:59:59.999Z`
  const includeAnomalies = data?.include_anomalies === true

  // Reuse existing handlers (they already enforce planner check + org scope).
  const innerInput = { from: fromIso, to: toIso }
  const [calRes, asgRes, thrRes] = await Promise.all([
    handleGetOverviewCalendar(supabase, callerUserId, innerInput, organizationId),
    handleGetOverviewAssignments(supabase, callerUserId, { from: fromDate, to: toDate }, organizationId),
    handleGetOverviewThreads(supabase, callerUserId, organizationId),
  ])
  const calBody = await calRes.json().catch(() => ({}))
  const asgBody = await asgRes.json().catch(() => ({}))
  const thrBody = await thrRes.json().catch(() => ({}))
  const events = Array.isArray(calBody?.events) ? calBody.events : []
  const assignments = Array.isArray(asgBody?.assignments) ? asgBody.assignments : []
  const threads = Array.isArray(thrBody?.threads) ? thrBody.threads : []

  // ── jobs[] — UNION of calendar events + assignments (same source as
  //   personalkalender). Dedupe per (target_type, target_id, date, phase).
  // ─────────────────────────────────────────────────────────────────────
  type Job = {
    id: string
    type: 'booking' | 'large_project'
    title: string
    booking_number: string | null
    client: string | null
    phase: string | null
    date: string
    start_time: string
    end_time: string
    address: string | null
    assigned_staff: Array<{ staff_id: string; staff_name: string; role: string | null; team_id: string | null }>
    assigned_staff_count: number
    required_staff_count: number | null
    staffing_status: 'unstaffed' | 'partial' | 'staffed' | 'unknown'
  }

  // Index assignments by target+date+phase and by booking+date (for jobActivity)
  const asgByKey = new Map<string, any[]>()
  const staffByBookingDate = new Map<string, Set<string>>()
  const staffByLpDate = new Map<string, Set<string>>()
  const normalizePhase = (p?: string | null) => {
    const v = String(p || '').toLowerCase()
    if (v === 'rig') return 'rig'
    if (v === 'event') return 'event'
    if (v === 'rigdown') return 'rigDown'
    return p || null
  }
  for (const a of assignments) {
    const phase = normalizePhase(a.phase) || 'event'
    const tType = a.target_type === 'large_project' ? 'large_project' : 'booking'
    const tId = a.target_id || (tType === 'booking' ? a.booking_id : null)
    if (!tId) continue
    const k = `${tType}:${tId}|${a.assignment_date}|${phase}`
    if (!asgByKey.has(k)) asgByKey.set(k, [])
    asgByKey.get(k)!.push(a)
    if (a.booking_id) {
      const bk = `${a.booking_id}|${a.assignment_date}`
      if (!staffByBookingDate.has(bk)) staffByBookingDate.set(bk, new Set())
      staffByBookingDate.get(bk)!.add(a.staff_id)
    }
    if (tType === 'large_project') {
      const lk = `${tId}|${a.assignment_date}`
      if (!staffByLpDate.has(lk)) staffByLpDate.set(lk, new Set())
      staffByLpDate.get(lk)!.add(a.staff_id)
    }
  }

  const jobs: (Job & { booking_id: string | null; large_project_id: string | null; target_type: 'booking' | 'large_project'; target_id: string | null; jobActivity?: any })[] = []
  const jobByKey = new Map<string, typeof jobs[number]>()

  const upsertJob = (key: string, row: typeof jobs[number]) => {
    const existing = jobByKey.get(key)
    if (!existing) {
      jobByKey.set(key, row)
      jobs.push(row)
      return row
    }
    // Merge: prefer real (non-synthetic) id, real time, address, client
    if (existing.id.startsWith('synthetic-') && !row.id.startsWith('synthetic-')) existing.id = row.id
    if (!existing.address && row.address) existing.address = row.address
    if (!existing.client && row.client) existing.client = row.client
    if (!existing.booking_number && row.booking_number) existing.booking_number = row.booking_number
    if ((!existing.start_time || existing.start_time.endsWith('T00:00:00')) && row.start_time) existing.start_time = row.start_time
    if ((!existing.end_time || existing.end_time.endsWith('T00:00:00')) && row.end_time) existing.end_time = row.end_time
    return existing
  }

  // 1) Seed from calendar events
  for (const ev of events) {
    const date = ev.source_date || (ev.start_time || '').slice(0, 10)
    const phase = normalizePhase(ev.event_type) || 'event'
    const lpId: string | null = ev.large_project_id ?? null
    const isLp = !ev.booking_id && !!lpId
    const tType: 'booking' | 'large_project' = isLp ? 'large_project' : 'booking'
    const tId = isLp ? lpId : (ev.booking_id ?? null)
    if (!tId) continue
    const key = `${tType}:${tId}|${date}|${phase}`
    const bk = ev.booking_id ? staffByBookingDate.get(`${ev.booking_id}|${date}`) : undefined
    const lk = isLp ? staffByLpDate.get(`${lpId}|${date}`) : undefined
    const count = (bk?.size ?? 0) + (lk?.size ?? 0)
    upsertJob(key, {
      id: ev.id,
      type: tType,
      target_type: tType,
      target_id: tId,
      booking_id: ev.booking_id ?? null,
      large_project_id: lpId,
      title: ev.title,
      booking_number: ev.booking_number ?? null,
      client: ev.title ?? null,
      phase,
      date,
      start_time: ev.start_time,
      end_time: ev.end_time,
      address: ev.delivery_address ?? null,
      assigned_staff: [],
      assigned_staff_count: count,
      required_staff_count: null,
      staffing_status: count === 0 ? 'unstaffed' : 'staffed',
    })
  }

  // 2) Add jobs that exist in assignments but have no calendar event
  for (const [key, rows] of asgByKey.entries()) {
    if (jobByKey.has(key)) continue
    const first = rows[0]
    const phase = normalizePhase(first.phase) || 'event'
    const tType: 'booking' | 'large_project' = first.target_type === 'large_project' ? 'large_project' : 'booking'
    const tId = first.target_id || first.booking_id
    if (!tId) continue
    upsertJob(key, {
      id: `asg-${tType}-${tId}-${first.assignment_date}-${phase}`,
      type: tType,
      target_type: tType,
      target_id: tId,
      booking_id: first.booking_id ?? null,
      large_project_id: tType === 'large_project' ? tId : null,
      title: first.target_name || first.booking_title || first.client || (tType === 'large_project' ? 'Stort projekt' : 'Bokning'),
      booking_number: first.booking_number ?? null,
      client: first.client ?? null,
      phase,
      date: first.assignment_date,
      start_time: first.planned_start || `${first.assignment_date}T00:00:00`,
      end_time: first.planned_end || `${first.assignment_date}T00:00:00`,
      address: first.address ?? null,
      assigned_staff: [],
      assigned_staff_count: rows.length,
      required_staff_count: null,
      staffing_status: 'staffed',
    })
  }

  // 3) Attach assigned_staff per job from BSA index
  for (const j of jobs) {
    const key = `${j.target_type}:${j.target_id}|${j.date}|${j.phase}`
    const rows = asgByKey.get(key) || []
    const seenStaff = new Set<string>()
    j.assigned_staff = rows
      .filter(r => r.staff_id && !seenStaff.has(r.staff_id) && (seenStaff.add(r.staff_id), true))
      .map(r => ({ staff_id: r.staff_id, staff_name: r.staff_name || '', role: r.role ?? null, team_id: r.team_id ?? null }))
    j.assigned_staff_count = j.assigned_staff.length
    j.staffing_status = j.assigned_staff.length === 0
      ? (j.target_type === 'large_project' ? 'unknown' : 'unstaffed')
      : 'staffed'
  }

  jobs.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  // ── staffStatus[] ────────────────────────────────────────────────────
  const staffIds = [...new Set(assignments.map((a: any) => a.staff_id).filter(Boolean))]
  const plannedTargetsByStaff = new Map<string, any[]>()
  for (const a of assignments) {
    const arr = plannedTargetsByStaff.get(a.staff_id) || []
    arr.push({
      target_type: a.target_type,
      target_id: a.target_id,
      target_name: a.target_name,
      date: a.assignment_date,
      phase: a.phase,
      planned_start: a.planned_start,
      planned_end: a.planned_end,
      address: a.address ?? null,
    })
    plannedTargetsByStaff.set(a.staff_id, arr)
  }

  let workdaysByStaff = new Map<string, any>()
  let openLteByStaff = new Map<string, any>()
  let locationsByStaff = new Map<string, any>()
  let anomalyCountByStaff = new Map<string, number>()

  if (staffIds.length > 0) {
    const [wdRes, lteRes, locRes, anomRes] = await Promise.all([
      supabase.from('workdays')
        .select('id, staff_id, started_at, ended_at')
        .eq('organization_id', organizationId)
        .in('staff_id', staffIds)
        .gte('started_at', `${fromDate}T00:00:00.000Z`)
        .lte('started_at', `${toDate}T23:59:59.999Z`),
      supabase.from('location_time_entries')
        .select('id, staff_id, booking_id, large_project_id, location_id, entered_at, exited_at')
        .eq('organization_id', organizationId)
        .in('staff_id', staffIds)
        .is('exited_at', null),
      supabase.from('staff_locations')
        .select('staff_id, latitude, longitude, accuracy, updated_at')
        .eq('organization_id', organizationId)
        .in('staff_id', staffIds),
      includeAnomalies
        ? supabase.from('time_report_anomalies')
            .select('staff_id, status')
            .eq('organization_id', organizationId)
            .in('staff_id', staffIds)
            .neq('status', 'resolved')
            .neq('status', 'dismissed')
        : Promise.resolve({ data: [] }),
    ])
    for (const wd of wdRes.data || []) {
      const cur = workdaysByStaff.get(wd.staff_id)
      // prefer open workday for today
      const isToday = (wd.started_at || '').slice(0, 10) === todayKey
      if (!cur || (isToday && !wd.ended_at)) workdaysByStaff.set(wd.staff_id, wd)
    }
    for (const lte of lteRes.data || []) {
      if (!openLteByStaff.has(lte.staff_id)) openLteByStaff.set(lte.staff_id, lte)
    }
    for (const loc of locRes.data || []) locationsByStaff.set(loc.staff_id, loc)
    for (const a of anomRes.data || []) {
      anomalyCountByStaff.set(a.staff_id, (anomalyCountByStaff.get(a.staff_id) || 0) + 1)
    }
  }

  const staffNameMap = new Map<string, string>()
  for (const a of assignments) if (a.staff_id) staffNameMap.set(a.staff_id, a.staff_name)

  // Resolve labels for active-timer targets so admin sees "vart de är just nu"
  const activeBookingIds = [...new Set([...openLteByStaff.values()].map((l: any) => l.booking_id).filter(Boolean))] as string[]
  const activeLpIds = [...new Set([...openLteByStaff.values()].map((l: any) => l.large_project_id).filter(Boolean))] as string[]
  const activeLocIds = [...new Set([...openLteByStaff.values()].map((l: any) => l.location_id).filter(Boolean))] as string[]
  const bookingLabelMap = new Map<string, { label: string; address: string | null }>()
  const lpLabelMap = new Map<string, { label: string; address: string | null }>()
  const locLabelMap = new Map<string, { label: string; address: string | null }>()
  if (activeBookingIds.length > 0) {
    const { data } = await supabase
      .from('bookings')
      .select('id, client, booking_number, deliveryaddress')
      .eq('organization_id', organizationId)
      .in('id', activeBookingIds)
    for (const b of data || []) {
      const label = [b.booking_number, b.client].filter(Boolean).join(' · ') || 'Bokning'
      bookingLabelMap.set(b.id, { label, address: b.deliveryaddress ?? null })
    }
  }
  if (activeLpIds.length > 0) {
    const { data } = await supabase
      .from('large_projects')
      .select('id, name, address')
      .eq('organization_id', organizationId)
      .in('id', activeLpIds)
    for (const p of data || []) lpLabelMap.set(p.id, { label: p.name || 'Stort projekt', address: p.address ?? null })
  }
  if (activeLocIds.length > 0) {
    const { data } = await supabase
      .from('fixed_locations')
      .select('id, name, address')
      .eq('organization_id', organizationId)
      .in('id', activeLocIds)
    for (const l of data || []) locLabelMap.set(l.id, { label: l.name || 'Plats', address: l.address ?? null })
  }

  const now = Date.now()
  const todayKeyForStaff = todayKey
  const staffStatus = staffIds.map((sid: string) => {
    const wd = workdaysByStaff.get(sid)
    const openLte = openLteByStaff.get(sid)
    const loc = locationsByStaff.get(sid)
    const ageMs = loc?.updated_at ? now - new Date(loc.updated_at).getTime() : null
    const gpsStatus = ageMs == null ? 'unknown' : ageMs < 5 * 60_000 ? 'live' : ageMs < 30 * 60_000 ? 'recent' : 'stale'

    const planned = plannedTargetsByStaff.get(sid) || []
    const plannedToday = planned.filter((p: any) => p.date === todayKeyForStaff)
    const hasOpenWorkday = !!(wd && !wd.ended_at)

    // Resolve active timer label
    let activeTimerInfo: any = null
    let currentTargetType: string | null = null
    let currentTargetId: string | null = null
    let currentTargetLabel: string | null = null
    let currentTargetAddress: string | null = null
    let currentSince: string | null = null
    let activeTimerLabel: string | null = null
    if (openLte) {
      const targetType = openLte.location_id ? 'location' : openLte.large_project_id ? 'large_project' : 'booking'
      const targetId = openLte.location_id || openLte.large_project_id || openLte.booking_id || null
      let lbl: { label: string; address: string | null } | undefined
      if (targetType === 'booking' && targetId) lbl = bookingLabelMap.get(targetId)
      else if (targetType === 'large_project' && targetId) lbl = lpLabelMap.get(targetId)
      else if (targetType === 'location' && targetId) lbl = locLabelMap.get(targetId)
      activeTimerInfo = {
        id: openLte.id,
        target_type: targetType,
        target_id: targetId,
        target_label: lbl?.label ?? null,
        started_at: openLte.entered_at,
      }
      currentTargetType = targetType
      currentTargetId = targetId
      currentTargetLabel = lbl?.label ?? null
      currentTargetAddress = lbl?.address ?? null
      currentSince = openLte.entered_at
      activeTimerLabel = targetType === 'location' ? 'Plats-timer'
        : targetType === 'large_project' ? 'Projekt-timer'
        : 'Jobb-timer'
    }

    // Determine current_status
    let currentStatus: string
    if (openLte) {
      if (gpsStatus === 'stale') currentStatus = 'signal_lost'
      else if (currentTargetType === 'large_project') currentStatus = 'on_project'
      else if (currentTargetType === 'location') currentStatus = 'on_location'
      else currentStatus = 'active_timer'
    } else if (hasOpenWorkday) {
      currentStatus = 'active_timer'
    } else if (plannedToday.length > 0) {
      currentStatus = 'planned_not_started'
    } else {
      currentStatus = 'unknown'
    }
    if (plannedToday.length > 0 && !hasOpenWorkday && !openLte) {
      currentStatus = 'missing_workday'
    }

    const elapsedMinutes = currentSince
      ? Math.max(0, Math.round((now - new Date(currentSince).getTime()) / 60_000))
      : null

    const mapUrl = loc
      ? `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
      : null

    return {
      staff_id: sid,
      name: staffNameMap.get(sid) || '',
      planned_targets: planned,
      has_open_workday: hasOpenWorkday,
      workday_started_at: wd?.started_at ?? null,
      active_timer: activeTimerInfo,
      active_timer_label: activeTimerLabel,
      current_status: currentStatus,
      current_target_type: currentTargetType,
      current_target_id: currentTargetId,
      current_target_label: currentTargetLabel,
      current_target_address: currentTargetAddress,
      current_since: currentSince,
      elapsed_minutes: elapsedMinutes,
      latest_known_location: loc ? {
        latitude: loc.latitude, longitude: loc.longitude,
        accuracy: loc.accuracy, updated_at: loc.updated_at,
      } : null,
      gps_status: gpsStatus,
      map_url: mapUrl,
      anomaly_count: anomalyCountByStaff.get(sid) || 0,
    }
  })

  // ── jobActivity (live timeline per job from location_time_entries) ───
  const bookingIdsForJobs = [...new Set(jobs.map(j => j.booking_id).filter(Boolean) as string[])]
  let lteForJobs: any[] = []
  if (bookingIdsForJobs.length > 0) {
    const { data: lteJobs } = await supabase
      .from('location_time_entries')
      .select('id, staff_id, booking_id, large_project_id, entered_at, exited_at, source')
      .eq('organization_id', organizationId)
      .in('booking_id', bookingIdsForJobs)
      .gte('entered_at', `${fromDate}T00:00:00.000Z`)
      .lte('entered_at', `${toDate}T23:59:59.999Z`)
    lteForJobs = lteJobs || []
  }
  const nowMsJob = Date.now()
  const lteByJobKey = new Map<string, any[]>()
  for (const lte of lteForJobs) {
    if (!lte.booking_id) continue
    const d = (lte.entered_at || '').slice(0, 10)
    const key = `${lte.booking_id}|${d}`
    if (!lteByJobKey.has(key)) lteByJobKey.set(key, [])
    lteByJobKey.get(key)!.push(lte)
  }
  const allStaffNameMap = new Map<string, string>(staffNameMap)
  const missingStaffIds = [...new Set(lteForJobs.map(l => l.staff_id).filter((sid: string) => sid && !allStaffNameMap.has(sid)))] as string[]
  if (missingStaffIds.length > 0) {
    const { data: extra } = await supabase
      .from('staff')
      .select('id, name')
      .eq('organization_id', organizationId)
      .in('id', missingStaffIds)
    for (const s of extra || []) allStaffNameMap.set(s.id, s.name)
  }
  for (const j of jobs) {
    if (!j.booking_id) {
      j.jobActivity = { has_started: false, started_at: null, latest_activity_at: null, on_site_minutes: 0, active_staff_count: 0, active_staff: [], timeline: [] }
      continue
    }
    const ltes = (lteByJobKey.get(`${j.booking_id}|${j.date}`) || []).slice()
    if (ltes.length === 0) {
      j.jobActivity = { has_started: false, started_at: null, latest_activity_at: null, on_site_minutes: 0, active_staff_count: 0, active_staff: [], timeline: [] }
      continue
    }
    ltes.sort((a, b) => (a.entered_at || '').localeCompare(b.entered_at || ''))
    const started_at = ltes[0].entered_at
    let latest_activity_at = ''
    for (const l of ltes) {
      const cand = l.exited_at || l.entered_at
      if (cand && cand > latest_activity_at) latest_activity_at = cand
    }
    const openByStaff = new Map<string, any>()
    for (const l of ltes) if (!l.exited_at) openByStaff.set(l.staff_id, l)
    const active_staff = [...openByStaff.entries()].map(([sid, l]) => {
      const loc = locationsByStaff.get(sid)
      const ageMs = loc?.updated_at ? nowMsJob - new Date(loc.updated_at).getTime() : null
      const status = ageMs == null ? 'on_site' : ageMs < 30 * 60_000 ? 'on_site' : 'signal_lost'
      return { staff_id: sid, name: allStaffNameMap.get(sid) || '', since: l.entered_at, status }
    })
    const timeline: any[] = []
    for (const l of ltes) {
      timeline.push({ type: 'timer_start', at: l.entered_at, staff_id: l.staff_id, staff_name: allStaffNameMap.get(l.staff_id) || '', label: 'Påbörjade', status: 'on_site' })
      if (l.exited_at) timeline.push({ type: 'timer_stop', at: l.exited_at, staff_id: l.staff_id, staff_name: allStaffNameMap.get(l.staff_id) || '', label: 'Avslutade', status: 'left' })
    }
    timeline.sort((a, b) => (a.at || '').localeCompare(b.at || ''))
    const startedMs = started_at ? new Date(started_at).getTime() : nowMsJob
    const endRefMs = openByStaff.size > 0 ? nowMsJob : (latest_activity_at ? new Date(latest_activity_at).getTime() : nowMsJob)
    const on_site_minutes = Math.max(0, Math.round((endRefMs - startedMs) / 60_000))
    j.jobActivity = { has_started: true, started_at, latest_activity_at, on_site_minutes, active_staff_count: openByStaff.size, active_staff, timeline }
  }

  // ── anomalies[] (operative, derived) ─────────────────────────────────
  type Anom = {
    type: string
    severity: 'low' | 'medium' | 'high'
    staff_id: string | null
    target_id: string | null
    label: string
    action: string | null
    date?: string
  }
  const anomalies: Anom[] = []
  // 1) unstaffed jobs
  for (const j of jobs) {
    if (j.staffing_status === 'unstaffed') {
      anomalies.push({
        type: 'unstaffed_job', severity: 'high',
        staff_id: null, target_id: j.id,
        label: `${j.title} saknar bemanning`, action: 'staff_job', date: j.date,
      })
    }
  }
  // 2) planned-but-not-started (today only)
  if (fromDate <= todayKey && todayKey <= toDate) {
    for (const s of staffStatus) {
      const hasToday = s.planned_targets.some((p: any) => p.date === todayKey)
      if (hasToday && !s.has_open_workday && !s.active_timer) {
        anomalies.push({
          type: 'missing_workday', severity: 'medium',
          staff_id: s.staff_id, target_id: null,
          label: `${s.name} planerad men ej startad`, action: 'contact_staff', date: todayKey,
        })
      }
    }
    // 3) workday/timer without assignment
    for (const s of staffStatus) {
      if ((s.has_open_workday || s.active_timer) && s.planned_targets.length === 0) {
        anomalies.push({
          type: 'workday_without_assignment', severity: 'low',
          staff_id: s.staff_id, target_id: null,
          label: `${s.name} har arbetsdag utan tilldelning`, action: 'review_workday', date: todayKey,
        })
      }
    }
    // 4) signal lost while timer active
    for (const s of staffStatus) {
      if (s.active_timer && s.gps_status === 'stale') {
        anomalies.push({
          type: 'signal_lost', severity: 'medium',
          staff_id: s.staff_id, target_id: s.active_timer.target_id,
          label: `${s.name} timer aktiv – GPS-signal förlorad`, action: 'review_timer', date: todayKey,
        })
      }
    }
  }

  // ── messageThreads[] (normalize legacy field names) ──────────────────
  const messageThreads = threads.map((t: any) => ({
    booking_id: t.booking_id,
    client: t.client,
    booking_number: t.booking_number ?? null,
    last_message_at: t.last_message_at,
    last_message_preview: t.last_message_preview ?? t.last_message ?? '',
    last_sender_name: t.last_sender_name ?? t.last_sender ?? '',
    unread_count: t.unread_count ?? 0,
    total_messages: t.total_messages ?? 0,
  }))

  // ── summary ──────────────────────────────────────────────────────────
  const todayJobs = jobs.filter(j => j.date === todayKey)
  const summary = {
    jobs_today: todayJobs.length,
    planned_staff: new Set(assignments.filter((a: any) => a.assignment_date === todayKey).map((a: any) => a.staff_id)).size,
    active_workdays: staffStatus.filter(s => s.has_open_workday).length,
    missing_workdays: anomalies.filter(a => a.type === 'missing_workday').length,
    unstaffed_jobs: anomalies.filter(a => a.type === 'unstaffed_job').length,
    unread_threads: messageThreads.reduce((n: number, t: any) => n + (t.unread_count > 0 ? 1 : 0), 0),
  }

  return new Response(
    JSON.stringify({
      jobs,
      assignments,
      staffStatus,
      anomalies,
      messageThreads,
      summary,
      from: fromDate,
      to: toDate,
      mode,
      server_time: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
