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

interface ProductData {
  booking_id: string;
  name: string;
  quantity: number;
  notes?: string;
}

interface AttachmentData {
  booking_id: string;
  url: string;
  file_name: string;
  file_type: string;
}

/**
 * Helper function to calculate end time based on event type
 */
const getEndTimeForEventType = (startTime: string, eventType: 'rig' | 'event' | 'rigDown'): string => {
  const start = new Date(startTime);
  let hoursToAdd: number;
  
  switch (eventType) {
    case 'rig':
      hoursToAdd = 4; // 4 hours for rig events
      break;
    case 'event':
      hoursToAdd = 2.5; // 2.5 hours for event days
      break;
    case 'rigDown':
      hoursToAdd = 4; // 4 hours for rig down events
      break;
    default:
      hoursToAdd = 4; // fallback to 4 hours
  }
  
  const end = new Date(start.getTime() + (hoursToAdd * 60 * 60 * 1000));
  return end.toISOString();
};

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
    console.log(`Starting import with sync mode: ${syncMode}`)

    // Get API key from secrets
    const importApiKey = Deno.env.get('IMPORT_API_KEY')
    if (!importApiKey) {
      throw new Error('IMPORT_API_KEY not configured')
    }

    // Get the last sync timestamp for incremental sync
    let lastSyncTimestamp = null;
    if (syncMode === 'incremental') {
      const { data: syncState } = await supabase
        .from('sync_state')
        .select('last_sync_timestamp')
        .eq('sync_type', 'booking_import')
        .single()
      
      lastSyncTimestamp = syncState?.last_sync_timestamp;
      console.log(`Last sync timestamp: ${lastSyncTimestamp}`);
    }

    // Build API URL with timestamp filter for incremental sync
    let apiUrl = 'https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings';
    if (syncMode === 'incremental' && lastSyncTimestamp) {
      const sinceDate = new Date(lastSyncTimestamp).toISOString();
      apiUrl += `?since=${encodeURIComponent(sinceDate)}`;
      console.log(`Fetching bookings modified since: ${sinceDate}`);
    }

    // Fetch bookings from export-bookings function with timestamp filter
    const externalResponse = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${importApiKey}`,
        'x-api-key': importApiKey,
        'Content-Type': 'application/json'
      }
    })

    if (!externalResponse.ok) {
      throw new Error(`External API error: ${externalResponse.status}`)
    }

    const externalData = await externalResponse.json()
    console.log(`Fetched ${externalData.data?.length || 0} bookings from external API`)

    // Handle the response format from export-bookings function
    if (!externalData.data || !Array.isArray(externalData.data)) {
      throw new Error('Invalid external API response format - expected data array')
    }

    const results = {
      total: 0,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      products_imported: 0,
      attachments_imported: 0,
      new_bookings: [],
      updated_bookings: [],
      status_changed_bookings: [],
      cancelled_bookings_skipped: [],
      duplicates_skipped: [],
      errors: [],
      sync_mode: syncMode
    }

    // Get existing bookings for comparison
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id, status, version, booking_number')

    const existingBookingMap = new Map(existingBookings?.map(b => [b.id, b]) || [])
    const existingBookingNumberMap = new Map()
    
    // Build booking number map
    existingBookings?.forEach(booking => {
      if (booking.booking_number && booking.booking_number.trim() !== '') {
        existingBookingNumberMap.set(booking.booking_number.trim(), booking)
      }
    })

    console.log(`Found ${existingBookings?.length || 0} existing bookings in database`)

    for (const externalBooking of externalData.data) {
      try {
        results.total++

        // FILTER OUT CANCELLED BOOKINGS - DO NOT IMPORT THEM AT ALL
        const bookingStatus = (externalBooking.status || 'PENDING').toUpperCase()
        if (bookingStatus === 'CANCELLED') {
          console.log(`Skipping CANCELLED booking: ${externalBooking.id}`)
          results.cancelled_bookings_skipped.push(externalBooking.id)
          continue
        }

        // Check for existing booking
        const existingById = existingBookingMap.get(externalBooking.id)
        let existingByNumber = null
        
        if (externalBooking.booking_number && externalBooking.booking_number.trim() !== '') {
          existingByNumber = existingBookingNumberMap.get(externalBooking.booking_number.trim())
        }

        const existingBooking = existingById || existingByNumber

        if (existingBooking && !existingById && existingByNumber) {
          console.log(`DUPLICATE DETECTED: Booking number ${externalBooking.booking_number} already exists with different ID. Skipping import of ${externalBooking.id}`)
          results.duplicates_skipped.push(externalBooking.id)
          continue
        }

        // Extract client name
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
          delivery_latitude: externalBooking.delivery_geocode?.lat,
          delivery_longitude: externalBooking.delivery_geocode?.lng,
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          exact_time_info: externalBooking.exact_time_info,
          internalnotes: externalBooking.internal_notes,
          status: bookingStatus,
          booking_number: externalBooking.booking_number,
          version: 1
        }

        console.log(`Processing booking ${bookingData.id} with status: ${bookingData.status}`)

        if (existingBooking) {
          // EXISTING BOOKING - UPDATE ONLY IF ACTUALLY DIFFERENT
          console.log(`Found existing booking ${existingBooking.id}, checking for changes...`)
          
          const statusChanged = existingBooking.status !== bookingData.status
          
          if (statusChanged) {
            console.log(`Status changed for ${bookingData.id}: ${existingBooking.status} -> ${bookingData.status}`)
            results.status_changed_bookings.push(bookingData.id)
          } else {
            console.log(`No significant changes for ${bookingData.id}, marking as updated`)
            results.updated_bookings.push(bookingData.id)
          }

          // Update existing booking
          const { error: updateError } = await supabase
            .from('bookings')
            .update({
              ...bookingData,
              id: existingBooking.id,
              version: (existingBooking.version || 1) + 1,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingBooking.id)

          if (updateError) {
            console.error(`Error updating booking ${existingBooking.id}:`, updateError)
            results.errors.push({ booking_id: existingBooking.id, error: updateError.message })
            results.failed++
            continue
          }

          // Clear existing products and attachments for updated bookings
          await supabase.from('booking_products').delete().eq('booking_id', existingBooking.id)
          await supabase.from('booking_attachments').delete().eq('booking_id', existingBooking.id)

          bookingData.id = existingBooking.id

        } else {
          // NEW BOOKING - Insert only if truly new
          console.log(`Inserting new booking ${bookingData.id}`)
          
          const { error: insertError } = await supabase
            .from('bookings')
            .insert(bookingData)

          if (insertError) {
            if (insertError.message.includes('duplicate key') || insertError.message.includes('already exists')) {
              console.log(`Duplicate booking detected during insert: ${bookingData.id}, skipping...`)
              results.duplicates_skipped.push(bookingData.id)
              continue
            }
            
            console.error(`Error inserting booking ${bookingData.id}:`, insertError)
            results.errors.push({ booking_id: bookingData.id, error: insertError.message })
            results.failed++
            continue
          }

          results.new_bookings.push(bookingData.id)
        }

        // Process products
        if (externalBooking.products && Array.isArray(externalBooking.products)) {
          console.log(`Processing ${externalBooking.products.length} products for booking ${bookingData.id}`)
          
          for (const product of externalBooking.products) {
            try {
              const productData: ProductData = {
                booking_id: bookingData.id,
                name: product.name || product.product_name || 'Unknown Product',
                quantity: product.quantity || 1,
                notes: product.notes || product.description || null
              }

              const { error: productError } = await supabase
                .from('booking_products')
                .insert(productData)

              if (productError) {
                console.error(`Error inserting product for booking ${bookingData.id}:`, productError)
              } else {
                results.products_imported++
              }
            } catch (productErr) {
              console.error(`Error processing product for booking ${bookingData.id}:`, productErr)
            }
          }
        }

        // Process attachments
        if (externalBooking.attachments && Array.isArray(externalBooking.attachments)) {
          console.log(`Processing ${externalBooking.attachments.length} attachments for booking ${bookingData.id}`)
          
          for (const attachment of externalBooking.attachments) {
            try {
              const attachmentData: AttachmentData = {
                booking_id: bookingData.id,
                url: attachment.url || attachment.file_url,
                file_name: attachment.file_name || attachment.name || 'Unknown File',
                file_type: attachment.file_type || attachment.type || 'unknown'
              }

              const { error: attachmentError } = await supabase
                .from('booking_attachments')
                .insert(attachmentData)

              if (attachmentError) {
                console.error(`Error inserting attachment for booking ${bookingData.id}:`, attachmentError)
              } else {
                results.attachments_imported++
              }
            } catch (attachmentErr) {
              console.error(`Error processing attachment for booking ${bookingData.id}:`, attachmentErr)
            }
          }
        }

        results.imported++

        // IMPROVED CALENDAR EVENT HANDLING
        if (bookingData.status === 'CONFIRMED') {
          // Check if calendar events already exist for this booking
          const { data: existingEvents } = await supabase
            .from('calendar_events')
            .select('id, event_type, start_time, booking_id')
            .eq('booking_id', bookingData.id)

          const existingEventTypes = new Set(existingEvents?.map(e => e.event_type) || [])
          console.log(`Found ${existingEvents?.length || 0} existing calendar events for booking ${bookingData.id}`)

          const calendarEvents = []
          
          // Only create events that don't already exist
          if (bookingData.rigdaydate && !existingEventTypes.has('rig')) {
            const startTime = `${bookingData.rigdaydate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rig')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rig',
              delivery_address: bookingData.deliveryaddress
            })
          }

          if (bookingData.eventdate && !existingEventTypes.has('event')) {
            const startTime = `${bookingData.eventdate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'event')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'event',
              delivery_address: bookingData.deliveryaddress
            })
          }

          if (bookingData.rigdowndate && !existingEventTypes.has('rigDown')) {
            const startTime = `${bookingData.rigdowndate}T08:00:00`
            const endTime = getEndTimeForEventType(startTime, 'rigDown')
            
            calendarEvents.push({
              booking_id: bookingData.id,
              booking_number: bookingData.booking_number,
              title: `${bookingData.client}`,
              start_time: startTime,
              end_time: endTime,
              event_type: 'rigDown',
              delivery_address: bookingData.deliveryaddress
            })
          }

          if (calendarEvents.length > 0) {
            console.log(`Creating ${calendarEvents.length} new calendar events for booking ${bookingData.id}`)

            // Smart team assignment based on booking ID consistency
            const bookingHash = bookingData.id.split('-')[0] // Use first part of UUID for consistency
            const teams = ['team-1', 'team-2', 'team-3', 'team-4', 'team-5']
            const baseTeamIndex = parseInt(bookingHash, 16) % teams.length
            
            for (let i = 0; i < calendarEvents.length; i++) {
              const event = calendarEvents[i]
              let assignedTeam = teams[baseTeamIndex]
              
              // Special handling: EVENT type events go to team-6
              if (event.event_type === 'event') {
                assignedTeam = 'team-6'
              }

              console.log(`Assigning ${event.event_type} event to ${assignedTeam} for booking ${bookingData.id}`)

              const { error: eventError } = await supabase
                .from('calendar_events')
                .upsert({
                  ...event,
                  resource_id: assignedTeam
                }, {
                  onConflict: 'booking_id,event_type,start_time'
                })

              if (eventError) {
                console.error(`Error creating calendar event:`, eventError)
              } else {
                results.calendar_events_created++
              }
            }
          } else {
            console.log(`No new calendar events needed for booking ${bookingData.id}`)
          }
        }

      } catch (error) {
        console.error(`Error processing booking ${externalBooking.id}:`, error)
        results.errors.push({ booking_id: externalBooking.id, error: error.message })
        results.failed++
      }
    }

    // SAVE SYNC TIMESTAMP - This is crucial for incremental sync
    const currentTimestamp = new Date().toISOString()
    console.log(`Saving sync timestamp: ${currentTimestamp}`)
    
    const { error: syncError } = await supabase
      .from('sync_state')
      .upsert({
        sync_type: 'booking_import',
        last_sync_timestamp: currentTimestamp,
        last_sync_mode: syncMode,
        last_sync_status: results.failed > 0 ? 'partial_success' : 'success',
        metadata: { results }
      })

    if (syncError) {
      console.error('Error saving sync state:', syncError)
    } else {
      console.log('Sync timestamp saved successfully')
    }

    console.log('Import results:', {
      total: results.total,
      imported: results.imported,
      new_bookings: results.new_bookings.length,
      updated_bookings: results.updated_bookings.length,
      duplicates_skipped: results.duplicates_skipped.length,
      cancelled_skipped: results.cancelled_bookings_skipped.length,
      calendar_events_created: results.calendar_events_created
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
          products_imported: 0,
          attachments_imported: 0,
          new_bookings: [],
          updated_bookings: [],
          status_changed_bookings: [],
          cancelled_bookings_skipped: [],
          duplicates_skipped: [],
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
