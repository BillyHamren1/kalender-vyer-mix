
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Map team IDs to readable names
const teamNameMap: Record<string, string> = {
  'team-1': 'Team 1',
  'team-2': 'Team 2',
  'team-3': 'Team 3',
  'team-4': 'Team 4',
  'team-5': 'Team 5',
  'team-6': 'Today\'s Events'
};

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
        db: {
          schema: 'public',
        },
      }
    )

    // Get request body
    const requestData = await req.json();
    const staffId = requestData.staffId;
    const date = requestData.date;
    const simpleMode = requestData.simpleMode || false; // New option for simplified response

    // Add a cache busting parameter to prevent cached responses
    const cacheBuster = new Date().getTime();

    // Validate required parameters
    if (!staffId || !date) {
      return new Response(
        JSON.stringify({ error: 'Staff ID and date are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Format the date (ensure it's in YYYY-MM-DD format)
    const formattedDate = new Date(date).toISOString().split('T')[0]

    console.log(`Fetching staff assignment for staff ID ${staffId} on date ${formattedDate}, cache: ${cacheBuster}`);

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

    // Log assignment status for debugging
    if (assignment) {
      console.log(`Staff ${staffId} is assigned to team ${assignment.team_id} on ${formattedDate}`);
    } else {
      console.log(`No assignment found for staff ${staffId} on ${formattedDate}`);
    }

    // If no assignment is found, return an empty response
    if (!assignment) {
      return new Response(
        JSON.stringify({ 
          staffId, 
          date: formattedDate, 
          teamId: null, 
          teamName: null,
          bookings: [], 
          eventsCount: 0,
          summary: {
            totalBookings: 0,
            eventsByType: { rig: 0, event: 0, rigDown: 0 },
            locationCoordinates: []
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const teamId = assignment.team_id
    const teamName = teamNameMap[teamId] || teamId; // Get human-readable team name

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

    console.log(`Found ${events.length} events for team ${teamId} on ${formattedDate}`);

    // Collect all unique booking IDs
    const bookingIds = [...new Set(events.map(event => event.booking_id).filter(Boolean))]
    console.log(`Found ${bookingIds.length} unique bookings for these events`);

    // Initialize summary counters
    const eventsByType = { rig: 0, event: 0, rigDown: 0 };
    let firstEventTime: string | undefined;
    let lastEventTime: string | undefined;
    const locationCoordinates: {latitude: number | null, longitude: number | null}[] = [];

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
        .map(event => {
          // Update event type counts for summary
          if (event.event_type) {
            eventsByType[event.event_type as keyof typeof eventsByType] = 
              (eventsByType[event.event_type as keyof typeof eventsByType] || 0) + 1;
          }
          
          // Track earliest and latest event times
          if (!firstEventTime || event.start_time < firstEventTime) {
            firstEventTime = event.start_time;
          }
          if (!lastEventTime || event.end_time > lastEventTime) {
            lastEventTime = event.end_time;
          }
          
          // Format address for event display
          let formattedAddress = 'No address provided';
          if (booking.deliveryaddress) {
            formattedAddress = booking.deliveryaddress;
            if (booking.delivery_city) {
              formattedAddress += `, ${booking.delivery_city}`;
            }
            if (booking.delivery_postal_code) {
              formattedAddress += ` ${booking.delivery_postal_code}`;
            }
          }
          
          return {
            id: event.id,
            type: event.event_type,
            start: event.start_time,
            end: event.end_time,
            title: event.title,
            deliveryAddress: formattedAddress
          }
        })

      // Add location coordinates if available
      if (booking.delivery_latitude !== null && booking.delivery_longitude !== null) {
        locationCoordinates.push({
          latitude: booking.delivery_latitude,
          longitude: booking.delivery_longitude
        });
      }

      // Add complete booking details to the result
      bookingDetails.push({
        id: booking.id,
        client: booking.client,
        rigDayDate: booking.rigdaydate,
        eventDate: booking.eventdate,
        rigDownDate: booking.rigdowndate,
        deliveryAddress: booking.deliveryaddress || 'No address provided',
        deliveryCity: booking.delivery_city,
        deliveryPostalCode: booking.delivery_postal_code,
        // Clearly display coordinates at the booking level
        coordinates: booking.delivery_latitude !== null && booking.delivery_longitude !== null ? {
          latitude: booking.delivery_latitude,
          longitude: booking.delivery_longitude
        } : null,
        internalNotes: booking.internalnotes,
        products: products || [],
        attachments: attachments || [],
        events: bookingEvents,
        teamId: teamId
      })
    }

    // Create a summary object
    const summary = {
      totalBookings: bookingDetails.length,
      eventsByType,
      firstEventTime,
      lastEventTime,
      locationCoordinates
    };

    // Create the response based on mode
    const responseData = {
      staffId,
      date: formattedDate,
      teamId,
      teamName,
      bookings: bookingDetails,
      eventsCount: events.length,
      summary,
      timestamp: new Date().toISOString()
    };

    // Return the complete staff assignment information with cache control headers
    return new Response(
      JSON.stringify(responseData),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0' // Prevent caching
        } 
      }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
