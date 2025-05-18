
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
    const EXTERNAL_BOOKING_API_KEY = Deno.env.get('EXTERNAL_BOOKING_API_KEY')
    if (!EXTERNAL_BOOKING_API_KEY) {
      console.error('Missing EXTERNAL_BOOKING_API_KEY in environment variables')
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
    const { startDate, endDate, clientName } = requestData

    // Build the URL for the external bookings API
    const externalApiUrl = new URL("https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings")
    
    // Add query parameters if provided
    if (startDate) externalApiUrl.searchParams.append('startDate', startDate)
    if (endDate) externalApiUrl.searchParams.append('endDate', endDate)
    if (clientName) externalApiUrl.searchParams.append('client', clientName)

    console.log(`Fetching bookings from external API: ${externalApiUrl.toString()}`)

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
    console.log(`Received ${externalData.count} bookings from external API`)

    // Keep track of imports
    const results = {
      total: externalData.count,
      imported: 0,
      failed: 0,
      calendar_events_created: 0,
      errors: [],
    }

    // Process each booking
    for (const externalBooking of externalData.bookings) {
      try {
        console.log(`Processing booking ${externalBooking.id}: ${externalBooking.client}`)
        
        // Check if booking already exists
        const { data: existingBooking } = await supabaseClient
          .from('bookings')
          .select('id')
          .eq('id', externalBooking.id)
          .maybeSingle()

        // Prepare booking data
        const bookingData = {
          id: externalBooking.id,
          client: externalBooking.client,
          rigdaydate: externalBooking.rigdaydate,
          eventdate: externalBooking.eventdate,
          rigdowndate: externalBooking.rigdowndate,
          deliveryaddress: externalBooking.deliveryaddress,
          internalnotes: externalBooking.internalnotes,
          created_at: externalBooking.created_at || new Date().toISOString(),
          updated_at: externalBooking.updated_at || new Date().toISOString()
        }

        // Insert or update booking
        if (existingBooking) {
          // Update existing booking
          const { error: updateError } = await supabaseClient
            .from('bookings')
            .update(bookingData)
            .eq('id', externalBooking.id)

          if (updateError) {
            throw new Error(`Failed to update booking: ${updateError.message}`)
          }
          
          // Delete existing products & attachments for clean slate
          await supabaseClient.from('booking_products').delete().eq('booking_id', externalBooking.id)
          await supabaseClient.from('booking_attachments').delete().eq('booking_id', externalBooking.id)
          
          console.log(`Updated existing booking ${externalBooking.id}`)
        } else {
          // Insert new booking
          const { error: insertError } = await supabaseClient
            .from('bookings')
            .insert(bookingData)

          if (insertError) {
            throw new Error(`Failed to insert booking: ${insertError.message}`)
          }
          
          console.log(`Inserted new booking ${externalBooking.id}`)
        }

        // Insert products if available
        if (externalBooking.products && externalBooking.products.length > 0) {
          const products = externalBooking.products.map(product => ({
            booking_id: externalBooking.id,
            name: product.name,
            quantity: product.quantity,
            notes: product.notes
          }))

          const { error: productsError } = await supabaseClient
            .from('booking_products')
            .insert(products)

          if (productsError) {
            console.error(`Error inserting products for booking ${externalBooking.id}:`, productsError)
          } else {
            console.log(`Inserted ${products.length} products for booking ${externalBooking.id}`)
          }
        }

        // Insert attachments if available
        if (externalBooking.attachments && externalBooking.attachments.length > 0) {
          const attachments = externalBooking.attachments.map(attachment => ({
            booking_id: externalBooking.id,
            url: attachment.url,
            file_name: attachment.fileName || attachment.file_name,
            file_type: attachment.fileType || attachment.file_type,
            uploaded_at: attachment.uploaded_at || new Date().toISOString()
          }))

          const { error: attachmentsError } = await supabaseClient
            .from('booking_attachments')
            .insert(attachments)

          if (attachmentsError) {
            console.error(`Error inserting attachments for booking ${externalBooking.id}:`, attachmentsError)
          } else {
            console.log(`Inserted ${attachments.length} attachments for booking ${externalBooking.id}`)
          }
        }

        // Create calendar events
        await createCalendarEvents(supabaseClient, externalBooking)
        results.calendar_events_created += 3 // Assuming 3 events: rig, event, rigdown
        
        results.imported++
        console.log(`Successfully imported booking ${externalBooking.id}`)
      } catch (error) {
        console.error(`Error importing booking ${externalBooking.id}:`, error)
        results.failed++
        results.errors.push({
          booking_id: externalBooking.id,
          error: error.message
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        results
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

// Helper function to create calendar events for a booking
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
    
    // Check if event already exists
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('event_type', eventType)
      .maybeSingle()
    
    if (existingEvent) {
      // Update existing event
      const { error } = await supabase
        .from('calendar_events')
        .update(eventData)
        .eq('id', existingEvent.id)
        
      if (error) throw error
      return existingEvent.id
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
  
  // Create the three event types if dates exist
  if (booking.rigdaydate) {
    const rigEventId = await createEvent(booking.rigdaydate, 'rig')
    if (rigEventId) events.push(rigEventId)
  }
  
  if (booking.eventdate) {
    const mainEventId = await createEvent(booking.eventdate, 'event')
    if (mainEventId) events.push(mainEventId)
  }
  
  if (booking.rigdowndate) {
    const rigDownEventId = await createEvent(booking.rigdowndate, 'rigDown')
    if (rigDownEventId) events.push(rigDownEventId)
  }
  
  return events
}
