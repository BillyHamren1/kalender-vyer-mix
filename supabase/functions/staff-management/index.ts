import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

interface StaffAssignment {
  id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
  staff_members?: StaffMember;
}

interface BookingStaffAssignment {
  id: string;
  booking_id: string;
  staff_id: string;
  team_id: string;
  assignment_date: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  resourceId: string;
  teamId?: string;
  bookingId?: string;
  eventType: 'assignment' | 'booking_event';
  backgroundColor?: string;
  borderColor?: string;
  client?: string;
  extendedProps?: any;
}

interface OperationResponse {
  success: boolean;
  data?: any;
  error?: string;
  conflicts?: any[];
  affected_staff?: string[];
}

interface StaffExportData {
  uuid: string;
  name: string;
  email: string;
  password_hash: string;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { operation, data, options = {} } = await req.json()
    console.log(`Staff Management: Processing operation: ${operation}`, data)

    let response: OperationResponse

    switch (operation) {
      case 'get_staff_members':
        response = await getStaffMembers(supabase)
        break
      
      case 'sync_staff_member':
        response = await syncStaffMember(supabase, data)
        break
      
      case 'create_staff_member':
        response = await createStaffMember(supabase, data)
        break
      
      case 'get_staff_assignments':
        response = await getStaffAssignments(supabase, data.date, data.team_id)
        break
      
      case 'assign_staff_to_team':
        response = await assignStaffToTeam(supabase, data.staff_id, data.team_id, data.date)
        break
      
      case 'remove_staff_assignment':
        response = await removeStaffAssignment(supabase, data.staff_id, data.date)
        break
      
      case 'get_available_staff':
        response = await getAvailableStaff(supabase, data.date)
        break
      
      case 'get_staff_calendar_events':
        response = await getStaffCalendarEvents(supabase, data.staff_ids, data.start_date, data.end_date)
        break
      
      case 'assign_staff_to_booking':
        response = await assignStaffToBooking(supabase, data.booking_id, data.staff_id, data.team_id, data.date)
        break
      
      case 'remove_staff_from_booking':
        response = await removeStaffFromBooking(supabase, data.booking_id, data.staff_id, data.date)
        break
      
      case 'handle_booking_move':
        response = await handleBookingMove(supabase, data.booking_id, data.old_team_id, data.new_team_id, data.old_date, data.new_date)
        break
      
      case 'bulk_assign_staff':
        response = await bulkAssignStaff(supabase, data.assignments)
        break
      
      case 'get_staff_summary':
        response = await getStaffSummary(supabase, data.staff_ids, data.date)
        break
      
      case 'export_staff_to_external':
        response = await exportStaffToExternal(supabase, data.external_url, data.staff_ids, options)
        break
      
      default:
        response = { success: false, error: `Unknown operation: ${operation}` }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Staff Management Error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    })
  }
})

// Staff CRUD Operations
async function getStaffMembers(supabase: any): Promise<OperationResponse> {
  try {
    const { data, error } = await supabase
      .from('staff_members')
      .select('*')
      .order('name')

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function syncStaffMember(supabase: any, staffData: any): Promise<OperationResponse> {
  try {
    const { data, error } = await supabase
      .from('staff_members')
      .upsert({
        id: staffData.id,
        name: staffData.name,
        email: staffData.email,
        phone: staffData.phone
      }, {
        onConflict: 'id'
      })
      .select()

    if (error) {
      // Handle unique constraint errors
      if (error.code === '23505' && error.message.includes('email')) {
        const { error: updateError } = await supabase
          .from('staff_members')
          .update({
            name: staffData.name,
            phone: staffData.phone
          })
          .eq('email', staffData.email)

        if (updateError) throw updateError
        return { success: true, data: staffData }
      }
      throw error
    }

    return { success: true, data: data?.[0] || staffData }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function createStaffMember(supabase: any, staffData: any): Promise<OperationResponse> {
  try {
    const id = `staff_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const { data, error } = await supabase
      .from('staff_members')
      .insert({
        id,
        name: staffData.name,
        email: staffData.email,
        phone: staffData.phone
      })
      .select()
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Assignment Operations
async function getStaffAssignments(supabase: any, date: string, teamId?: string): Promise<OperationResponse> {
  try {
    let query = supabase
      .from('staff_assignments')
      .select(`
        *,
        staff_members (
          id,
          name,
          email,
          phone
        )
      `)
      .eq('assignment_date', date)

    if (teamId) {
      query = query.eq('team_id', teamId)
    }

    const { data, error } = await query.order('created_at', { ascending: true })

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function assignStaffToTeam(supabase: any, staffId: string, teamId: string, date: string): Promise<OperationResponse> {
  try {
    // Start transaction
    const { data, error } = await supabase
      .from('staff_assignments')
      .upsert({
        staff_id: staffId,
        team_id: teamId,
        assignment_date: date
      }, {
        onConflict: 'staff_id,assignment_date'
      })
      .select()

    if (error) throw error

    // Auto-assign to bookings for this team on this date
    await autoAssignToBookings(supabase, staffId, teamId, date)

    return { success: true, data: data?.[0] }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function removeStaffAssignment(supabase: any, staffId: string, date: string): Promise<OperationResponse> {
  try {
    // Remove staff assignment
    const { error: assignmentError } = await supabase
      .from('staff_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('assignment_date', date)

    if (assignmentError) throw assignmentError

    // Remove booking assignments
    const { error: bookingError } = await supabase
      .from('booking_staff_assignments')
      .delete()
      .eq('staff_id', staffId)
      .eq('assignment_date', date)

    if (bookingError) throw bookingError

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function getAvailableStaff(supabase: any, date: string): Promise<OperationResponse> {
  try {
    // Get all staff members
    const { data: allStaff, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .order('name')

    if (staffError) throw staffError

    // Get assigned staff IDs for the date
    const { data: assignments, error: assignmentError } = await supabase
      .from('staff_assignments')
      .select('staff_id')
      .eq('assignment_date', date)

    if (assignmentError) throw assignmentError

    const assignedStaffIds = new Set(assignments?.map(a => a.staff_id) || [])
    const availableStaff = (allStaff || []).filter(staff => !assignedStaffIds.has(staff.id))

    return { success: true, data: availableStaff }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Calendar Operations - FIXED to properly validate staff assignments
async function getStaffCalendarEvents(supabase: any, staffIds: string[], startDate: string, endDate: string): Promise<OperationResponse> {
  try {
    if (!staffIds || staffIds.length === 0) {
      return { success: true, data: [] }
    }

    console.log(`Fetching calendar events for staff: ${staffIds.join(', ')} from ${startDate} to ${endDate}`)

    // Get staff names
    const { data: staffMembers, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name')
      .in('id', staffIds)

    if (staffError) throw staffError

    const staffMap = new Map(staffMembers?.map(staff => [staff.id, staff.name]) || [])

    // FIXED: Get staff assignments for the date range to validate actual assignments
    const { data: staffAssignments, error: assignmentError } = await supabase
      .from('staff_assignments')
      .select('staff_id, team_id, assignment_date')
      .in('staff_id', staffIds)
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate)

    if (assignmentError) throw assignmentError

    if (!staffAssignments || staffAssignments.length === 0) {
      console.log('No staff assignments found for the selected staff in the date range')
      return { success: true, data: [] }
    }

    // Create a map of staff assignments by date and team for quick lookup
    const assignmentMap = new Map<string, { staffId: string, teamId: string }>()
    staffAssignments.forEach(assignment => {
      const key = `${assignment.staff_id}-${assignment.assignment_date}-${assignment.team_id}`
      assignmentMap.set(key, {
        staffId: assignment.staff_id,
        teamId: assignment.team_id
      })
    })

    const events: CalendarEvent[] = []

    // Process each staff assignment and find corresponding calendar events
    for (const assignment of staffAssignments) {
      const staffName = staffMap.get(assignment.staff_id) || `Staff ${assignment.staff_id}`
      
      // Get calendar events for this team on this date
      const { data: calendarEvents, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('resource_id', assignment.team_id)
        .gte('start_time', `${assignment.assignment_date}T00:00:00`)
        .lt('start_time', `${assignment.assignment_date}T23:59:59`)

      if (eventsError) {
        console.error(`Error fetching calendar events for team ${assignment.team_id} on ${assignment.assignment_date}:`, eventsError)
        continue
      }

      if (calendarEvents && calendarEvents.length > 0) {
        for (const calendarEvent of calendarEvents) {
          // Only include events that have booking IDs (actual work assignments)
          if (calendarEvent.booking_id) {
            events.push({
              id: `staff-${assignment.staff_id}-event-${calendarEvent.id}`,
              title: calendarEvent.title,
              start: calendarEvent.start_time,
              end: calendarEvent.end_time,
              resourceId: assignment.staff_id,
              teamId: assignment.team_id,
              bookingId: calendarEvent.booking_id,
              eventType: 'booking_event',
              backgroundColor: getEventColor(calendarEvent.event_type || 'event'),
              borderColor: getEventBorderColor(calendarEvent.event_type || 'event'),
              client: extractClientFromTitle(calendarEvent.title),
              extendedProps: {
                bookingId: calendarEvent.booking_id,
                deliveryAddress: calendarEvent.delivery_address,
                bookingNumber: calendarEvent.booking_number,
                eventType: calendarEvent.event_type || 'booking_event',
                staffName: staffName,
                client: extractClientFromTitle(calendarEvent.title),
                teamName: `Team ${assignment.team_id.replace('team-', '')}`
              }
            })
          }
        }
      }
    }

    console.log(`Generated ${events.length} calendar events for staff view`)
    return { success: true, data: events }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Booking Assignment Operations
async function assignStaffToBooking(supabase: any, bookingId: string, staffId: string, teamId: string, date: string): Promise<OperationResponse> {
  try {
    // Check if staff is assigned to the team on that date
    const { data: staffAssignment, error: staffError } = await supabase
      .from('staff_assignments')
      .select('*')
      .eq('staff_id', staffId)
      .eq('team_id', teamId)
      .eq('assignment_date', date)
      .maybeSingle()

    if (staffError) throw staffError

    if (!staffAssignment) {
      return { 
        success: false, 
        error: `Staff ${staffId} is not assigned to team ${teamId} on ${date}` 
      }
    }

    // Insert the booking-staff assignment
    const { data, error } = await supabase
      .from('booking_staff_assignments')
      .insert({
        booking_id: bookingId,
        staff_id: staffId,
        team_id: teamId,
        assignment_date: date
      })
      .select()

    if (error) throw error

    return { success: true, data: data?.[0] }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function removeStaffFromBooking(supabase: any, bookingId: string, staffId: string, date: string): Promise<OperationResponse> {
  try {
    const { error } = await supabase
      .from('booking_staff_assignments')
      .delete()
      .eq('booking_id', bookingId)
      .eq('staff_id', staffId)
      .eq('assignment_date', date)

    if (error) throw error

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

async function handleBookingMove(supabase: any, bookingId: string, oldTeamId: string, newTeamId: string, oldDate: string, newDate: string): Promise<OperationResponse> {
  try {
    // Get staff who were assigned to this booking
    const { data: oldAssignments, error: oldError } = await supabase
      .from('booking_staff_assignments')
      .select('staff_id')
      .eq('booking_id', bookingId)
      .eq('assignment_date', oldDate)

    if (oldError) throw oldError

    const affectedStaff = oldAssignments?.map(a => a.staff_id) || []
    const conflicts: any[] = []

    // Remove old assignments
    const { error: deleteError } = await supabase
      .from('booking_staff_assignments')
      .delete()
      .eq('booking_id', bookingId)
      .eq('assignment_date', oldDate)

    if (deleteError) throw deleteError

    // Check for conflicts and available staff on new date/team
    for (const staffId of affectedStaff) {
      const { data: newAssignment, error: checkError } = await supabase
        .from('staff_assignments')
        .select('*')
        .eq('staff_id', staffId)
        .eq('team_id', newTeamId)
        .eq('assignment_date', newDate)
        .maybeSingle()

      if (checkError) throw checkError

      if (!newAssignment) {
        conflicts.push({
          staff_id: staffId,
          reason: 'not_assigned_to_team',
          old_team: oldTeamId,
          new_team: newTeamId,
          date: newDate
        })
      } else {
        // Staff is available - create new assignment
        const { error: insertError } = await supabase
          .from('booking_staff_assignments')
          .insert({
            booking_id: bookingId,
            staff_id: staffId,
            team_id: newTeamId,
            assignment_date: newDate
          })

        if (insertError) throw insertError
      }
    }

    return {
      success: conflicts.length === 0,
      affected_staff: affectedStaff,
      conflicts
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Bulk Operations
async function bulkAssignStaff(supabase: any, assignments: any[]): Promise<OperationResponse> {
  try {
    const results = []
    const errors = []

    for (const assignment of assignments) {
      try {
        const result = await assignStaffToTeam(
          supabase, 
          assignment.staff_id, 
          assignment.team_id, 
          assignment.date
        )
        results.push(result)
      } catch (error) {
        errors.push({ assignment, error: error.message })
      }
    }

    return {
      success: errors.length === 0,
      data: { results, errors }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Summary Operations
async function getStaffSummary(supabase: any, staffIds: string[], date: string): Promise<OperationResponse> {
  try {
    const summary = []

    for (const staffId of staffIds) {
      // Get team assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from('staff_assignments')
        .select('team_id')
        .eq('staff_id', staffId)
        .eq('assignment_date', date)
        .maybeSingle()

      if (assignmentError) throw assignmentError

      // Get booking count
      const { data: bookings, error: bookingError } = await supabase
        .from('booking_staff_assignments')
        .select('booking_id')
        .eq('staff_id', staffId)
        .eq('assignment_date', date)

      if (bookingError) throw bookingError

      summary.push({
        staffId,
        teamId: assignment?.team_id,
        bookingsCount: bookings?.length || 0
      })
    }

    return { success: true, data: summary }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Helper Functions
async function autoAssignToBookings(supabase: any, staffId: string, teamId: string, date: string): Promise<void> {
  try {
    // Get all calendar events for this team on this date that have booking IDs
    const { data: events, error } = await supabase
      .from('calendar_events')
      .select('booking_id')
      .eq('resource_id', teamId)
      .gte('start_time', `${date}T00:00:00`)
      .lt('start_time', `${date}T23:59:59`)
      .not('booking_id', 'is', null)

    if (error) throw error

    const uniqueBookingIds = [...new Set(events?.map(e => e.booking_id).filter(Boolean) || [])]

    // Create booking assignments for each unique booking
    for (const bookingId of uniqueBookingIds) {
      await supabase
        .from('booking_staff_assignments')
        .insert({
          booking_id: bookingId,
          staff_id: staffId,
          team_id: teamId,
          assignment_date: date
        })
        .onConflict('booking_id,staff_id,assignment_date')
        .select()
    }
  } catch (error) {
    console.error('Error in autoAssignToBookings:', error)
  }
}

function extractClientFromTitle(title: string): string | undefined {
  const clientMatch = title.match(/^#?[\d\-]+\s*-\s*(.+)$/)
  if (clientMatch) {
    return clientMatch[1].trim()
  }
  return title
}

function getEventColor(eventType: string): string {
  switch (eventType) {
    case 'rig':
      return '#fff3e0'
    case 'event':
      return '#fff9c4'
    case 'rigDown':
      return '#f3e5f5'
    default:
      return '#e8f5e8'
  }
}

function getEventBorderColor(eventType: string): string {
  switch (eventType) {
    case 'rig':
      return '#ff9800'
    case 'event':
      return '#ffeb3b'
    case 'rigDown':
      return '#9c27b0'
    default:
      return '#4caf50'
  }
}

// New Export Function
async function exportStaffToExternal(supabase: any, externalUrl: string, staffIds?: string[], options: any = {}): Promise<OperationResponse> {
  try {
    console.log(`Exporting staff to external system: ${externalUrl}`)
    
    // Build query to get staff with accounts
    let query = supabase
      .from('staff_members')
      .select(`
        id,
        name,
        email,
        staff_accounts (
          username,
          password_hash
        )
      `)

    // Filter by staff IDs if provided
    if (staffIds && staffIds.length > 0) {
      query = query.in('id', staffIds)
    }

    const { data: staffData, error: fetchError } = await query

    if (fetchError) throw fetchError

    if (!staffData || staffData.length === 0) {
      return { success: false, error: 'No staff members found to export' }
    }

    // Transform data for export
    const exportData: StaffExportData[] = staffData
      .filter(staff => staff.staff_accounts && staff.staff_accounts.length > 0)
      .map(staff => ({
        uuid: staff.id,
        name: staff.name,
        email: staff.email || '',
        password_hash: staff.staff_accounts[0].password_hash
      }))

    if (exportData.length === 0) {
      return { success: false, error: 'No staff members with accounts found to export' }
    }

    // Get API key from environment
    const apiKey = Deno.env.get('X_API_KEY')
    if (!apiKey) {
      return { success: false, error: 'X_API_KEY not configured' }
    }

    // Prepare request to external system
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...corsHeaders
    }

    // Add any additional headers from options
    if (options.headers) {
      Object.assign(requestHeaders, options.headers)
    }

    const requestBody = {
      staff_data: exportData,
      export_timestamp: new Date().toISOString(),
      total_count: exportData.length
    }

    console.log(`Sending ${exportData.length} staff records to ${externalUrl}`)

    // Make request to external system
    const externalResponse = await fetch(externalUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody)
    })

    const responseText = await externalResponse.text()
    let responseData: any = {}

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw_response: responseText }
    }

    if (!externalResponse.ok) {
      console.error(`External API error: ${externalResponse.status} - ${responseText}`)
      return {
        success: false,
        error: `External API error: ${externalResponse.status}`,
        data: {
          status: externalResponse.status,
          response: responseData,
          exported_count: exportData.length
        }
      }
    }

    console.log(`Successfully exported ${exportData.length} staff records`)

    return {
      success: true,
      data: {
        exported_count: exportData.length,
        external_response: responseData,
        exported_staff_ids: exportData.map(s => s.uuid)
      }
    }

  } catch (error) {
    console.error('Error in exportStaffToExternal:', error)
    return { success: false, error: error.message }
  }
}
