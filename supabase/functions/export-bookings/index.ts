
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

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    )
  }

  try {
    // Validate API key using x-api-key header
    const API_KEY = Deno.env.get('EXPORT_API_KEY')
    const apiKey = req.headers.get('x-api-key')
    
    if (!apiKey || apiKey !== API_KEY) {
      console.error('Invalid or missing API key in x-api-key header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Create a Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    // Parse URL parameters for filtering
    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const clientName = url.searchParams.get('client')
    
    // Build query for bookings
    let query = supabaseClient.from('bookings').select(`
      id,
      client,
      rigdaydate,
      eventdate,
      rigdowndate,
      deliveryaddress,
      internalnotes,
      created_at,
      updated_at
    `)

    // Apply filters if provided
    if (startDate) {
      query = query.gte('eventdate', startDate)
    }
    
    if (endDate) {
      query = query.lte('eventdate', endDate)
    }
    
    if (clientName) {
      query = query.ilike('client', `%${clientName}%`)
    }

    // Execute the query
    const { data: bookings, error: bookingsError } = await query

    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch bookings' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // For each booking, get the associated products and attachments
    const completeBookings = await Promise.all(bookings.map(async (booking) => {
      // Get products for this booking
      const { data: products, error: productsError } = await supabaseClient
        .from('booking_products')
        .select('*')
        .eq('booking_id', booking.id)
      
      if (productsError) {
        console.error(`Error fetching products for booking ${booking.id}:`, productsError)
      }

      // Get attachments for this booking
      const { data: attachments, error: attachmentsError } = await supabaseClient
        .from('booking_attachments')
        .select('id, url, file_name, file_type, uploaded_at')
        .eq('booking_id', booking.id)
      
      if (attachmentsError) {
        console.error(`Error fetching attachments for booking ${booking.id}:`, attachmentsError)
      }

      // Return booking with products and attachments
      return {
        ...booking,
        products: products || [],
        attachments: attachments || []
      }
    }))

    // Return the data
    return new Response(
      JSON.stringify({
        count: completeBookings.length,
        bookings: completeBookings
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
