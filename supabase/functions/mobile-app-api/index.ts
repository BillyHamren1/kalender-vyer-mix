import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Simple token generation using HMAC-like approach
const TOKEN_SECRET = Deno.env.get('STAFF_SECRET_KEY') || 'default-secret-key'
const TOKEN_EXPIRY_HOURS = 24

function generateToken(staffId: string): string {
  const timestamp = Date.now()
  const expiresAt = timestamp + (TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)
  const payload = { staffId, timestamp, expiresAt }
  return btoa(JSON.stringify(payload))
}

function verifyToken(token: string): { valid: boolean; staffId?: string; error?: string } {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) {
      return { valid: false, error: 'Invalid token format' }
    }
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Token expired' }
    }
    return { valid: true, staffId: payload.staffId }
  } catch {
    return { valid: false, error: 'Invalid token' }
  }
}

// Simple Base64 password comparison (matching existing staff_accounts format)
function verifyPassword(inputPassword: string, storedHash: string): boolean {
  const inputHash = btoa(inputPassword)
  return inputHash === storedHash
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

Deno.serve(async (req) => {
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

    // All other actions require valid token
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tokenResult = verifyToken(token)
    if (!tokenResult.valid) {
      return new Response(
        JSON.stringify({ error: tokenResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const staffId = tokenResult.staffId!

    // Resolve organization_id from the authenticated staff member
    const { data: staffOrg } = await supabase
      .from('staff_members')
      .select('organization_id, user_id')
      .eq('id', staffId)
      .single()

    const organizationId = staffOrg?.organization_id
    if (!organizationId) {
      console.error(`[mobile-app-api] Staff ${staffId} has no organization_id`)
      return new Response(
        JSON.stringify({ error: 'Staff member not associated with an organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[mobile-app-api] Staff ${staffId} org: ${organizationId}`)

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
      case 'mark_dm_read':
        return await handleMarkDMRead(supabase, staffId, data, organizationId, staffOrg?.user_id || null)
      case 'get_job_messages':
        return await handleGetJobMessages(supabase, staffId, data, organizationId)
      case 'send_job_message':
        return await handleSendJobMessage(supabase, staffId, data, organizationId)
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
      case 'create_travel_log':
        return await handleStartTravelLog(supabase, staffId, data, organizationId)
      case 'stop_travel_log':
        return await handleStopTravelLog(supabase, staffId, data, organizationId)
      case 'update_travel_log':
        return await handleUpdateTravelLog(supabase, staffId, data, organizationId)
      case 'get_travel_logs':
        return await handleGetTravelLogs(supabase, staffId, data, organizationId)
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

  return new Response(
    JSON.stringify({ bookings: bookingsWithAssignments }),
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
  const conversations = new Map<string, { partner_id: string; partner_name: string; last_message: any; unread_count: number; messages: any[] }>()
  for (const msg of (dmResult.data || [])) {
    const isSender = myIds.has(msg.sender_id)
    const partnerId = isSender ? msg.recipient_id : msg.sender_id
    const partnerName = isSender ? msg.recipient_name : msg.sender_name
    if (!conversations.has(partnerId)) {
      conversations.set(partnerId, { partner_id: partnerId, partner_name: partnerName, last_message: msg, unread_count: 0, messages: [] })
    }
    const conv = conversations.get(partnerId)!
    conv.messages.push(msg)
    if (!msg.is_read && !isSender) conv.unread_count++
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

  // --- Process Job bookings ---
  let jobBookings: any[] = []
  const jobAssignmentData = jobAssignments.data || []
  if (jobAssignmentData.length > 0) {
    const bookingIds = [...new Set(jobAssignmentData.map((a: any) => a.booking_id))]
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, client, status, rigdaydate, eventdate, rigdowndate')
      .in('id', bookingIds)
      .in('status', ['CONFIRMED', 'COMPLETED'])
      .order('rigdaydate', { ascending: false })
    jobBookings = bookings || []
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

  // Flatten large_project info for easier frontend consumption
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

  // Determine final values for validation
  const finalStartTime = start_time !== undefined ? start_time : existing.start_time
  const finalEndTime = end_time !== undefined ? end_time : existing.end_time
  const finalBreak = break_time !== undefined ? parseInt(break_time) : (existing.break_time || 0)
  const finalOvertime = overtime_hours !== undefined ? parseFloat(overtime_hours) : (existing.overtime_hours || 0)

  // Validate break
  if (isNaN(finalBreak) || finalBreak < 0) {
    return new Response(
      JSON.stringify({ error: 'Rast kan inte vara negativ' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
  if (finalBreak > 240) {
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
  if (finalOvertime > 6) {
    return new Response(
      JSON.stringify({ error: 'Övertid kan inte överstiga 6 timmar' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Server-side hours calculation when start/end are available
  let calculatedHours: number | null = null
  if (finalStartTime && finalEndTime) {
    if (finalEndTime <= finalStartTime) {
      return new Response(
        JSON.stringify({ error: 'Sluttid måste vara efter starttid' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const [sh, sm] = finalStartTime.split(':').map(Number)
    const [eh, em] = finalEndTime.split(':').map(Number)
    let rawHours = (eh + em / 60) - (sh + sm / 60)
    if (rawHours < 0) rawHours += 24
    const breakHours = finalBreak / 60
    calculatedHours = Math.round((rawHours - breakHours) * 100) / 100

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

  // Overlap check for update — use final start/end times (already computed above)

  if (finalStartTime && finalEndTime) {
    const { data: overlapping } = await supabase
      .from('time_reports')
      .select('id, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('report_date', existing.report_date)
      .neq('id', time_report_id)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)

    const hasOverlap = (overlapping || []).some((r: any) => {
      return r.start_time < finalEndTime && r.end_time > finalStartTime
    })

    if (hasOverlap) {
      return new Response(
        JSON.stringify({ error: 'Du har redan en tidrapport som överlappar detta tidsintervall' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

  // Overlap check before creating
  if (start_time && end_time) {
    const { data: overlapping } = await supabase
      .from('time_reports')
      .select('id, start_time, end_time')
      .eq('staff_id', staffId)
      .eq('report_date', report_date)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null)

    const hasOverlap = (overlapping || []).some((r: any) => {
      return r.start_time < end_time && r.end_time > start_time
    })

    if (hasOverlap) {
      return new Response(
        JSON.stringify({ error: 'Du har redan en tidrapport som överlappar detta tidsintervall' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

  // Fetch establishment tasks assigned to this staff member for this booking
  // Primary: assigned_to_ids (array contains staffId)
  // Fallback: legacy assigned_to (single field)
  const { data: rawEstablishmentTasks } = await supabase
    .from('establishment_tasks')
    .select('id, title, category, start_date, end_date, completed, notes, sort_order, assigned_to, assigned_to_ids, start_time, end_time, status')
    .eq('booking_id', booking_id)
    .or(`assigned_to_ids.cs.{${staffId}},assigned_to.eq.${staffId}`)
    .order('start_date', { ascending: true })
    .order('sort_order', { ascending: true })

  // SAFEGUARD: Normalize tasks — ensure assigned_to_ids is always populated,
  // fix legacy tasks that only have assigned_to, and sync completed/status
  const establishmentTasks = (rawEstablishmentTasks || []).map((task: any) => {
    const needsFix: Record<string, any> = {}

    // Fix 1: Legacy task with assigned_to but empty/missing assigned_to_ids
    if (task.assigned_to && (!task.assigned_to_ids || task.assigned_to_ids.length === 0)) {
      needsFix.assigned_to_ids = [task.assigned_to]
      task.assigned_to_ids = [task.assigned_to]
      console.log(`[safeguard] Task ${task.id}: backfilled assigned_to_ids from assigned_to`)
    }

    // Fix 2: completed/status mismatch
    if (task.completed && task.status !== 'done') {
      needsFix.status = 'done'
      task.status = 'done'
      console.log(`[safeguard] Task ${task.id}: synced status to 'done'`)
    } else if (!task.completed && task.status === 'done') {
      needsFix.status = 'not_started'
      task.status = 'not_started'
      console.log(`[safeguard] Task ${task.id}: synced status to 'not_started'`)
    }

    // Apply fixes asynchronously (fire-and-forget, don't block response)
    if (Object.keys(needsFix).length > 0) {
      supabase.from('establishment_tasks').update(needsFix).eq('id', task.id).then(() => {})
    }

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

async function handleGetJobMessages(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: messages, error } = await supabase
    .from('job_messages')
    .select('*')
    .eq('booking_id', booking_id)
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) {
    console.error('Get job messages error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch job messages' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ messages: messages || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSendJobMessage(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id, content } = data

  if (!booking_id || !content?.trim()) {
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
      content: content.trim(),
      organization_id: organizationId,
    })
    .select()
    .single()

  if (error) {
    console.error('Send job message error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to send job message' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, message }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
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

async function handleSendDirectMessage(supabase: any, staffId: string, data: any, organizationId: string, userId: string | null) {
  const { recipient_id, content } = data

  if (!recipient_id || !content?.trim()) {
    return new Response(
      JSON.stringify({ error: 'recipient_id and content are required' }),
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

  // Get recipient name — check staff_members first, then profiles (for planners using auth user id)
  let recipientName = 'Planerare'
  const { data: recipientStaff } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', recipient_id)
    .eq('organization_id', organizationId)
    .single()

  if (recipientStaff) {
    recipientName = recipientStaff.name
  } else {
    // Might be a planner (auth user)
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('user_id', recipient_id)
      .single()
    if (profile) recipientName = profile.full_name || profile.email || 'Planerare'
  }

  const { data: message, error } = await supabase
    .from('direct_messages')
    .insert({
      sender_id: staffId,
      sender_name: senderName,
      sender_type: 'staff',
      recipient_id,
      recipient_name: recipientName,
      content: content.trim(),
      organization_id: organizationId,
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
      
      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          staff_ids: [recipient_id],
          title: `Meddelande från ${senderName}`,
          body: content.trim().substring(0, 100),
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

  const markPromises = ids.map(myId =>
    supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('recipient_id', myId)
      .eq('sender_id', sender_id)
      .eq('organization_id', organizationId)
      .eq('is_read', false)
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

  const { error } = await supabase
    .from('device_tokens')
    .upsert({
      staff_id: staffId,
      token: push_token,
      platform: platform || 'android',
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'staff_id,token' })

  if (error) {
    console.error('[mobile-app-api] [register_push_token] failed:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to register push token' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`[mobile-app-api] [register_push_token] success staff=${staffId}`)
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

  // ── GEOFENCE CHECK for organization_locations ──
  let atLocation: { id: string; name: string } | null = null
  try {
    const { data: orgLocations } = await supabase
      .from('organization_locations')
      .select('id, name, latitude, longitude, radius_meters')
      .eq('organization_id', organizationId)
      .eq('is_active', true)

    for (const loc of (orgLocations || [])) {
      const dist = haversineMeters(latitude, longitude, loc.latitude, loc.longitude)
      const isInside = dist <= loc.radius_meters

      // Check for open GPS entry at this location
      const { data: openEntry } = await supabase
        .from('location_time_entries')
        .select('id')
        .eq('staff_id', staffId)
        .eq('location_id', loc.id)
        .eq('source', 'gps')
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
        console.log(`[geofence] Staff ${staffId} entered ${loc.name}`)
      } else if (!isInside && openEntry) {
        // Left — close GPS entry
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

  return new Response(
    JSON.stringify({ success: true, at_location: atLocation }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// ── ORGANIZATION LOCATIONS HANDLERS ──

async function handleGetOrganizationLocations(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('organization_locations')
    .select('id, name, address, latitude, longitude, radius_meters, show_as_project')
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
  const { location_id, task_id } = data || {}
  if (!location_id) {
    return new Response(
      JSON.stringify({ error: 'location_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Check no open entry already exists for this location
  const { data: existing } = await supabase
    .from('location_time_entries')
    .select('*')
    .eq('staff_id', staffId)
    .eq('location_id', location_id)
    .is('exited_at', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    // Upgrade GPS entry to manual (user confirmed) if needed
    const updates: any = {}
    if (existing.source === 'gps') updates.source = 'manual'
    if (task_id && !existing.task_id) updates.task_id = task_id
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

  const { data: entry, error } = await supabase
    .from('location_time_entries')
    .insert({
      organization_id: organizationId,
      staff_id: staffId,
      location_id: location_id,
      task_id: task_id || null,
      entry_date: new Date().toISOString().split('T')[0],
      entered_at: new Date().toISOString(),
      source: 'manual',
    })
    .select()
    .single()

  if (error) {
    console.error('Start location timer error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to start location timer' }),
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
  const { location_id, entry_id } = data || {}

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
  } else {
    return new Response(
      JSON.stringify({ error: 'location_id or entry_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const { data: updated, error } = await query.select().order('entered_at', { ascending: false }).limit(1).maybeSingle()

  if (error) {
    console.error('Stop location timer error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to stop location timer' }),
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

  console.log(`Travel log stopped: ${travel_log_id}, hours: ${hoursWorked}, matchedBooking: ${destinationBookingId}`)

  return new Response(
    JSON.stringify({ success: true, travel_log: updated }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
async function handleGetContacts(supabase: any, staffId: string, organizationId: string) {
  // Get all staff in the org except self
  const { data: staffMembers, error: staffErr } = await supabase
    .from('staff_members')
    .select('id, name')
    .eq('organization_id', organizationId)
    .neq('id', staffId)

  if (staffErr) {
    console.error('Get contacts staff error:', staffErr)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch contacts' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get planners (profiles) in the org
  const { data: planners, error: plannerErr } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .eq('organization_id', organizationId)

  if (plannerErr) {
    console.error('Get contacts planners error:', plannerErr)
  }

  const contacts: { id: string; name: string; type: string }[] = []

  for (const s of (staffMembers || [])) {
    contacts.push({ id: s.id, name: s.name, type: 'staff' })
  }

  for (const p of (planners || [])) {
    if (p.full_name && p.user_id) {
      contacts.push({ id: p.user_id, name: p.full_name, type: 'planner' })
    }
  }

  // Sort alphabetically
  contacts.sort((a, b) => a.name.localeCompare(b.name, 'sv'))

  return new Response(
    JSON.stringify({ contacts }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
