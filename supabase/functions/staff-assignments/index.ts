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

// Main handler for the endpoint
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
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

    // Parse the request body
    const { staffId, date, fetchAllStaff } = await req.json()

    if (!date) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: date' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let responseData

    // Determine if we should fetch all bookings or just for a specific staff member
    if (fetchAllStaff) {
      responseData = await getAllBookings(date)
    } else {
      // Otherwise, ensure staffId is provided
      if (!staffId) {
        return new Response(
          JSON.stringify({ error: 'Missing required parameter: staffId' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      responseData = await getStaffAssignment(staffId, date)
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
