import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const organizationId = await resolveOrganizationId(supabase, body?.organization_id)

    const body = await req.json()
    const { action, token, data } = body

    console.log(`Mobile API action: ${action}`)

    // Actions that don't require authentication
    if (action === 'login') {
      return await handleLogin(supabase, data)
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

    // Route to appropriate handler
    switch (action) {
      case 'me':
        return await handleMe(supabase, staffId)
      case 'get_bookings':
        return await handleGetBookings(supabase, staffId)
      case 'get_booking_details':
        return await handleGetBookingDetails(supabase, staffId, data)
      case 'get_time_reports':
        return await handleGetTimeReports(supabase, staffId)
      case 'create_time_report':
        return await handleCreateTimeReport(supabase, staffId, data, organizationId)
      case 'get_project':
        return await handleGetProject(supabase, data)
      case 'get_project_comments':
        return await handleGetProjectComments(supabase, data)
      case 'get_project_files':
        return await handleGetProjectFiles(supabase, data)
      case 'get_project_purchases':
        return await handleGetProjectPurchases(supabase, data)
      case 'create_purchase':
        return await handleCreatePurchase(supabase, staffId, data, organizationId)
      case 'create_comment':
        return await handleCreateComment(supabase, staffId, data, organizationId)
      case 'upload_file':
        return await handleUploadFile(supabase, staffId, data, organizationId)
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

async function handleLogin(supabase: any, data: { username?: string; password: string; email?: string }) {
  const { password } = data
  const identifier = data.email || data.username

  if (!identifier || !password) {
    return new Response(
      JSON.stringify({ error: 'Email/username and password required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const normalizedIdentifier = identifier.trim().toLowerCase()
  let account: any = null

  // Check if identifier looks like an email
  const isEmail = normalizedIdentifier.includes('@')

  if (isEmail) {
    // Find staff member by email first, then get their account
    const { data: staffByEmail, error: emailError } = await supabase
      .from('staff_members')
      .select('id')
      .eq('email', normalizedIdentifier)
      .maybeSingle()

    if (emailError) {
      console.error('Email lookup error:', emailError)
      return new Response(
        JSON.stringify({ error: 'Login failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (staffByEmail) {
      const { data: acctByStaff, error: acctError } = await supabase
        .from('staff_accounts')
        .select('staff_id, username, password_hash')
        .eq('staff_id', staffByEmail.id)
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
  } else {
    // Legacy username-based lookup
    const { data: acctByUsername, error: accountError } = await supabase
      .from('staff_accounts')
      .select('staff_id, username, password_hash')
      .eq('username', normalizedIdentifier)
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

async function handleMe(supabase: any, staffId: string) {
  const { data: staffMember, error } = await supabase
    .from('staff_members')
    .select('id, name, email, phone, role, department, hourly_rate, overtime_rate')
    .eq('id', staffId)
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

async function handleGetBookings(supabase: any, staffId: string) {
  // Get all booking assignments for this staff member
  const { data: assignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, assignment_date, team_id')
    .eq('staff_id', staffId)
    .gte('assignment_date', new Date().toISOString().split('T')[0]) // Only future/current dates

  if (assignmentError) {
    console.error('Assignment query error:', assignmentError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch assignments' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!assignments || assignments.length === 0) {
    return new Response(
      JSON.stringify({ bookings: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get unique booking IDs
  const bookingIds = [...new Set(assignments.map((a: any) => a.booking_id))]

  // Fetch booking details
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
      assigned_project_name
    `)
    .in('id', bookingIds)
    .eq('status', 'CONFIRMED')
    .order('rigdaydate', { ascending: true })

  if (bookingsError) {
    console.error('Bookings query error:', bookingsError)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch bookings' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Add assignment dates to bookings
  const bookingsWithAssignments = bookings?.map((booking: any) => {
    const bookingAssignments = assignments.filter((a: any) => a.booking_id === booking.id)
    return {
      ...booking,
      assignment_dates: bookingAssignments.map((a: any) => a.assignment_date)
    }
  })

  return new Response(
    JSON.stringify({ bookings: bookingsWithAssignments || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetTimeReports(supabase: any, staffId: string) {
  const { data: reports, error } = await supabase
    .from('time_reports')
    .select(`
      id,
      booking_id,
      report_date,
      start_time,
      end_time,
      hours_worked,
      overtime_hours,
      break_time,
      description,
      created_at,
      bookings (
        id,
        client,
        booking_number
      )
    `)
    .eq('staff_id', staffId)
    .order('report_date', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Time reports query error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch time reports' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ time_reports: reports || [] }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCreateTimeReport(supabase: any, staffId: string, data: any, organizationId: string) {
  const { booking_id, report_date, start_time, end_time, hours_worked, overtime_hours, break_time, description } = data

  if (!booking_id || !report_date || hours_worked === undefined) {
    return new Response(
      JSON.stringify({ error: 'booking_id, report_date, and hours_worked are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

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

  // Create time report
  const { data: report, error } = await supabase
    .from('time_reports')
    .insert({
      staff_id: staffId,
      booking_id,
      report_date,
      start_time: start_time || null,
      end_time: end_time || null,
      hours_worked: parseFloat(hours_worked),
      overtime_hours: overtime_hours ? parseFloat(overtime_hours) : 0,
      break_time: break_time ? parseFloat(break_time) : 0,
      description: description || null,
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

  console.log(`Time report created: ${report.id} by staff ${staffId}`)

  return new Response(
    JSON.stringify({ success: true, time_report: report }),
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProject(supabase: any, data: { booking_id: string }) {
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
    const storagePath = `${project.id}/${Date.now()}-${sanitizedName}`

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

    // Create file record
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
  } catch (err) {
    console.error('File processing error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to process file' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// ==================== COMPREHENSIVE JOB DETAILS HANDLER ====================

async function handleGetBookingDetails(supabase: any, staffId: string, data: { booking_id: string }) {
  const { booking_id } = data

  if (!booking_id) {
    return new Response(
      JSON.stringify({ error: 'booking_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

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
    my_time_reports: myTimeReports || []
  }

  console.log(`Booking details fetched: ${booking_id} for staff ${staffId}`)

  return new Response(
    JSON.stringify(response),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetProjectComments(supabase: any, data: { booking_id: string }) {
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

async function handleGetProjectFiles(supabase: any, data: { booking_id: string }) {
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

async function handleGetProjectPurchases(supabase: any, data: { booking_id: string }) {
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