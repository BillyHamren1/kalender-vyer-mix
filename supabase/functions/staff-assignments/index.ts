import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Define CORS headers to allow cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, x-api-key, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to validate the API key
const validateApiKey = async (apiKey: string | null) => {
  if (!apiKey) {
    throw new Error('Missing API key')
  }

  const expectedApiKey = Deno.env.get('STAFF_API_KEY')
  if (!expectedApiKey) {
    throw new Error('API key not configured on server')
  }

  if (apiKey !== expectedApiKey) {
    throw new Error('Invalid API key')
  }

  return true
}

// Helper function to get staff name by ID
async function getStaffName(staffId: string): Promise<string> {
  const { data: staff, error } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staffId)
    .maybeSingle()

  if (error || !staff) {
    console.warn(`Could not find staff member with ID ${staffId}`)
    return `Staff-${staffId}`
  }

  return staff.name
}

// Helper function to get team name by ID
async function getTeamName(teamId: string): Promise<string> {
  // Since we don't have a teams table, we'll use the team ID as the name
  // This can be enhanced later if team names are stored elsewhere
  return `Team-${teamId}`
}

// Helper function to get booking IDs for a team on a specific date
async function getTeamBookings(teamId: string, date: string): Promise<string[]> {
  const { data: events, error } = await supabase
    .from('calendar_events')
    .select('booking_id')
    .eq('resource_id', teamId)
    .gte('start_time', `${date}T00:00:00`)
    .lt('start_time', `${date}T23:59:59`)
    .not('booking_id', 'is', null)

  if (error) {
    console.warn(`Could not fetch bookings for team ${teamId}:`, error)
    return []
  }

  return [...new Set(events.map(event => event.booking_id).filter(Boolean))]
}

// Function to log assignment changes
async function logAssignmentChange(changeData: {
  staffId: string
  oldTeamId?: string | null
  newTeamId?: string | null
  date: string
  changeType: 'assign' | 'remove' | 'move'
}) {
  const { staffId, oldTeamId, newTeamId, date, changeType } = changeData

  try {
    // Get staff name
    const staffName = await getStaffName(staffId)
    
    // Get team names
    const oldTeamName = oldTeamId ? await getTeamName(oldTeamId) : null
    const newTeamName = newTeamId ? await getTeamName(newTeamId) : null
    
    // Get booking information for relevant teams
    const oldTeamBookings = oldTeamId ? await getTeamBookings(oldTeamId, date) : []
    const newTeamBookings = newTeamId ? await getTeamBookings(newTeamId, date) : []
    
    let logMessage = ''
    let detailedInfo = {
      staffId,
      staffName,
      oldTeamId,
      newTeamId,
      oldTeamName,
      newTeamName,
      date,
      changeType,
      oldTeamBookings,
      newTeamBookings,
      timestamp: new Date().toISOString()
    }

    switch (changeType) {
      case 'assign':
        logMessage = `${staffName} assigned to ${newTeamName} for ${date}`
        if (newTeamBookings.length > 0) {
          logMessage += ` (bookings: ${newTeamBookings.join(', ')})`
        }
        break
      case 'remove':
        logMessage = `${staffName} removed from ${oldTeamName} for ${date}`
        if (oldTeamBookings.length > 0) {
          logMessage += ` (was on bookings: ${oldTeamBookings.join(', ')})`
        }
        break
      case 'move':
        logMessage = `${staffName} moved from ${oldTeamName} to ${newTeamName} for ${date}`
        const allBookings = [...new Set([...oldTeamBookings, ...newTeamBookings])]
        if (allBookings.length > 0) {
          logMessage += ` (bookings: ${allBookings.join(', ')})`
        }
        break
    }

    console.log(`STAFF ASSIGNMENT CHANGE: ${logMessage}`)
    console.log('Detailed change info:', JSON.stringify(detailedInfo, null, 2))

    return {
      success: true,
      message: logMessage,
      details: detailedInfo
    }
  } catch (error) {
    console.error('Error logging assignment change:', error)
    return {
      success: false,
      error: error.message,
      details: changeData
    }
  }
}

// Function to get staff assignment and related bookings
async function getStaffAssignment(staffId: string, date: string) {
  // First, get the team assignment for the staff member on the specified date
  const { data: assignment, error: assignmentError } = await supabase
    .from('staff_assignments')
    .select('team_id')
    .eq('staff_id', staffId)
    .eq('assignment_date', date)
    .maybeSingle()

  if (assignmentError) {
    console.error('Error fetching team assignment:', assignmentError)
    throw assignmentError
  }

  // If no assignment found, return an empty response
  if (!assignment) {
    return {
      staffId,
      date,
      teamId: null,
      bookings: [],
      eventsCount: 0
    }
  }

  const teamId = assignment.team_id

  // Get all events for the team on the specified date
  const { data: events, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .eq('resource_id', teamId)
    .gte('start_time', `${date}T00:00:00`)
    .lt('start_time', `${date}T23:59:59`)

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    throw eventsError
  }

  // Group events by booking
  const bookingIds = [...new Set(events
    .filter(event => event.booking_id)
    .map(event => event.booking_id))]

  // Fetch booking details for all relevant bookings
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .in('id', bookingIds)

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError)
    throw bookingsError
  }

  // Process bookings to include events and format according to our response structure
  const processedBookings = bookings.map(booking => {
    const bookingEvents = events
      .filter(event => event.booking_id === booking.id)
      .map(event => ({
        id: event.id,
        type: event.event_type,
        start: event.start_time,
        end: event.end_time,
        title: event.title
      }))

    // Return an enhanced booking object with events and coordinates
    return {
      id: booking.id,
      client: booking.client,
      rigDayDate: booking.rigdaydate,
      eventDate: booking.eventdate,
      rigDownDate: booking.rigdowndate,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      deliveryPostalCode: booking.delivery_postal_code,
      teamId,
      events: bookingEvents,
      coordinates: {
        latitude: booking.delivery_latitude,
        longitude: booking.delivery_longitude
      }
    }
  })

  // Calculate summary stats
  const allEvents = processedBookings.flatMap(b => b.events)
  const eventsByType = {
    rig: allEvents.filter(e => e.type === 'rig').length,
    event: allEvents.filter(e => e.type === 'event').length,
    rigDown: allEvents.filter(e => e.type === 'rigDown').length
  }

  // Sort events chronologically to find first and last
  const sortedEvents = [...allEvents].sort((a, b) => 
    new Date(a.start).getTime() - new Date(b.start).getTime())

  const summary = {
    totalBookings: processedBookings.length,
    eventsByType,
    firstEventTime: sortedEvents.length > 0 ? sortedEvents[0].start : undefined,
    lastEventTime: sortedEvents.length > 0 ? sortedEvents[sortedEvents.length - 1].end : undefined,
    locationCoordinates: processedBookings
      .map(b => b.coordinates)
      .filter(c => c && (c.latitude || c.longitude))
  }

  return {
    staffId,
    date,
    teamId,
    bookings: processedBookings,
    eventsCount: allEvents.length,
    summary
  }
}

// Function to get all bookings across all teams for a given date
async function getAllBookings(date: string) {
  // Get all teams with events on the specified date
  const { data: events, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', `${date}T00:00:00`)
    .lt('start_time', `${date}T23:59:59`)

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    throw eventsError
  }

  // Extract unique booking IDs and team IDs
  const bookingIds = [...new Set(events
    .filter(event => event.booking_id)
    .map(event => event.booking_id))]
  
  const teamIds = [...new Set(events.map(event => event.resource_id))]

  // If no bookings found, return an empty array
  if (bookingIds.length === 0) {
    return []
  }

  // Fetch all relevant bookings
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .in('id', bookingIds)

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError)
    throw bookingsError
  }

  // Create a mapping of team IDs to bookings
  const teamBookings = {}
  teamIds.forEach(teamId => {
    const teamEvents = events.filter(event => event.resource_id === teamId)
    const teamBookingIds = [...new Set(teamEvents
      .filter(event => event.booking_id)
      .map(event => event.booking_id))]
    
    teamBookings[teamId] = teamBookingIds
  })

  // Process bookings to include events and format according to our response structure
  const processedBookings = bookings.flatMap(booking => {
    const bookingEvents = events
      .filter(event => event.booking_id === booking.id)
      .map(event => ({
        id: event.id,
        type: event.event_type,
        start: event.start_time,
        end: event.end_time,
        title: event.title
      }))
    
    // Find which team this booking belongs to
    const assignedTeamIds = Object.entries(teamBookings)
      .filter(([_, bookingIds]) => (bookingIds as string[]).includes(booking.id))
      .map(([teamId, _]) => teamId)

    // If booking is assigned to multiple teams, create one entry per team
    return assignedTeamIds.map(teamId => ({
      id: booking.id,
      client: booking.client,
      rigDayDate: booking.rigdaydate,
      eventDate: booking.eventdate,
      rigDownDate: booking.rigdowndate,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      deliveryPostalCode: booking.delivery_postal_code,
      teamId,
      events: bookingEvents.filter(event => 
        events.find(e => e.id === event.id)?.resource_id === teamId),
      coordinates: {
        latitude: booking.delivery_latitude,
        longitude: booking.delivery_longitude
      }
    }))
  })

  return processedBookings
}

// NEW: Function to get all staff assignments without date restriction
async function getAllStaffAssignments() {
  try {
    // Get all staff assignments with their staff member details
    const { data: assignments, error: assignmentsError } = await supabase
      .from('staff_assignments')
      .select(`
        staff_id,
        team_id,
        assignment_date,
        staff_members (
          name
        )
      `)
      .order('assignment_date', { ascending: false })

    if (assignmentsError) {
      console.error('Error fetching all staff assignments:', assignmentsError)
      throw assignmentsError
    }

    // Group assignments by staff member
    const staffAssignments = {}
    
    for (const assignment of assignments || []) {
      const staffId = assignment.staff_id
      const staffName = assignment.staff_members?.name || `Staff-${staffId}`
      const teamName = await getTeamName(assignment.team_id)
      
      if (!staffAssignments[staffId]) {
        staffAssignments[staffId] = {
          staffId,
          staffName,
          assignments: []
        }
      }
      
      staffAssignments[staffId].assignments.push({
        date: assignment.assignment_date,
        teamId: assignment.team_id,
        teamName
      })
    }
    
    return Object.values(staffAssignments)
  } catch (error) {
    console.error('Error in getAllStaffAssignments:', error)
    throw error
  }
}

// NEW: Function to get staff assignments for a date range
async function getStaffAssignmentsForDateRange(startDate: string, endDate: string) {
  try {
    // Get all unique staff members who have assignments in the date range
    const { data: assignments, error: assignmentsError } = await supabase
      .from('staff_assignments')
      .select('staff_id')
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate)

    if (assignmentsError) {
      console.error('Error fetching staff assignments for date range:', assignmentsError)
      throw assignmentsError
    }

    const uniqueStaffIds = [...new Set(assignments?.map(a => a.staff_id) || [])]
    const results = []

    // For each staff member, get their detailed assignments for each date in the range
    for (const staffId of uniqueStaffIds) {
      const currentDate = new Date(startDate)
      const endDateObj = new Date(endDate)
      
      while (currentDate <= endDateObj) {
        try {
          const dateStr = currentDate.toISOString().split('T')[0]
          const staffAssignment = await getStaffAssignment(staffId, dateStr)
          
          if (staffAssignment.teamId) {
            results.push(staffAssignment)
          }
        } catch (error) {
          console.warn(`No assignment found for staff ${staffId} on ${currentDate.toISOString().split('T')[0]}`)
        }
        
        currentDate.setDate(currentDate.getDate() + 1)
      }
    }

    return results
  } catch (error) {
    console.error('Error in getStaffAssignmentsForDateRange:', error)
    throw error
  }
}

// Main handler for the endpoint
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathname = url.pathname

    // Get the API key from the headers
    const apiKey = req.headers.get('x-api-key')
    
    // Validate the API key
    try {
      await validateApiKey(apiKey)
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Handle assignment change logging endpoint
    if (pathname.includes('/assignment-change') && req.method === 'POST') {
      const changeData = await req.json()
      
      const result = await logAssignmentChange(changeData)
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json'
          } 
        }
      )
    }

    // Handle main staff assignments endpoint
    const { staffId, date, fetchAllStaff, fetchAllAssignments, fetchDateRange, startDate, endDate } = await req.json()

    let responseData

    // Handle different fetch modes
    if (fetchAllAssignments) {
      // Fetch all staff assignments without date restriction
      responseData = await getAllStaffAssignments()
    } else if (fetchDateRange && startDate && endDate) {
      // Fetch assignments for a date range
      responseData = await getStaffAssignmentsForDateRange(startDate, endDate)
    } else if (fetchAllStaff && date) {
      // Fetch all bookings for a specific date
      responseData = await getAllBookings(date)
    } else if (staffId && date) {
      // Fetch specific staff assignment for a date
      responseData = await getStaffAssignment(staffId, date)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters. Provide either: staffId+date, fetchAllStaff+date, fetchAllAssignments, or fetchDateRange+startDate+endDate' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Return the response
    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          // Add cache control headers to prevent caching
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store'
        } 
      }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
