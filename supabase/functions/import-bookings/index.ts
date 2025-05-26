
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BookingData {
  id: string;
  client: string;
  rigdaydate?: string;
  eventdate?: string;
  rigdowndate?: string;
  deliveryaddress?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  carry_more_than_10m?: boolean;
  ground_nails_allowed?: boolean;
  exact_time_needed?: boolean;
  exact_time_info?: string;
  internalnotes?: string;
  status?: string;
  booking_number?: string;
  version?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { quiet = false, syncMode = 'incremental' } = await req.json()

    // Get API key from secrets
    const importApiKey = Deno.env.get('IMPORT_API_KEY')
    if (!importApiKey) {
      throw new Error('IMPORT_API_KEY not configured')
    }

    // Fetch bookings from external API
    const externalResponse = await fetch('https://booking-import.deno.dev/api/bookings', {
      headers: {
        'Authorization': `Bearer ${importApiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!externalResponse.ok) {
      throw new Error(`External API error: ${externalResponse.status}`)
    }

    const externalData = await externalResponse.json()
    console.log('External bookings data:', JSON.stringify(externalData, null, 2))

    if (!externalData.success || !Array.isArray(externalData.data)) {
      throw new Error('Invalid external API response format')
    }

    const results = {
      total: 0,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      new_bookings: [],
      updated_bookings: [],
      status_changed_bookings: [],
      errors: [],
      sync_mode: syncMode
    }

    // Get existing bookings for comparison
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, status, version, booking_number')

    const existingBookingMap = new Map(existingBookings?.map(b => [b.id, b]) || [])

    for (const externalBooking of externalData.data) {
      try {
        results.total++

        // Extract client name - try clientName first, then fallback to nested client object
        let clientName = externalBooking.clientName
        if (!clientName && externalBooking.client?.name) {
          clientName = externalBooking.client.name
        }
        if (!clientName) {
          clientName = ''
        }

        // Handle multiple date arrays - use first date from each array
        const rigdaydate = externalBooking.rig_up_dates && externalBooking.rig_up_dates.length > 0 
          ? externalBooking.rig_up_dates[0] 
          : undefined

        const eventdate = externalBooking.event_dates && externalBooking.event_dates.length > 0 
          ? externalBooking.event_dates[0] 
          : undefined

        const rigdowndate = externalBooking.rig_down_dates && externalBooking.rig_down_dates.length > 0 
          ? externalBooking.rig_down_dates[0] 
          : undefined

        const bookingData: BookingData = {
          id: externalBooking.id,
          client: clientName,
          rigdaydate: rigdaydate,
          eventdate: eventdate,
          rigdowndate: rigdowndate,
          deliveryaddress: externalBooking.delivery_address,
          delivery_city: externalBooking.delivery_city,
          delivery_postal_code: externalBooking.delivery_postal_code,
          delivery_latitude: externalBooking.delivery_geocode?.latitude,
          delivery_longitude: externalBooking.delivery_geocode?.longitude,
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          exact_time_info: externalBooking.exact_time_info,
          internalnotes: externalBooking.internal_notes,
          status: externalBooking.status || 'PENDING',
          booking_number: externalBooking.booking_number, // Use directly, no fallbacks
          version: 1
        }

        console.log(`Processing booking ${bookingData.id} with booking number: ${bookingData.booking_number}`)

        const existingBooking = existingBookingMap.get(bookingData.id)

        if (existingBooking) {
          // Check if status changed
          const statusChanged = existingBooking.status !== bookingData.status
          
          if (statusChanged) {
            results.status_changed_bookings.push(bookingData.id)
          } else {
            results.updated_bookings.push(bookingData.id)
          }

          // Update existing booking
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              ...bookingData,
              version: (existingBooking.version || 1) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', bookingData.id)

          if (updateError) {
            console.error(`Error updating booking ${bookingData.id}:`, updateError)
            results.errors.push(`Failed to update ${bookingData.id}: ${updateError.message}`)
            results.failed++
            continue
          }
        } else {
          // Insert new booking
          const { error: insertError } = await supabase
            .from('bookings')
            .insert(bookingData)

          if (insertError) {
            console.error(`Error inserting booking ${bookingData.id}:`, insertError)
            results.errors.push(`Failed to insert ${bookingData.id}: ${insertError.message}`)
            results.failed++
            continue
          }

          results.new_bookings.push(bookingData.id)
        }

        results.imported++

        // Create calendar events for the booking
        const calendarEvents = []
        
        if (bookingData.rigdaydate) {
          calendarEvents.push({
            booking_id: bookingData.id,
            booking_number: bookingData.booking_number,
            title: `${bookingData.id}: ${bookingData.client}`,
            start_time: `${bookingData.rigdaydate}T08:00:00`,
            end_time: `${bookingData.rigdaydate}T17:00:00`,
            event_type: 'rig',
            delivery_address: bookingData.deliveryaddress
          })
        }

        if (bookingData.eventdate) {
          calendarEvents.push({
            booking_id: bookingData.id,
            booking_number: bookingData.booking_number,
            title: `${bookingData.id}: ${bookingData.client}`,
            start_time: `${bookingData.eventdate}T08:00:00`,
            end_time: `${bookingData.eventdate}T17:00:00`,
            event_type: 'event',
            delivery_address: bookingData.deliveryaddress
          })
        }

        if (bookingData.rigdowndate) {
          calendarEvents.push({
            booking_id: bookingData.id,
            booking_number: bookingData.booking_number,
            title: `${bookingData.id}: ${bookingData.client}`,
            start_time: `${bookingData.rigdowndate}T08:00:00`,
            end_time: `${bookingData.rigdowndate}T17:00:00`,
            event_type: 'rigDown',
            delivery_address: bookingData.deliveryaddress
          })
        }

        // Assign calendar events to teams automatically
        if (calendarEvents.length > 0) {
          // Get existing calendar events to find available teams
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('resource_id, start_time, end_time')

          const teamAvailability = new Map()
          const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5', 'team-6']

          // Initialize team availability
          teams.forEach(team => teamAvailability.set(team, 0))

          // Count existing events per team for the dates we're scheduling
          existingEvents?.forEach(event => {
            const eventDate = new Date(event.start_time).toISOString().split('T')[0]
            calendarEvents.forEach(newEvent => {
              const newEventDate = new Date(newEvent.start_time).toISOString().split('T')[0]
              if (eventDate === newEventDate) {
                const currentCount = teamAvailability.get(event.resource_id) || 0
                teamAvailability.set(event.resource_id, currentCount + 1)
              }
            })
          })

          // Assign events to teams with least conflicts
          for (const event of calendarEvents) {
            let selectedTeam = 'team-1'
            let minConflicts = teamAvailability.get('team-1') || 0

            teams.forEach(team => {
              const conflicts = teamAvailability.get(team) || 0
              if (conflicts < minConflicts) {
                selectedTeam = team
                minConflicts = conflicts
              }
            })

            console.log(`Selected ${selectedTeam} with ${minConflicts} events for new event`)

            // Update the team availability for next event
            teamAvailability.set(selectedTeam, minConflicts + 1)

            // Insert calendar event with assigned team
            const { error: eventError } = await supabase
              .from('calendar_events')
              .insert({
                ...event,
                resource_id: selectedTeam
              })

            if (eventError) {
              console.error(`Error creating calendar event:`, eventError)
            } else {
              results.calendar_events_created++
            }
          }
        }

      } catch (error) {
        console.error(`Error processing booking ${externalBooking.id}:`, error)
        results.errors.push(`Failed to process ${externalBooking.id}: ${error.message}`)
        results.failed++
      }
    }

    // Update sync state
    await supabase
      .from('sync_state')
      .upsert({
        sync_type: 'booking_import',
        last_sync_timestamp: new Date().toISOString(),
        last_sync_mode: syncMode,
        last_sync_status: results.failed > 0 ? 'partial_success' : 'success',
        metadata: { results }
      })

    return new Response(
      JSON.stringify({ success: true, results }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Import error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        results: {
          total: 0,
          imported: 0,
          failed: 0,
          calendar_events_created: 0,
          new_bookings: [],
          updated_bookings: [],
          status_changed_bookings: [],
          errors: [error.message],
          sync_mode: 'failed'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})
