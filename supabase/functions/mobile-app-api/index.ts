import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

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

// Per-request mutable rotation slot. Set inside the handler when we decide
// to mint a new token; the outer wrapper appends it as X-New-Token to the
// final Response (sliding session — no UI interruption).
const rotationSlot: { token: string | null } = { token: null }

async function handleRequest(req: Request): Promise<Response> {
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
      const { data: claimsData, error: claimsErr } = await verifier.auth.getClaims(jwt)
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(
          JSON.stringify({ error: 'Invalid web session' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      const webUserId: string = claimsData.claims.sub
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
      // ── workday_flags (PROMPT 6 — anomaly model v2) ──
      case 'create_workday_flag':
        return await handleCreateWorkdayFlag(supabase, staffId, data, organizationId)
      case 'list_workday_flags':
        return await handleListWorkdayFlags(supabase, staffId, data, organizationId)
      case 'resolve_workday_flag':
        return await handleResolveWorkdayFlag(supabase, staffId, data, organizationId)
      case 'toggle_establishment_task':
        return await handleToggleEstablishmentTask(supabase, staffId, data, organizationId)
      case 'get_organization_locations':
        return await handleGetOrganizationLocations(supabase, organizationId)
      case 'start_location_timer':
        return await handleStartLocationTimer(supabase, staffId, data, organizationId)
      case 'stop_location_timer':
        return await handleStopLocationTimer(supabase, staffId, data, organizationId)
      case 'dismiss_location_entry':
        return await handleDismissLocationEntry(supabase, staffId, data, organizationId)
      case 'get_location_time_entries':
        return await handleGetLocationTimeEntries(supabase, staffId, data, organizationId)
      case 'get_lager_tasks':
        return await handleGetLagerTasks(supabase, staffId, organizationId)
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
      case 'get_arrival_state':
        return await handleGetArrivalState(supabase, staffId, organizationId)
      case 'mark_arrival_resolved':
        return await handleMarkArrivalResolved(supabase, staffId, data, organizationId)
      case 'report_arrival':
        return await handleReportArrival(supabase, staffId, data, organizationId)
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
      case 'correct_stale_day_end':
        return await handleCorrectStaleDayEnd(supabase, staffId, data, organizationId)
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

  // Get staff member info
  const { data: staffMember, error: staffError } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate')
    .eq('id', account.staff_id)
    .single()

  if (staffError || !staffMember) {
    console.error('Staff member lookup error:', staffError)
    return new Response(
      JSON.stringify({ error: 'Staff member not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Generate token
  const token = generateToken(account.staff_id)

  console.log(`Login successful for: ${staffMember.name}`)

  return new Response(
    JSON.stringify({
      success: true,
      token,
      staff: staffMember
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleMe(supabase: any, staffId: string, organizationId: string) {
  const { data: staffMember, error } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !staffMember) {
    return new Response(
      JSON.stringify({ error: 'Staff member not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ staff: staffMember }),
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

  // 1. BSA-based assignments (calendar scheduling)
  const { data: assignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, assignment_date, team_id')
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .gte('assignment_date', today)

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

  // Build a map of booking_id → Set of real scheduled dates
  const bookingScheduledDates: Record<string, Set<string>> = {}
  for (const a of realAssignments) {
    if (!a.booking_id.startsWith('location-')) {
      if (!bookingScheduledDates[a.booking_id]) bookingScheduledDates[a.booking_id] = new Set()
      bookingScheduledDates[a.booking_id].add(a.assignment_date)
    }
  }

  // Discover which large projects the user has REAL assignments in
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
  const allBookingIds = [...new Set([...bsaBookingIds, ...projectBookingIds])]

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

      // For project bookings discovered via expansion: only include dates the user is actually scheduled on
      let assignmentDates: string[] = []
      if (hasRealAssignment) {
        // Directly assigned: use real assignment dates
        assignmentDates = bookingAssignments
          .filter((a: any) => a.team_id !== 'project')
          .map((a: any) => a.assignment_date)
        if (assignmentDates.length === 0) {
          assignmentDates = bookingAssignments.map((a: any) => a.assignment_date)
        }
      } else if (booking.large_project_id && scheduledProjectDates[booking.large_project_id]) {
        // Project-expanded booking: intersect project scheduled dates with booking's own dates
        const bookingDates = [booking.rigdaydate, booking.eventdate, booking.rigdowndate].filter(Boolean)
        const projectDates = scheduledProjectDates[booking.large_project_id]
        assignmentDates = bookingDates.filter((d: string) => projectDates.has(d))
      }

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
    // (booking dates don't overlap with the user's scheduled project dates)
    bookingsWithAssignments = bookingsWithAssignments.filter((b: any) => {
      if (!b.large_project_id || realBsaBookingIds.has(b.id)) return true
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

  // ─── SCHEDULED SHIFTS (calendar_events) ────────────────────────────
  // For each REAL BSA assignment (excluding project/location synthetic ones),
  // fetch the matching calendar_events rows. These carry the authoritative
  // per-staff start/end times (rig / event / rigdown phases).
  // ──────────────────────────────────────────────────────────────────
  let shifts: any[] = []
  try {
    const realBsaForShifts = (assignments || []).filter(
      (a: any) =>
        a.team_id !== 'project' &&
        a.team_id !== 'location' &&
        !a.booking_id.startsWith('location-')
    )

    if (realBsaForShifts.length > 0) {
      const shiftBookingIds = [...new Set(realBsaForShifts.map((a: any) => a.booking_id))]

      // Map booking_id → enriched booking from bookingsWithAssignments
      const bookingMap: Record<string, any> = {}
      for (const b of bookingsWithAssignments) {
        if (!String(b.id).startsWith('location-')) bookingMap[b.id] = b
      }

      // Date window: min..max of assignment_dates we care about
      const dateValues = realBsaForShifts.map((a: any) => a.assignment_date).sort()
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
        // Index BSA by (booking_id|date) for quick lookup
        const bsaIndex = new Set(
          realBsaForShifts.map((a: any) => `${a.booking_id}|${a.assignment_date}`)
        )

        for (const ce of (ceRows || [])) {
          const startDate = (ce.start_time || '').slice(0, 10)
          const key = `${ce.booking_id}|${startDate}`
          if (!bsaIndex.has(key)) continue
          const booking = bookingMap[ce.booking_id]
          if (!booking) continue

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

        shifts.sort((a, b) => a.start_time.localeCompare(b.start_time))
      }
    }
  } catch (e) {
    console.error('[get_bookings] shifts build failed:', e)
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
  // NOTE: Lager / location-presence sessions are NOT merged here. They are
  // already materialised into `time_reports` by the DB trigger
  // `sync_location_entry_to_time_report` (source = 'location_auto'), so they
  // appear in this list automatically. From the user's perspective there is
  // no difference between a project timer and a warehouse timer — both are
  // editable time reports.
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
  const { booking_id, report_date, start_time, end_time, hours_worked, overtime_hours, break_time, description, establishment_task_id, large_project_id } = data
  let resolvedLocationId: string | null = null

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
  if (start_time && end_time) {
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
      organization_id: organizationId
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

  // Get project for this booking
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

  if (!project) {
    return new Response(
      JSON.stringify({ error: 'No project found for this booking' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

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

      const fileName = `receipts/${project.id}/${Date.now()}-receipt.${extension}`

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

  // Create purchase record
  const { data: purchase, error } = await supabase
    .from('project_purchases')
    .insert({
      project_id: project.id,
      description,
      amount: parseFloat(amount),
      supplier: supplier || null,
      category: category || 'other',
      receipt_url: receiptUrl,
      purchase_date: new Date().toISOString().split('T')[0],
      created_by: staffMember?.name || 'Mobile App',
      organization_id: organizationId
    })
    .select()
    .single()

  if (error) {
    console.error('Purchase creation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create purchase' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`Purchase created: ${purchase.id} for project ${project.id}`)

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

  // Create comment
  const { data: comment, error } = await supabase
    .from('project_comments')
    .insert({
      project_id: project.id,
      author_name: staffMember?.name || 'Mobile App User',
      content,
      organization_id: organizationId
    })
    .select()
    .single()

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

    // Fetch project comments (last 20)
    const { data: comments } = await supabase
      .from('project_comments')
      .select('id, author_name, content, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(20)
    projectComments = comments || []

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

  // Fetch establishment tasks for this booking — ONLY activities that have been
  // explicitly synced to the staff calendar (calendar_event_id != null) are
  // visible to field staff as info cards. Tasks where this staff member IS in
  // assigned_to_ids get is_mine=true so the client can highlight them.
  const { data: rawEstablishmentTasks } = await supabase
    .from('establishment_tasks')
    .select('id, title, category, start_date, end_date, completed, notes, sort_order, assigned_to, assigned_to_ids, start_time, end_time, status, calendar_event_id')
    .eq('booking_id', booking_id)
    .not('calendar_event_id', 'is', null)
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

  const { data: comments, error } = await supabase
    .from('project_comments')
    .select('id, author_name, content, created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to fetch comments' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

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
  const { latitude, longitude, accuracy, speed } = data || {}

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
    }, { onConflict: 'staff_id' })

  if (error) {
    console.error('[mobile-app-api] report_location error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to report location' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── APPEND TO LOCATION HISTORY (throttled to ≥15s between rows) ──
  // Used for movement maps and looking up position at a given time.
  // Cleaned up by cron after time reports are approved.
  try {
    const { data: lastHist } = await supabase
      .from('staff_location_history')
      .select('recorded_at')
      .eq('staff_id', staffId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nowMs = Date.now()
    const lastMs = lastHist?.recorded_at ? new Date(lastHist.recorded_at).getTime() : 0
    if (nowMs - lastMs >= 15_000) {
      await supabase.from('staff_location_history').insert({
        organization_id: organizationId,
        staff_id: staffId,
        lat: latitude,
        lng: longitude,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        recorded_at: new Date().toISOString(),
      })
    }
  } catch (histErr) {
    // Never fail the request if history insert fails
    console.warn('[mobile-app-api] history insert failed:', histErr)
  }

  // ── GEOFENCE CHECK for organization_locations (polygon-aware) ──
  let atLocation: { id: string; name: string } | null = null
  try {
    // Inline copy of helper logic — edge runtime can't easily import shared file from this folder layout.
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

    // GPS accuracy gate — ignore noisy pings (e.g. night-time drift) for geofence eval.
    const accuracyOk = accuracy == null || accuracy <= 50

    for (const loc of (orgLocations || [])) {
      let isInside = false
      if (loc.geofence_mode === 'polygon' && loc.geofence_polygon) {
        isInside = ptInPoly(longitude, latitude, loc.geofence_polygon)
      } else {
        const dist = haversineMeters(latitude, longitude, loc.latitude, loc.longitude)
        isInside = dist <= loc.radius_meters
      }

      // Without good accuracy we don't auto-enter/exit.
      if (!accuracyOk) continue

      // Check for ANY open entry at this location (gps or manual) — one place, one open entry
      const { data: openEntry } = await supabase
        .from('location_time_entries')
        .select('id, source')
        .eq('staff_id', staffId)
        .eq('location_id', loc.id)
        .is('exited_at', null)
        .limit(1)
        .maybeSingle()

      if (isInside && !openEntry) {
        // Arrived — create GPS entry
        await supabase.from('location_time_entries').insert({
          organization_id: organizationId,
          staff_id: staffId,
          location_id: loc.id,
          entry_date: new Date().toISOString().split('T')[0],
          entered_at: new Date().toISOString(),
          source: 'gps',
        })
        atLocation = { id: loc.id, name: loc.name }
        console.log(`[geofence] Staff ${staffId} entered ${loc.name} (mode=${loc.geofence_mode || 'circle'})`)
      } else if (!isInside && openEntry && openEntry.source === 'gps') {
        // Left — close GPS entry (never auto-close manual entries)
        await supabase
          .from('location_time_entries')
          .update({ exited_at: new Date().toISOString() })
          .eq('id', openEntry.id)
        console.log(`[geofence] Staff ${staffId} exited ${loc.name}`)
      } else if (isInside && openEntry) {
        atLocation = { id: loc.id, name: loc.name }
      }
    }
  } catch (geoErr) {
    console.warn('[geofence] Error during location check:', geoErr)
  }

  // ── BACKGROUND GEOFENCE for assigned bookings & projects ──
  // The mobile app's foreground geofencer calls report_arrival explicitly,
  // but when the phone is locked / app is killed, only this report_location
  // path runs. Without this block, an assigned staff member can stand on a
  // jobsite for hours without ever being checked in (the Raivis case).
  //
  // Quality gates (mirror foreground): accuracy ≤ 50m, speed ≤ 1.5 m/s.
  // Range: ≤ 100m. Auto-checkin for assigned targets only — unassigned
  // arrivals continue to require an explicit prompt (handled by the
  // foreground hook so the user gets a real dialog).
  try {
    const goodAccuracy = accuracy == null || accuracy <= 50
    const stationary = speed == null || speed <= 1.5
    if (goodAccuracy && stationary) {
      const today = new Date().toISOString().split('T')[0]

      // Pull today's assigned bookings (with coords). Projects are derived from
      // the SAME booking_staff_assignments — a staff member is only auto-checked
      // into a large project on a day they actually have an assignment to one of
      // its bookings. Membership in `large_project_staff` alone is NOT enough,
      // otherwise people get checked in to projects/warehouses at night just for
      // being on the team roster.
      const { data: bsaRows } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id, bookings:booking_id(id, delivery_latitude, delivery_longitude, large_project_id, large_projects:large_project_id(id, address_latitude, address_longitude))')
        .eq('staff_id', staffId)
        .eq('assignment_date', today)

      type Target =
        | { kind: 'booking'; id: string; lat: number; lng: number }
        | { kind: 'project'; id: string; lat: number; lng: number }
      const targets: Target[] = []
      const seen = new Set<string>()
      for (const r of (bsaRows || [])) {
        const b = r.bookings
        if (!b) continue
        // Booking address (only if no parent large project — otherwise the
        // large project address is authoritative for geofencing).
        if (!b.large_project_id && b.delivery_latitude != null && b.delivery_longitude != null) {
          const key = `b:${b.id}`
          if (!seen.has(key)) {
            seen.add(key)
            targets.push({ kind: 'booking', id: b.id, lat: b.delivery_latitude, lng: b.delivery_longitude })
          }
        }
        // Large project address — derived from today's booking assignment.
        const lp = b.large_projects
        if (lp?.address_latitude != null && lp?.address_longitude != null) {
          const key = `p:${lp.id}`
          if (!seen.has(key)) {
            seen.add(key)
            targets.push({ kind: 'project', id: lp.id, lat: lp.address_latitude, lng: lp.address_longitude })
          }
        }
      }

      const ENTER_RADIUS_M = 100
      for (const t of targets) {
        const dist = haversineMeters(latitude, longitude, t.lat, t.lng)
        if (dist > ENTER_RADIUS_M) continue

        // Idempotent: skip if there's already an open entry for this target today.
        let openQuery = supabase
          .from('location_time_entries')
          .select('id')
          .eq('staff_id', staffId)
          .eq('entry_date', today)
          .is('exited_at', null)
        if (t.kind === 'booking') openQuery = openQuery.eq('booking_id', t.id)
        else openQuery = openQuery.eq('large_project_id', t.id)
        const { data: existingOpen } = await openQuery.limit(1).maybeSingle()
        if (existingOpen) continue

        // Close any other open entries (e.g. lager) so we don't double-count.
        const nowIso = new Date().toISOString()
        const { data: otherOpen } = await supabase
          .from('location_time_entries')
          .select('id, entered_at')
          .eq('staff_id', staffId)
          .is('exited_at', null)
          .lt('entered_at', nowIso)
        for (const row of (otherOpen || [])) {
          const minutes = Math.max(0, Math.round(
            (Date.now() - new Date(row.entered_at).getTime()) / 60000
          ))
          await supabase
            .from('location_time_entries')
            .update({ exited_at: nowIso, total_minutes: minutes })
            .eq('id', row.id)
            .is('exited_at', null)
        }

        const insertPayload: any = {
          organization_id: organizationId,
          staff_id: staffId,
          entry_date: today,
          entered_at: nowIso,
          source: 'auto_assigned_bg',
        }
        if (t.kind === 'booking') insertPayload.booking_id = t.id
        else insertPayload.large_project_id = t.id

        const { error: insErr } = await supabase
          .from('location_time_entries')
          .insert(insertPayload)
        if (insErr) {
          console.warn(`[bg-geofence] Failed to auto-checkin ${t.kind} ${t.id}:`, insErr)
        } else {
          console.log(`[bg-geofence] AUTO check-in ${t.kind}=${t.id} staff=${staffId} dist=${Math.round(dist)}m`)
          // Resolve any pending prompt for the same target so the UI stays clean.
          await supabase
            .from('arrival_prompt_log')
            .update({ resolved: true, resolved_at: nowIso })
            .eq('staff_id', staffId)
            .eq('target_type', t.kind)
            .eq('target_id', t.id)
            .eq('resolved', false)
        }
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
//   4. Geofence side-effects are intentionally NOT run here — the foreground
//      `report_location` path remains the single source for arrival prompts.
//      Replaying a 4-hour-old GPS trail must not retroactively trigger
//      arrival/exit logic.
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
    valid.push({
      id,
      latitude: p.latitude,
      longitude: p.longitude,
      accuracy: typeof p.accuracy === 'number' ? p.accuracy : null,
      speed: typeof p.speed === 'number' ? p.speed : null,
      source: typeof p.source === 'string' ? p.source : null,
      recordedAt,
      recordedMs,
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

  return new Response(
    JSON.stringify({
      success: true,
      accepted,
      rejected,
      received: accepted.length,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}

// ── ORGANIZATION LOCATIONS HANDLERS ──

async function handleGetOrganizationLocations(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('id, name, address, latitude, longitude, radius_meters, show_as_project, geofence_mode, geofence_polygon')
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

async function handleStartLocationTimer(supabase: any, staffId: string, data: any, organizationId: string) {
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

  return new Response(
    JSON.stringify({ success: true, entry }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ==================== LAGER (INTERNAL PROJECT) TASKS ====================

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
  const today = new Date().toISOString().split('T')[0]

  // Get staff with 'Lager' tag
  const { data: staffMembers, error: sErr } = await supabase
    .from('staff_members')
    .select('id, name, phone, email, role, color, tags')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .contains('tags', ['Lager'])

  if (sErr) {
    console.error('Get lager team — staff err:', sErr)
    return new Response(JSON.stringify({ team: [] }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: activations } = await supabase
    .from('warehouse_staff_activations')
    .select('*')
    .eq('organization_id', organizationId)

  const actMap = new Map((activations || []).map((a: any) => [a.staff_id, a]))

  const team = (staffMembers || []).filter((s: any) => {
    const a = actMap.get(s.id)
    if (!a || !a.is_active) return false
    if (a.activation_type === 'permanent') return true
    if (a.activation_type === 'temporary') {
      const start = a.start_date || today
      const end = a.end_date
      return today >= start && (!end || today <= end)
    }
    return false
  }).map((s: any) => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    role: s.role,
    color: s.color,
  }))

  return new Response(
    JSON.stringify({ team }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

async function handleStopLocationTimer(supabase: any, staffId: string, data: any, organizationId: string) {
  const { location_id, booking_id, large_project_id, entry_id } = data || {}

  let query = supabase
    .from('location_time_entries')
    .update({ exited_at: new Date().toISOString() })
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

  return new Response(
    JSON.stringify({ success: true, entry: updated }),
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

async function handleGetLocationTimeEntries(supabase: any, staffId: string, data: any, organizationId: string) {
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

  const { data: log, error } = await supabase
    .from('travel_time_logs')
    .insert({
      staff_id: staffId,
      organization_id: organizationId,
      report_date: new Date().toISOString().split('T')[0],
      start_time: new Date().toISOString(),
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

  // Get the existing log to calculate hours
  const { data: existing, error: fetchError } = await supabase
    .from('travel_time_logs')
    .select('start_time')
    .eq('id', travel_log_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .single()

  if (fetchError || !existing) {
    return new Response(
      JSON.stringify({ error: 'Travel log not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const endTime = new Date()
  const startTime = new Date(existing.start_time)
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
    .eq('id', travel_log_id)
    .eq('staff_id', staffId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    console.error('Stop travel log error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to stop travel log' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(
    `Travel log stopped: ${travel_log_id}, hours: ${hoursWorked}, ` +
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

  // C6: Authorization. A user may always look up their OWN movement.
  // For OTHERS' movement, require that the calling staff member is mapped to a user
  // with the 'admin' role.
  if (staff_id !== callerStaffId) {
    const { data: callerStaff } = await supabase
      .from('staff_members')
      .select('user_id')
      .eq('id', callerStaffId)
      .single()

    let isAdmin = false
    if (callerStaff?.user_id) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', callerStaff.user_id)
        .eq('role', 'admin')
        .maybeSingle()
      isAdmin = !!roleRow
    }

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden: admin role required to view other staff movement' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // Day window in Europe/Stockholm; simplified to UTC day for indexing speed
  const fromIso = `${date}T00:00:00.000Z`
  const toIso = `${date}T23:59:59.999Z`

  const { data: rows, error } = await supabase
    .from('staff_location_history')
    .select('lat, lng, accuracy, speed, recorded_at')
    .eq('staff_id', staff_id)
    .eq('organization_id', organizationId)
    .gte('recorded_at', fromIso)
    .lte('recorded_at', toIso)
    .order('recorded_at', { ascending: true })
    .limit(5000)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({ points: rows || [] }),
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

  // ── OPTIMISTIC AUTO-CHECKIN ──
  // Unified rule: if the staff member is *assigned* to this booking/project
  // today (BSA row exists), treat the arrival like a fixed-location entry —
  // create a location_time_entries row directly instead of asking. Admin can
  // edit/delete afterwards if it was wrong. Locations remain auto-checkin via
  // the report_location flow; here we extend the same behavior to assigned
  // bookings and projects.
  if (kind === 'booking' || kind === 'project') {
    try {
      const today = new Date().toISOString().split('T')[0]
      let isAssigned = false
      let bookingIdForEntry: string | null = null
      let largeProjectIdForEntry: string | null = null

      if (kind === 'booking') {
        const { data: bsa } = await supabase
          .from('booking_staff_assignments')
          .select('id')
          .eq('staff_id', staffId)
          .eq('booking_id', targetId)
          .eq('assignment_date', today)
          .limit(1)
          .maybeSingle()
        isAssigned = !!bsa
        bookingIdForEntry = targetId
      } else {
        // project (large_project) — assignment is tracked via large_project_staff
        const { data: lps } = await supabase
          .from('large_project_staff')
          .select('id')
          .eq('staff_id', staffId)
          .eq('large_project_id', targetId)
          .limit(1)
          .maybeSingle()
        isAssigned = !!lps
        largeProjectIdForEntry = targetId
      }

      if (isAssigned) {
        // Idempotent: skip if there is already an open entry for this target today.
        let openQuery = supabase
          .from('location_time_entries')
          .select('id')
          .eq('staff_id', staffId)
          .eq('entry_date', today)
          .is('exited_at', null)
        if (bookingIdForEntry) openQuery = openQuery.eq('booking_id', bookingIdForEntry)
        if (largeProjectIdForEntry) openQuery = openQuery.eq('large_project_id', largeProjectIdForEntry)
        const { data: openEntry } = await openQuery.limit(1).maybeSingle()

        if (openEntry) {
          return new Response(JSON.stringify({
            success: true, auto_checkin: true, idempotent: true, entry_id: openEntry.id,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Close any other open entries (e.g. lager) so we don't double-count.
        const { data: otherOpen } = await supabase
          .from('location_time_entries')
          .select('id, entered_at')
          .eq('staff_id', staffId)
          .is('exited_at', null)
          .lt('entered_at', arrivedAt)
        for (const row of (otherOpen || [])) {
          const minutes = Math.max(0, Math.round(
            (new Date(arrivedAt).getTime() - new Date(row.entered_at).getTime()) / 60000
          ))
          await supabase
            .from('location_time_entries')
            .update({ exited_at: arrivedAt, total_minutes: minutes })
            .eq('id', row.id)
            .is('exited_at', null)
        }

        const insertPayload: any = {
          organization_id: organizationId,
          staff_id: staffId,
          entry_date: today,
          entered_at: arrivedAt,
          source: 'auto_assigned',
        }
        if (bookingIdForEntry) insertPayload.booking_id = bookingIdForEntry
        if (largeProjectIdForEntry) insertPayload.large_project_id = largeProjectIdForEntry

        const { data: created, error: insErr } = await supabase
          .from('location_time_entries')
          .insert(insertPayload)
          .select('id')
          .maybeSingle()

        if (insErr) {
          console.error('[report_arrival] auto-checkin insert failed, falling back to prompt:', insErr)
          // fall through to prompt-log path below
        } else {
          console.log(`[report_arrival] AUTO check-in for assigned ${kind} ${targetId} (staff=${staffId}, entry=${created?.id})`)
          // Mark any pending prompt for the same target as resolved so the
          // mobile UI doesn't show a stale "Anlände — checka in?" dialog.
          await supabase
            .from('arrival_prompt_log')
            .update({ resolved: true, resolved_at: new Date().toISOString() })
            .eq('staff_id', staffId)
            .eq('target_type', kind)
            .eq('target_id', targetId)
            .eq('resolved', false)
          return new Response(JSON.stringify({
            success: true, auto_checkin: true, entry_id: created?.id,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }
    } catch (autoErr) {
      console.warn('[report_arrival] auto-checkin path errored, falling back to prompt:', autoErr)
    }
  }

  // ── FALLBACK: arrival_prompt_log (unassigned arrivals) ──
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

  return new Response(JSON.stringify({ success: true, arrival: inserted }),
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
    .update({ exited_at: new Date().toISOString() })
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
          .update({ exited_at: chosen.toISOString(), total_minutes: minutes })
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
