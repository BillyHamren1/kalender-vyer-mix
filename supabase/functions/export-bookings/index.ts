
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

// Main handler function
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
    // Validate API key
    if (!await validateApiKey(req)) {
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
    const filters = getFiltersFromUrl(req.url);
    console.log(`Export request received with filters - startDate: ${filters.startDate}, endDate: ${filters.endDate}, client: ${filters.clientName}`)
    
    // Fetch filtered bookings data
    const bookingsData = await fetchFilteredBookings(supabaseClient, filters);
    if (!bookingsData) {
      throw new Error('Failed to fetch bookings data')
    }
    
    console.log(`Retrieved ${bookingsData.length || 0} bookings from database`)
    
    // Process bookings to include all related data
    const bookings = await processBookings(supabaseClient, bookingsData);
    
    console.log(`Returning ${bookings.length} processed bookings with their products, attachments, and assigned staff`)

    // Return the response
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

// Validate API key from request headers
async function validateApiKey(req: Request): Promise<boolean> {
  const API_KEY = Deno.env.get('EXPORT_API_KEY')
  const apiKey = req.headers.get('x-api-key')
  
  if (!apiKey || apiKey !== API_KEY) {
    console.error('Invalid or missing API key in x-api-key header')
    return false
  }
  
  return true
}

// Extract filter parameters from URL
function getFiltersFromUrl(url: string) {
  const urlObj = new URL(url)
  return {
    startDate: urlObj.searchParams.get('startDate'),
    endDate: urlObj.searchParams.get('endDate'),
    clientName: urlObj.searchParams.get('client')
  }
}

// Fetch bookings with filters applied
async function fetchFilteredBookings(supabase, filters) {
  // Build base query for bookings
  let query = supabase
    .from('bookings')
    .select()
    .order('eventdate', { ascending: true })
  
  // Apply filters
  if (filters.startDate) {
    query = query.gte('eventdate', filters.startDate)
  }
  
  if (filters.endDate) {
    query = query.lte('eventdate', filters.endDate)
  }
  
  if (filters.clientName) {
    query = query.ilike('client', `%${filters.clientName}%`)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching bookings:', error)
    throw new Error(`Failed to fetch bookings: ${error.message}`)
  }
  
  return data
}

// Get all products for a booking
async function fetchBookingProducts(supabase, bookingId) {
  const { data, error } = await supabase
    .from('booking_products')
    .select('*')
    .eq('booking_id', bookingId)
  
  if (error) {
    console.error(`Error fetching products for booking ${bookingId}:`, error)
    return null
  }
  
  return data.map(product => ({
    name: product.name,
    quantity: product.quantity,
    notes: product.notes || undefined
  }))
}

// Get all attachments for a booking
async function fetchBookingAttachments(supabase, bookingId) {
  const { data, error } = await supabase
    .from('booking_attachments')
    .select('*')
    .eq('booking_id', bookingId)
  
  if (error) {
    console.error(`Error fetching attachments for booking ${bookingId}:`, error)
    return null
  }
  
  return data.map(attachment => ({
    url: attachment.url,
    file_name: attachment.file_name || 'Unnamed File',
    file_type: attachment.file_type || 'application/octet-stream',
    uploaded_at: attachment.uploaded_at
  }))
}

// Get team IDs for a booking from calendar events
async function fetchBookingTeamIds(supabase, bookingId) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('resource_id')
    .eq('booking_id', bookingId)
    .order('start_time', { ascending: true })
  
  if (error) {
    console.error(`Error fetching calendar events for booking ${bookingId}:`, error)
    return []
  }
  
  // Get unique team IDs
  return data ? [...new Set(data.map(event => event.resource_id))] : []
}

// Get staff assignments for a team on specific dates
async function fetchStaffAssignments(supabase, teamId, relevantDates) {
  const assignedStaff = []
  
  for (const date of relevantDates) {
    const { data: staffAssignmentsData, error: staffAssignmentsError } = await supabase
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
      // Add staff members with assignment details including both ID formats
      for (const assignment of staffAssignmentsData) {
        assignedStaff.push({
          assignment_id: assignment.id, // UUID format
          assignment_string_id: assignment.id, // Same UUID as string for compatibility
          team_id: assignment.team_id,
          date: assignment.assignment_date,
          staff: {
            id: assignment.staff_members.id, // Original ID format (likely string)
            uuid: assignment.staff_id, // String format ID
            uuid_id: assignment.staff_members.id, // UUID format when available
            name: assignment.staff_members.name,
            email: assignment.staff_members.email || undefined,
            phone: assignment.staff_members.phone || undefined
          }
        })
      }
    }
  }
  
  return assignedStaff
}

// Process all bookings to include their related data
async function processBookings(supabase, bookingsData) {
  const bookings = []
  
  for (const booking of bookingsData || []) {
    try {
      // Fetch products for this booking
      const products = await fetchBookingProducts(supabase, booking.id)
      if (!products) continue
      
      // Fetch attachments for this booking
      const attachments = await fetchBookingAttachments(supabase, booking.id)
      if (!attachments) continue
      
      // Fetch team IDs for this booking
      const teamIds = await fetchBookingTeamIds(supabase, booking.id)
      
      // Find the relevant dates from booking for staff assignments
      const relevantDates = [
        booking.rigdaydate, 
        booking.eventdate, 
        booking.rigdowndate
      ].filter(date => date) // Filter out null/undefined dates
      
      // For each team, fetch assigned staff members
      let assignedStaff = []
      
      for (const teamId of teamIds) {
        if (relevantDates.length === 0) continue
        
        const teamStaff = await fetchStaffAssignments(supabase, teamId, relevantDates)
        assignedStaff = [...assignedStaff, ...teamStaff]
      }
      
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
    } catch (error) {
      console.error(`Error processing booking ${booking.id}:`, error)
    }
  }
  
  return bookings
}
