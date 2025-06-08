
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

// Function to log assignment changes
async function logAssignmentChange(changeData: {
  staffId: string
  oldTeamId?: string | null
  newTeamId?: string | null
  date: string
  changeType: 'assign' | 'remove' | 'move'
  bookingId?: string
}) {
  const { staffId, oldTeamId, newTeamId, date, changeType, bookingId } = changeData

  try {
    // Get staff name
    const staffName = await getStaffName(staffId)
    
    let logMessage = ''
    let detailedInfo = {
      staffId,
      staffName,
      oldTeamId,
      newTeamId,
      date,
      changeType,
      bookingId,
      timestamp: new Date().toISOString()
    }

    switch (changeType) {
      case 'assign':
        logMessage = `${staffName} assigned to booking ${bookingId} for ${date}`
        break
      case 'remove':
        logMessage = `${staffName} removed from booking ${bookingId} for ${date}`
        break
      case 'move':
        logMessage = `${staffName} moved to different assignment for ${date}`
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

// Function to get staff assignment and related bookings using booking assignments
async function getStaffAssignment(staffId: string, date: string) {
  console.log(`Fetching staff assignment for ${staffId} on ${date} using booking assignments`)

  // Get direct booking assignments for the staff member on the specified date
  const { data: bookingAssignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, team_id, assignment_date')
    .eq('staff_id', staffId)
    .eq('assignment_date', date)

  if (assignmentError) {
    console.error('Error fetching booking assignments:', assignmentError)
    throw assignmentError
  }

  // If no assignments found, return an empty response
  if (!bookingAssignments || bookingAssignments.length === 0) {
    return {
      staffId,
      date,
      teamId: null,
      teamName: null,
      bookings: [],
      summary: {
        totalBookings: 0,
        eventsByType: { rig: 0, event: 0, rigDown: 0 }
      }
    }
  }

  const bookingIds = bookingAssignments.map(ba => ba.booking_id)
  
  // Get booking details for confirmed bookings only
  const { data: confirmedBookings, error: confirmedError } = await supabase
    .from('confirmed_bookings')
    .select('id')
    .in('id', bookingIds)

  if (confirmedError) {
    console.error('Error fetching confirmed bookings:', confirmedError)
    throw confirmedError
  }

  const confirmedBookingIds = confirmedBookings?.map(cb => cb.id) || []
  
  if (confirmedBookingIds.length === 0) {
    return {
      staffId,
      date,
      teamId: bookingAssignments[0]?.team_id || null,
      teamName: `Team-${bookingAssignments[0]?.team_id || 'Unknown'}`,
      bookings: [],
      summary: {
        totalBookings: 0,
        eventsByType: { rig: 0, event: 0, rigDown: 0 }
      }
    }
  }

  // Fetch booking details
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select(`
      id,
      client,
      booking_number,
      status,
      rigdaydate,
      eventdate,
      rigdowndate,
      deliveryaddress,
      delivery_city,
      delivery_postal_code,
      delivery_latitude,
      delivery_longitude,
      carry_more_than_10m,
      ground_nails_allowed,
      exact_time_needed,
      exact_time_info,
      contact_name,
      contact_phone,
      contact_email,
      internalnotes,
      created_at,
      updated_at
    `)
    .in('id', confirmedBookingIds)

  if (bookingsError) {
    console.error('Error fetching bookings:', bookingsError)
    throw bookingsError
  }

  // Get events for these bookings on the specified date
  const { data: events, error: eventsError } = await supabase
    .from('calendar_events')
    .select('*')
    .in('booking_id', confirmedBookingIds)
    .gte('start_time', `${date}T00:00:00`)
    .lt('start_time', `${date}T23:59:59`)

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    throw eventsError
  }

  // Get products for these bookings
  const { data: products, error: productsError } = await supabase
    .from('booking_products')
    .select('*')
    .in('booking_id', confirmedBookingIds)

  if (productsError) {
    console.error('Error fetching products:', productsError)
  }

  // Process bookings to include events and format according to our response structure
  const processedBookings = (bookings || []).map(booking => {
    const bookingEvents = (events || [])
      .filter(event => event.booking_id === booking.id)
      .map(event => ({
        id: event.id,
        type: event.event_type,
        start: event.start_time,
        end: event.end_time,
        title: event.title
      }))

    const bookingProducts = (products || [])
      .filter(product => product.booking_id === booking.id)
      .map(product => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        notes: product.notes
      }))

    const assignment = bookingAssignments.find(ba => ba.booking_id === booking.id)

    return {
      id: booking.id,
      client: booking.client,
      bookingNumber: booking.booking_number,
      status: booking.status,
      rigDayDate: booking.rigdaydate,
      eventDate: booking.eventdate,
      rigDownDate: booking.rigdowndate,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      deliveryPostalCode: booking.delivery_postal_code,
      teamId: assignment?.team_id,
      events: bookingEvents,
      products: bookingProducts,
      coordinates: {
        latitude: booking.delivery_latitude,
        longitude: booking.delivery_longitude
      },
      contactName: booking.contact_name,
      contactPhone: booking.contact_phone,
      contactEmail: booking.contact_email,
      carryMoreThan10m: booking.carry_more_than_10m,
      groundNailsAllowed: booking.ground_nails_allowed,
      exactTimeNeeded: booking.exact_time_needed,
      exactTimeInfo: booking.exact_time_info,
      internalNotes: booking.internalnotes,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at
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

  const teamId = bookingAssignments[0]?.team_id || null
  const teamName = teamId ? `Team-${teamId}` : null

  return {
    staffId,
    date,
    teamId,
    teamName,
    bookings: processedBookings,
    eventsCount: allEvents.length,
    summary
  }
}

// Function to get all confirmed bookings for a date with their staff assignments
async function getAllBookingsForDate(date: string) {
  console.log(`Fetching all confirmed bookings for ${date} with staff assignments`)

  // Get all booking assignments for the date
  const { data: bookingAssignments, error: assignmentError } = await supabase
    .from('booking_staff_assignments')
    .select('booking_id, staff_id, team_id, assignment_date')
    .eq('assignment_date', date)

  if (assignmentError) {
    console.error('Error fetching booking assignments:', assignmentError)
    throw assignmentError
  }

  if (!bookingAssignments || bookingAssignments.length === 0) {
    return []
  }

  const bookingIds = [...new Set(bookingAssignments.map(ba => ba.booking_id))]
  
  // Get confirmed bookings only
  const { data: confirmedBookings, error: confirmedError } = await supabase
    .from('confirmed_bookings')
    .select('id')
    .in('id', bookingIds)

  if (confirmedError) {
    console.error('Error fetching confirmed bookings:', confirmedError)
    throw confirmedError
  }

  const confirmedBookingIds = confirmedBookings?.map(cb => cb.id) || []
  
  if (confirmedBookingIds.length === 0) {
    return []
  }

  // Get booking details, events, products, and staff info
  const [bookingsResult, eventsResult, productsResult, staffResult] = await Promise.all([
    supabase.from('bookings').select('*').in('id', confirmedBookingIds),
    supabase.from('calendar_events').select('*').in('booking_id', confirmedBookingIds)
      .gte('start_time', `${date}T00:00:00`).lt('start_time', `${date}T23:59:59`),
    supabase.from('booking_products').select('*').in('booking_id', confirmedBookingIds),
    supabase.from('staff_members').select('id, name, email').in('id', 
      [...new Set(bookingAssignments.map(ba => ba.staff_id))])
  ])

  const { data: bookings } = bookingsResult
  const { data: events } = eventsResult
  const { data: products } = productsResult
  const { data: staff } = staffResult

  // Process and return the data
  return (bookings || []).map(booking => {
    const bookingEvents = (events || [])
      .filter(event => event.booking_id === booking.id)
      .map(event => ({
        id: event.id,
        type: event.event_type,
        start: event.start_time,
        end: event.end_time,
        title: event.title
      }))

    const bookingProducts = (products || [])
      .filter(product => product.booking_id === booking.id)
      .map(product => ({
        id: product.id,
        name: product.name,
        quantity: product.quantity,
        notes: product.notes
      }))

    const staffAssignments = bookingAssignments
      .filter(ba => ba.booking_id === booking.id)
      .map(ba => {
        const staffMember = staff?.find(s => s.id === ba.staff_id)
        return {
          staffId: ba.staff_id,
          staffName: staffMember?.name || `Staff-${ba.staff_id}`,
          staffEmail: staffMember?.email,
          teamId: ba.team_id
        }
      })

    return {
      id: booking.id,
      client: booking.client,
      bookingNumber: booking.booking_number,
      status: booking.status,
      rigDayDate: booking.rigdaydate,
      eventDate: booking.eventdate,
      rigDownDate: booking.rigdowndate,
      deliveryAddress: booking.deliveryaddress,
      deliveryCity: booking.delivery_city,
      deliveryPostalCode: booking.delivery_postal_code,
      events: bookingEvents,
      products: bookingProducts,
      staffAssignments,
      coordinates: {
        latitude: booking.delivery_latitude,
        longitude: booking.delivery_longitude
      },
      contactName: booking.contact_name,
      contactPhone: booking.contact_phone,
      contactEmail: booking.contact_email,
      carryMoreThan10m: booking.carry_more_than_10m,
      groundNailsAllowed: booking.ground_nails_allowed,
      exactTimeNeeded: booking.exact_time_needed,
      exactTimeInfo: booking.exact_time_info,
      internalNotes: booking.internalnotes,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at
    }
  })
}

// NEW: Function to get all staff assignments without date restriction
async function getAllStaffAssignments() {
  try {
    // Get all booking assignments with their staff member details
    const { data: assignments, error: assignmentsError } = await supabase
      .from('booking_staff_assignments')
      .select(`
        booking_id,
        staff_id,
        team_id,
        assignment_date
      `)
      .order('assignment_date', { ascending: false })

    if (assignmentsError) {
      console.error('Error fetching all staff assignments:', assignmentsError)
      throw assignmentsError
    }

    // Get staff details
    const staffIds = [...new Set(assignments?.map(a => a.staff_id) || [])]
    const { data: staff, error: staffError } = await supabase
      .from('staff_members')
      .select('id, name')
      .in('id', staffIds)

    if (staffError) {
      console.error('Error fetching staff members:', staffError)
    }

    // Group assignments by staff member
    const staffAssignments = {}
    
    for (const assignment of assignments || []) {
      const staffId = assignment.staff_id
      const staffMember = staff?.find(s => s.id === staffId)
      const staffName = staffMember?.name || `Staff-${staffId}`
      
      if (!staffAssignments[staffId]) {
        staffAssignments[staffId] = {
          staffId,
          staffName,
          assignments: []
        }
      }
      
      staffAssignments[staffId].assignments.push({
        date: assignment.assignment_date,
        bookingId: assignment.booking_id,
        teamId: assignment.team_id
      })
    }
    
    return Object.values(staffAssignments)
  } catch (error) {
    console.error('Error in getAllStaffAssignments:', error)
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
    const { staffId, date, fetchAllStaff, fetchAllAssignments } = await req.json()

    let responseData

    // Handle different fetch modes
    if (fetchAllAssignments) {
      // Fetch all staff assignments without date restriction
      responseData = await getAllStaffAssignments()
    } else if (fetchAllStaff && date) {
      // Fetch all confirmed bookings for a specific date with staff assignments
      responseData = await getAllBookingsForDate(date)
    } else if (staffId && date) {
      // Fetch specific staff assignment for a date
      responseData = await getStaffAssignment(staffId, date)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid parameters. Provide either: staffId+date, fetchAllStaff+date, or fetchAllAssignments' }),
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
