import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Get the external API key for the bookings API
    const EXTERNAL_BOOKING_API_KEY = Deno.env.get('EXPORT_API_KEY')
    if (!EXTERNAL_BOOKING_API_KEY) {
      console.error('Missing EXPORT_API_KEY in environment variables')
      return new Response(
        JSON.stringify({ error: 'External booking API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Parse request body for filter parameters
    const requestData = await req.json().catch(() => ({}))
    const { startDate, endDate, clientName, quiet = false } = requestData

    // Build the URL for the external bookings API
    const externalApiUrl = new URL("https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings")
    
    // Add query parameters if provided
    if (startDate) externalApiUrl.searchParams.append('startDate', startDate)
    if (endDate) externalApiUrl.searchParams.append('endDate', endDate)
    if (clientName) externalApiUrl.searchParams.append('client', clientName)

    if (!quiet) {
      console.log(`Fetching bookings from external API: ${externalApiUrl.toString()}`)
    }

    // Fetch bookings from the external API using x-api-key header
    const externalResponse = await fetch(externalApiUrl.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': EXTERNAL_BOOKING_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!externalResponse.ok) {
      const errorText = await externalResponse.text()
      console.error(`Error from external API: ${externalResponse.status} - ${errorText}`)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch from external bookings API',
          status: externalResponse.status,
          details: errorText
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }

    // Parse the external API response
    const externalData = await externalResponse.json()
    
    // Check if we have the data array in the response
    if (!externalData || !externalData.data || !Array.isArray(externalData.data)) {
      console.error('Invalid response format from external API:', JSON.stringify(externalData))
      return new Response(
        JSON.stringify({ 
          error: 'External API returned an invalid response format',
          receivedData: externalData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
      )
    }
    
    const bookings = externalData.data
    if (!quiet) {
      console.log(`Received ${bookings.length} bookings from external API`)
    }

    // Keep track of imports
    const results = {
      total: bookings.length,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      new_bookings: [] as string[],
      updated_bookings: [] as string[],
      status_changed_bookings: [] as string[],
      errors: [] as { booking_id: string; error: string }[],
    }

    // Process each booking
    for (const externalBooking of bookings) {
      try {
        if (!quiet) {
          console.log(`Processing booking ${externalBooking.booking_number}: ${externalBooking.clients?.name || 'Unknown client'}`)
        }
        
        // Check if the booking has the required fields
        if (!externalBooking.booking_number || !externalBooking.clients?.name) {
          throw new Error('Booking is missing required fields (booking_number or client name)')
        }

        // Extract dates from arrays, using the first item for backward compatibility
        // But we'll store all dates when creating calendar events
        const rigdaydate = externalBooking.rig_up_dates && externalBooking.rig_up_dates.length > 0 
          ? externalBooking.rig_up_dates[0] : null
        const eventdate = externalBooking.event_dates && externalBooking.event_dates.length > 0 
          ? externalBooking.event_dates[0] : null
        const rigdowndate = externalBooking.rig_down_dates && externalBooking.rig_down_dates.length > 0 
          ? externalBooking.rig_down_dates[0] : null

        // Check if booking already exists
        const { data: existingBooking } = await supabaseClient
          .from('bookings')
          .select('id, updated_at, status')
          .eq('id', externalBooking.booking_number)
          .maybeSingle()

        // Extract location data for geocoding - improved with better handling of nested data
        let deliveryLatitude = null;
        let deliveryLongitude = null;

        // Check for location data in different places and formats
        if (externalBooking.delivery_latitude !== undefined && externalBooking.delivery_latitude !== null) {
          deliveryLatitude = parseFloat(externalBooking.delivery_latitude);
          if (!quiet) {
            console.log(`Found delivery_latitude directly: ${deliveryLatitude}`);
          }
        } else if (externalBooking.location_lat !== undefined && externalBooking.location_lat !== null) {
          deliveryLatitude = parseFloat(externalBooking.location_lat);
          if (!quiet) {
            console.log(`Found location_lat: ${deliveryLatitude}`);
          }
        } else if (externalBooking.location?.lat !== undefined && externalBooking.location?.lat !== null) {
          deliveryLatitude = parseFloat(externalBooking.location.lat);
          if (!quiet) {
            console.log(`Found location.lat: ${deliveryLatitude}`);
          }
        }

        if (externalBooking.delivery_longitude !== undefined && externalBooking.delivery_longitude !== null) {
          deliveryLongitude = parseFloat(externalBooking.delivery_longitude);
          if (!quiet) {
            console.log(`Found delivery_longitude directly: ${deliveryLongitude}`);
          }
        } else if (externalBooking.location_lng !== undefined && externalBooking.location_lng !== null) {
          deliveryLongitude = parseFloat(externalBooking.location_lng);
          if (!quiet) {
            console.log(`Found location_lng: ${deliveryLongitude}`);
          }
        } else if (externalBooking.location?.lng !== undefined && externalBooking.location?.lng !== null) {
          deliveryLongitude = parseFloat(externalBooking.location.lng);
          if (!quiet) {
            console.log(`Found location.lng: ${deliveryLongitude}`);
          }
        }
        
        // Validate coordinates are numbers and within valid ranges
        if (deliveryLatitude !== null && (isNaN(deliveryLatitude) || deliveryLatitude < -90 || deliveryLatitude > 90)) {
          console.warn(`Invalid latitude value for booking ${externalBooking.booking_number}: ${deliveryLatitude}`);
          deliveryLatitude = null;
        }
        
        if (deliveryLongitude !== null && (isNaN(deliveryLongitude) || deliveryLongitude < -180 || deliveryLongitude > 180)) {
          console.warn(`Invalid longitude value for booking ${externalBooking.booking_number}: ${deliveryLongitude}`);
          deliveryLongitude = null;
        }
        
        if (!quiet && (deliveryLatitude !== null || deliveryLongitude !== null)) {
          console.log(`Using coordinates for booking ${externalBooking.booking_number}: ${deliveryLatitude}, ${deliveryLongitude}`);
        }
                                
        // Get the status from external booking, defaulting to 'PENDING' if not provided
        const externalStatus = externalBooking.status || 'PENDING'
                              
        // Check for status change (especially CONFIRMED to any other status)
        let statusChanged = false
        if (existingBooking && existingBooking.status !== externalStatus) {
          if (!quiet) {
            console.log(`Status changed for booking ${externalBooking.booking_number}: ${existingBooking.status} -> ${externalStatus}`)
          }
          
          statusChanged = true
          results.status_changed_bookings.push(externalBooking.booking_number)
          
          // If status was previously CONFIRMED and now it's not, we need to remove calendar events
          // Make this case-insensitive by converting both to uppercase
          if (existingBooking.status.toUpperCase() === 'CONFIRMED' && externalStatus.toUpperCase() !== 'CONFIRMED') {
            if (!quiet) {
              console.log(`Removing calendar events for booking ${externalBooking.booking_number} as status changed from CONFIRMED to ${externalStatus}`)
            }
            
            try {
              await deleteAllBookingEvents(supabaseClient, externalBooking.booking_number)
            } catch (error) {
              console.error(`Error removing calendar events for booking ${externalBooking.booking_number}:`, error)
            }
          }
        }
        
        // Extract address components
        const deliveryAddress = externalBooking.delivery_address || 
                              (externalBooking.location ? `${externalBooking.location}` : null);
        const deliveryCity = externalBooking.delivery_city || externalBooking.city || 
                           (externalBooking.location?.city ? externalBooking.location.city : null);
        const deliveryPostalCode = externalBooking.delivery_postal_code || externalBooking.postal_code || 
                                 (externalBooking.location?.postal_code ? externalBooking.location.postal_code : null);
        
        // Prepare booking data - map external fields to our schema
        const bookingData = {
          id: externalBooking.booking_number, // Use booking_number as our ID
          client: externalBooking.clients?.name, // Use client name from clients object
          rigdaydate: rigdaydate, // Use first rig_up_date for backward compatibility
          eventdate: eventdate, // Use first event_date for backward compatibility
          rigdowndate: rigdowndate, // Use first rig_down_date for backward compatibility
          deliveryaddress: deliveryAddress,
          // Delivery address details
          delivery_city: deliveryCity,
          delivery_postal_code: deliveryPostalCode,
          delivery_latitude: deliveryLatitude,
          delivery_longitude: deliveryLongitude,
          // Logistics options
          carry_more_than_10m: externalBooking.carry_more_than_10m || false,
          ground_nails_allowed: externalBooking.ground_nails_allowed || false,
          exact_time_needed: externalBooking.exact_time_needed || false,
          exact_time_info: externalBooking.exact_time_info || null,
          internalnotes: externalBooking.internal_notes,
          created_at: externalBooking.created_at || new Date().toISOString(),
          updated_at: externalBooking.updated_at || new Date().toISOString(),
          status: externalStatus, // Use the status from external booking
          viewed: existingBooking ? (statusChanged ? false : true) : false // Mark as unviewed for new bookings or status changes
        }

        if (!quiet) {
          console.log(`Booking data to be saved:`, JSON.stringify({
            id: bookingData.id,
            client: bookingData.client,
            delivery_latitude: bookingData.delivery_latitude,
            delivery_longitude: bookingData.delivery_longitude,
            deliveryaddress: bookingData.deliveryaddress,
            delivery_city: bookingData.delivery_city,
            delivery_postal_code: bookingData.delivery_postal_code
          }));
        }

        // Check if external booking has a newer update timestamp when existing booking exists
        let isUpdated = false;
        if (existingBooking) {
          if (externalBooking.updated_at && 
              new Date(externalBooking.updated_at) > new Date(existingBooking.updated_at)) {
            isUpdated = true;
          }
          
          // Update existing booking
          const { error: updateError } = await supabaseClient
            .from('bookings')
            .update(bookingData)
            .eq('id', externalBooking.booking_number)

          if (updateError) {
            throw new Error(`Failed to update booking: ${updateError.message}`)
          }
          
          // Delete existing products & attachments for clean slate
          await supabaseClient.from('booking_products').delete().eq('booking_id', externalBooking.booking_number)
          await supabaseClient.from('booking_attachments').delete().eq('booking_id', externalBooking.booking_number)
          
          if (!quiet) {
            console.log(`Updated existing booking ${externalBooking.booking_number}`)
          }
          
          // Track updated bookings
          if (isUpdated && !statusChanged) {
            results.updated_bookings.push(externalBooking.booking_number);
          }
        } else {
          // Insert new booking
          const { error: insertError } = await supabaseClient
            .from('bookings')
            .insert(bookingData)

          if (insertError) {
            throw new Error(`Failed to insert booking: ${insertError.message}`)
          }
          
          if (!quiet) {
            console.log(`Inserted new booking ${externalBooking.booking_number}`)
          }
          
          // Track new bookings
          results.new_bookings.push(externalBooking.booking_number);
        }

        // Insert products if available
        if (externalBooking.products && externalBooking.products.length > 0) {
          const products = externalBooking.products.map(product => ({
            booking_id: externalBooking.booking_number,
            name: product.product_name || product.name,
            quantity: product.quantity,
            notes: product.notes || null
          }))

          const { error: productsError } = await supabaseClient
            .from('booking_products')
            .insert(products)

          if (productsError) {
            console.error(`Error inserting products for booking ${externalBooking.booking_number}:`, productsError)
          } else if (!quiet) {
            console.log(`Inserted ${products.length} products for booking ${externalBooking.booking_number}`)
          }
        }

        // Insert attachments if available (files_metadata)
        if (externalBooking.files_metadata && externalBooking.files_metadata.length > 0) {
          const attachments = externalBooking.files_metadata.map(attachment => ({
            booking_id: externalBooking.booking_number,
            url: attachment.url,
            file_name: attachment.file_name || attachment.fileName || 'Unknown file',
            file_type: attachment.file_type || attachment.fileType || 'application/octet-stream',
            uploaded_at: attachment.uploaded_at || new Date().toISOString()
          }))

          const { error: attachmentsError } = await supabaseClient
            .from('booking_attachments')
            .insert(attachments)

          if (attachmentsError) {
            console.error(`Error inserting attachments for booking ${externalBooking.booking_number}:`, attachmentsError)
          } else if (!quiet) {
            console.log(`Inserted ${attachments.length} attachments for booking ${externalBooking.booking_number}`)
          }
        }

        // Create calendar events for all dates in the arrays, but only if status is CONFIRMED
        // Make this case-insensitive by converting to uppercase before comparison
        if (externalStatus.toUpperCase() === 'CONFIRMED') {
          const eventsCreated = await createCalendarEvents(supabaseClient, {
            id: externalBooking.booking_number,
            client: externalBooking.clients?.name,
            rig_up_dates: externalBooking.rig_up_dates || [],
            event_dates: externalBooking.event_dates || [],
            rig_down_dates: externalBooking.rig_down_dates || []
          })
          
          results.calendar_events_created += eventsCreated
        }
        
        results.imported++
        if (!quiet) {
          console.log(`Successfully imported booking ${externalBooking.booking_number}`)
        }
      } catch (error) {
        console.error(`Error importing booking ${externalBooking.booking_number || 'unknown'}:`, error)
        results.failed++
        results.errors.push({
          booking_id: externalBooking.booking_number || 'unknown',
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results,
        // Include the original data for debugging if not in quiet mode
        originalData: !quiet ? {
          count: bookings.length,
          metadata: externalData.metadata
        } : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing import request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Modified function to create calendar events for multiple dates per booking
async function createCalendarEvents(supabase, booking) {
  const events = []
  const teamId = 'team-1' // Default team
  
  // Function to create a single event
  async function createEvent(date, eventType) {
    if (!date) return null

    // Create a start date (9 AM) and end date (5 PM)
    const startDate = new Date(date)
    startDate.setHours(9, 0, 0, 0)
    
    const endDate = new Date(date)
    endDate.setHours(17, 0, 0, 0)

    const title = `${booking.id}: ${booking.client}`
    
    const eventData = {
      resource_id: teamId,
      booking_id: booking.id,
      title: title,
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      event_type: eventType
    }
    
    // Check if event already exists for this specific date and event type
    const { data: existingEvents } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('event_type', eventType)
      .eq('start_time', startDate.toISOString())
      .eq('end_time', endDate.toISOString())
    
    if (existingEvents && existingEvents.length > 0) {
      // Update existing event
      const { error } = await supabase
        .from('calendar_events')
        .update(eventData)
        .eq('id', existingEvents[0].id)
        
      if (error) throw error
      return existingEvents[0].id
    } else {
      // Insert new event
      const { data, error } = await supabase
        .from('calendar_events')
        .insert(eventData)
        .select('id')
        .single()
      
      if (error) throw error
      return data.id
    }
  }
  
  // Process all rig day dates
  if (booking.rig_up_dates && booking.rig_up_dates.length > 0) {
    for (const date of booking.rig_up_dates) {
      const rigEventId = await createEvent(date, 'rig')
      if (rigEventId) events.push(rigEventId)
    }
  } else if (booking.rigdaydate) {
    // Backward compatibility
    const rigEventId = await createEvent(booking.rigdaydate, 'rig')
    if (rigEventId) events.push(rigEventId)
  }
  
  // Process all event dates
  if (booking.event_dates && booking.event_dates.length > 0) {
    for (const date of booking.event_dates) {
      const mainEventId = await createEvent(date, 'event')
      if (mainEventId) events.push(mainEventId)
    }
  } else if (booking.eventdate) {
    // Backward compatibility
    const mainEventId = await createEvent(booking.eventdate, 'event')
    if (mainEventId) events.push(mainEventId)
  }
  
  // Process all rig down dates
  if (booking.rig_down_dates && booking.rig_down_dates.length > 0) {
    for (const date of booking.rig_down_dates) {
      const rigDownEventId = await createEvent(date, 'rigDown')
      if (rigDownEventId) events.push(rigDownEventId)
    }
  } else if (booking.rigdowndate) {
    // Backward compatibility
    const rigDownEventId = await createEvent(booking.rigdowndate, 'rigDown')
    if (rigDownEventId) events.push(rigDownEventId)
  }
  
  return events.length
}

// Function to delete all calendar events for a booking
async function deleteAllBookingEvents(supabase, bookingId) {
  const { error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('booking_id', bookingId)
    
  if (error) {
    console.error(`Error deleting calendar events for booking ${bookingId}:`, error)
    throw error
  }
  
  return true
}
