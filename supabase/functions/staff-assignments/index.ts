
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const url = new URL(req.url)
    const staffId = url.searchParams.get('staffId')
    const date = url.searchParams.get('date')

    // Validate required parameters
    if (!staffId || !date) {
      return new Response(
        JSON.stringify({ error: 'Staff ID and date are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Format the date (ensure it's in YYYY-MM-DD format)
    const formattedDate = new Date(date).toISOString().split('T')[0]

    // Step 1: Find the team assignment for the staff member on the specified date
    const { data: assignment, error: assignmentError } = await supabaseClient
      .from('staff_assignments')
      .select('team_id')
      .eq('staff_id', staffId)
      .eq('assignment_date', formattedDate)
      .maybeSingle()

    if (assignmentError) {
      console.error('Error fetching staff assignment:', assignmentError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch staff assignment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // If no assignment is found, return an empty response
    if (!assignment) {
      return new Response(
        JSON.stringify({ assignments: [], message: 'No team assignment found for this date' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const teamId = assignment.team_id

    // Step 2: Find all calendar events for the assigned team on the specified date
    const startOfDay = new Date(formattedDate)
    startOfDay.setUTCHours(0, 0, 0, 0)
    
    const endOfDay = new Date(formattedDate)
    endOfDay.setUTCHours(23, 59, 59, 999)

    const { data: events, error: eventsError } = await supabaseClient
      .from('calendar_events')
      .select('*, booking_id')
      .eq('resource_id', teamId)
      .gte('start_time', startOfDay.toISOString())
      .lte('end_time', endOfDay.toISOString())

    if (eventsError) {
      console.error('Error fetching calendar events:', eventsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch calendar events' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Collect all unique booking IDs
    const bookingIds = [...new Set(events.map(event => event.booking_id).filter(Boolean))]

    // Step 3: Fetch detailed booking information for all events
    const bookingDetails = []
    
    for (const bookingId of bookingIds) {
      // Fetch booking details
      const { data: booking, error: bookingError } = await supabaseClient
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single()

      if (bookingError) {
        console.error(`Error fetching booking ${bookingId}:`, bookingError)
        continue
      }

      // Fetch booking products
      const { data: products, error: productsError } = await supabaseClient
        .from('booking_products')
        .select('*')
        .eq('booking_id', bookingId)

      if (productsError) {
        console.error(`Error fetching products for booking ${bookingId}:`, productsError)
      }

      // Fetch booking attachments
      const { data: attachments, error: attachmentsError } = await supabaseClient
        .from('booking_attachments')
        .select('*')
        .eq('booking_id', bookingId)

      if (attachmentsError) {
        console.error(`Error fetching attachments for booking ${bookingId}:`, attachmentsError)
      }

      // Find all events for this booking (rig, event, rigDown)
      const bookingEvents = events.filter(event => event.booking_id === bookingId)
        .map(event => ({
          id: event.id,
          type: event.event_type,
          start: event.start_time,
          end: event.end_time,
          title: event.title
        }))

      // Add complete booking details to the result
      bookingDetails.push({
        id: booking.id,
        client: booking.client,
        rigDayDate: booking.rigdaydate,
        eventDate: booking.eventdate,
        rigDownDate: booking.rigdowndate,
        deliveryAddress: booking.deliveryaddress,
        internalNotes: booking.internalnotes,
        products: products || [],
        attachments: attachments || [],
        events: bookingEvents,
        teamId: teamId
      })
    }

    // Return the complete staff assignment information
    return new Response(
      JSON.stringify({
        staffId,
        date: formattedDate,
        teamId,
        bookings: bookingDetails,
        eventsCount: events.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
