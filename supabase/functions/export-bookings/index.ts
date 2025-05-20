
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
    
    console.log(`Export request received with filters - startDate: ${startDate}, endDate: ${endDate}, client: ${clientName}`)
    
    // Build base query for bookings
    let query = supabaseClient
      .from('bookings')
      .select()
      .order('eventdate', { ascending: true })
    
    // Apply filters
    if (startDate) {
      query = query.gte('eventdate', startDate)
    }
    
    if (endDate) {
      query = query.lte('eventdate', endDate)
    }
    
    if (clientName) {
      query = query.ilike('client', `%${clientName}%`)
    }
    
    // Fetch bookings with applied filters
    const { data: bookingsData, error: bookingsError } = await query
    
    if (bookingsError) {
      console.error('Error fetching bookings:', bookingsError)
      throw new Error(`Failed to fetch bookings: ${bookingsError.message}`)
    }
    
    console.log(`Retrieved ${bookingsData?.length || 0} bookings from database`)
    
    // Process bookings to include products, attachments, and staff
    const bookings = []
    
    for (const booking of bookingsData || []) {
      // Fetch products for this booking
      const { data: productsData, error: productsError } = await supabaseClient
        .from('booking_products')
        .select('*')
        .eq('booking_id', booking.id)
      
      if (productsError) {
        console.error(`Error fetching products for booking ${booking.id}:`, productsError)
        continue // Skip this booking if we can't fetch its products
      }
      
      // Fetch attachments for this booking
      const { data: attachmentsData, error: attachmentsError } = await supabaseClient
        .from('booking_attachments')
        .select('*')
        .eq('booking_id', booking.id)
      
      if (attachmentsError) {
        console.error(`Error fetching attachments for booking ${booking.id}:`, attachmentsError)
        continue // Skip this booking if we can't fetch its attachments
      }
      
      // Fetch calendar events for this booking to get related team IDs
      const { data: calendarEventsData, error: calendarEventsError } = await supabaseClient
        .from('calendar_events')
        .select('resource_id')
        .eq('booking_id', booking.id)
        .order('start_time', { ascending: true })
      
      if (calendarEventsError) {
        console.error(`Error fetching calendar events for booking ${booking.id}:`, calendarEventsError)
      }
      
      // Get unique team IDs from calendar events
      const teamIds = calendarEventsData ? 
        [...new Set(calendarEventsData.map(event => event.resource_id))] : 
        []
      
      // For each team, fetch assigned staff members
      const assignedStaff = []
      
      for (const teamId of teamIds) {
        // Find the relevant dates from booking for staff assignments
        const relevantDates = [
          booking.rigdaydate, 
          booking.eventdate, 
          booking.rigdowndate
        ].filter(date => date) // Filter out null/undefined dates
        
        if (relevantDates.length === 0) continue
        
        for (const date of relevantDates) {
          // Fetch staff assignments for this team on this date
          const { data: staffAssignmentsData, error: staffAssignmentsError } = await supabaseClient
            .from('staff_assignments')
            .select(`
              id,
              team_id,
              staff_id,
              assignment_date,
              staff_members (
                id,
                name,
                email,
                phone
              )
            `)
            .eq('team_id', teamId)
            .eq('assignment_date', date)
          
          if (staffAssignmentsError) {
            console.error(`Error fetching staff assignments for team ${teamId} on ${date}:`, staffAssignmentsError)
            continue
          }
          
          if (staffAssignmentsData && staffAssignmentsData.length > 0) {
            // Add staff members with assignment details
            for (const assignment of staffAssignmentsData) {
              assignedStaff.push({
                assignment_id: assignment.id,
                team_id: assignment.team_id,
                date: assignment.assignment_date,
                staff: assignment.staff_members
              })
            }
          }
        }
      }
      
      // Format products and attachments
      const products = productsData.map(product => ({
        name: product.name,
        quantity: product.quantity,
        notes: product.notes || undefined
      }))
      
      const attachments = attachmentsData.map(attachment => ({
        url: attachment.url,
        file_name: attachment.file_name || 'Unnamed File',
        file_type: attachment.file_type || 'application/octet-stream',
        uploaded_at: attachment.uploaded_at
      }))
      
      // Log the geodata being added
      console.log(`Booking ${booking.id} geodata: latitude=${booking.delivery_latitude}, longitude=${booking.delivery_longitude}`)
      
      // Construct the booking object with all information
      bookings.push({
        id: booking.id,
        client: booking.client,
        rigdaydate: booking.rigdaydate,
        eventdate: booking.eventdate,
        rigdowndate: booking.rigdowndate,
        deliveryaddress: booking.deliveryaddress || undefined,
        deliveryCity: booking.delivery_city || undefined,
        deliveryPostalCode: booking.delivery_postal_code || undefined,
        deliveryLatitude: booking.delivery_latitude || undefined,
        deliveryLongitude: booking.delivery_longitude || undefined,
        carryMoreThan10m: booking.carry_more_than_10m || false,
        groundNailsAllowed: booking.ground_nails_allowed || false,
        exactTimeNeeded: booking.exact_time_needed || false,
        exactTimeInfo: booking.exact_time_info || undefined,
        internalnotes: booking.internalnotes || undefined,
        products,
        attachments,
        staff: assignedStaff,
        created_at: booking.created_at,
        updated_at: booking.updated_at
      })
    }
    
    console.log(`Returning ${bookings.length} processed bookings with their products, attachments, and assigned staff`)

    // Return the real data in the expected format
    return new Response(
      JSON.stringify({
        count: bookings.length,
        bookings: bookings
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error processing request:', error)
    return new Response(
      JSON.stringify({ error: 'Internal Server Error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
