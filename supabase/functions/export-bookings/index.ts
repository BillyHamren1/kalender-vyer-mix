import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

// Map database resource ID format to app format
const mapDatabaseToAppResourceId = (dbResourceId: string): string => {
  // Single character IDs are legacy format - convert to team-X
  if (dbResourceId && dbResourceId.length === 1) {
    const charCode = dbResourceId.charCodeAt(0);
    
    // Map a=1, b=2, c=3, d=4, e=5, f=6, etc.
    if (charCode >= 97 && charCode <= 122) { // lowercase a-z
      const teamNumber = charCode - 96; // a=1, b=2, etc.
      const mappedId = `team-${teamNumber}`;
      console.log(`🔄 Mapping database ID "${dbResourceId}" to app format "${mappedId}"`);
      return mappedId;
    }
    
    // If it's a number, map directly
    if (!isNaN(parseInt(dbResourceId))) {
      return `team-${dbResourceId}`;
    }
  }
  
  // If already in team-X format or other valid format, return as-is
  return dbResourceId;
};

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
    console.log(`Export request received with filters - startDate: ${filters.startDate}, endDate: ${filters.endDate}, client: ${filters.clientName}, timestamp: ${filters.timestamp}`)
    
    // If timestamp is provided, return ALL bookings updated since that timestamp (including status changes)
    if (filters.timestamp) {
      console.log(`Timestamp-based filtering: returning ALL bookings updated after ${filters.timestamp} (including status changes)`)
      const updatedBookings = await fetchUpdatedBookingsSinceTimestamp(supabaseClient, filters);
      
      console.log(`Returning ${updatedBookings.length} updated bookings since ${filters.timestamp} (all statuses)`)
      
      return new Response(
        JSON.stringify({
          count: updatedBookings.length,
          bookings: updatedBookings,
          filtered_by_timestamp: filters.timestamp,
          export_type: 'incremental_update'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Fetch filtered CONFIRMED bookings data only (full export)
    const bookingsData = await fetchFilteredConfirmedBookings(supabaseClient, filters);
    if (!bookingsData) {
      throw new Error('Failed to fetch bookings data')
    }
    
    console.log(`Retrieved ${bookingsData.length || 0} CONFIRMED bookings from database`)
    
    // Process bookings to include all related data
    const bookings = await processBookings(supabaseClient, bookingsData);
    
    console.log(`Returning ${bookings.length} processed CONFIRMED bookings with their products, attachments, and assigned staff`)

    // Return the response
    return new Response(
      JSON.stringify({
        count: bookings.length,
        bookings: bookings,
        status_filter: 'CONFIRMED',
        export_type: 'full_export'
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
    clientName: urlObj.searchParams.get('client'),
    timestamp: urlObj.searchParams.get('timestamp') // New timestamp parameter
  }
}

// Fetch CONFIRMED bookings with filters applied (for full exports only)
async function fetchFilteredConfirmedBookings(supabase, filters) {
  // Build base query for CONFIRMED bookings only
  let query = supabase
    .from('bookings')
    .select()
    .eq('status', 'CONFIRMED') // Only fetch CONFIRMED bookings for full exports
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
    console.error('Error fetching CONFIRMED bookings:', error)
    throw new Error(`Failed to fetch CONFIRMED bookings: ${error.message}`)
  }
  
  return data
}

// Fetch ALL bookings updated since a specific timestamp (for incremental updates - includes ALL statuses)
async function fetchUpdatedBookingsSinceTimestamp(supabase, filters) {
  // Build query for ALL bookings updated after the timestamp (no status filter)
  let query = supabase
    .from('bookings')
    .select()
    .gt('updated_at', filters.timestamp) // Only bookings updated after timestamp
    .order('updated_at', { ascending: true })
  
  // Apply additional filters if provided
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
    console.error('Error fetching updated bookings:', error)
    throw new Error(`Failed to fetch updated bookings: ${error.message}`)
  }
  
  // Process the bookings to include related data
  return await processBookings(supabase, data);
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
    notes: product.notes || undefined,
    unit_price: product.unit_price || undefined,
    total_price: product.total_price || undefined,
    is_package_component: product.is_package_component || false,
    parent_package_id: product.parent_package_id || undefined,
    parent_product_id: product.parent_product_id || undefined,
    sku: product.sku || undefined,
    setup_hours: product.setup_hours || undefined,
    labor_cost: product.labor_cost || undefined,
    material_cost: product.material_cost || undefined,
    external_cost: product.external_cost || undefined,
    cost_notes: product.cost_notes || undefined
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

// Get team IDs for a booking by event type from calendar events
async function fetchBookingTeamIdsByEventType(supabase, bookingId) {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('resource_id, event_type, start_time')
    .eq('booking_id', bookingId)
    .order('start_time', { ascending: true })
  
  if (error) {
    console.error(`Error fetching calendar events for booking ${bookingId}:`, error)
    return { rig: [], event: [], rigDown: [] }
  }
  
  const eventTypeTeams = { rig: [], event: [], rigDown: [] }
  
  if (data) {
    data.forEach(event => {
      const mappedTeamId = mapDatabaseToAppResourceId(event.resource_id)
      const eventType = event.event_type || 'event' // Default to 'event' if no type specified
      
      if (eventTypeTeams[eventType] && !eventTypeTeams[eventType].includes(mappedTeamId)) {
        eventTypeTeams[eventType].push(mappedTeamId)
      }
    })
  }
  
  console.log(`📋 Booking ${bookingId} team mapping by event type:`, eventTypeTeams)
  
  return eventTypeTeams
}

// Get staff assignments for specific event type and teams
async function fetchStaffAssignmentsByEventType(supabase, eventType, teamIds, bookingDates) {
  const assignedStaff = []
  
  // Determine which date to use based on event type
  let relevantDate = null
  if (eventType === 'rig' && bookingDates.rigdaydate) {
    relevantDate = bookingDates.rigdaydate
  } else if (eventType === 'event' && bookingDates.eventdate) {
    relevantDate = bookingDates.eventdate
  } else if (eventType === 'rigDown' && bookingDates.rigdowndate) {
    relevantDate = bookingDates.rigdowndate
  }
  
  if (!relevantDate || teamIds.length === 0) {
    return assignedStaff
  }
  
  for (const teamId of teamIds) {
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
      .eq('assignment_date', relevantDate)
    
    if (staffAssignmentsError) {
      console.error(`Error fetching staff assignments for team ${teamId} on ${relevantDate}:`, staffAssignmentsError)
      continue
    }
    
    if (staffAssignmentsData && staffAssignmentsData.length > 0) {
      for (const assignment of staffAssignmentsData) {
        assignedStaff.push({
          assignment_id: assignment.id,
          assignment_string_id: assignment.id,
          team_id: assignment.team_id,
          date: assignment.assignment_date,
          event_type: eventType,
          staff: {
            id: assignment.staff_members.id,
            uuid: assignment.staff_id,
            uuid_id: assignment.staff_members.id,
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

// Process all bookings to include their related data with event-specific staff assignments
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
      
      // Fetch team IDs by event type for this booking
      const teamIdsByEventType = await fetchBookingTeamIdsByEventType(supabase, booking.id)
      
      // Prepare booking dates for staff assignment queries
      const bookingDates = {
        rigdaydate: booking.rigdaydate,
        eventdate: booking.eventdate,
        rigdowndate: booking.rigdowndate
      }
      
      // Fetch staff assignments for each event type separately
      const rigStaff = await fetchStaffAssignmentsByEventType(
        supabase, 'rig', teamIdsByEventType.rig, bookingDates
      )
      const eventStaff = await fetchStaffAssignmentsByEventType(
        supabase, 'event', teamIdsByEventType.event, bookingDates
      )
      const rigDownStaff = await fetchStaffAssignmentsByEventType(
        supabase, 'rigDown', teamIdsByEventType.rigDown, bookingDates
      )
      
      // Log the geodata being added
      console.log(`Booking ${booking.id} geodata: latitude=${booking.delivery_latitude}, longitude=${booking.delivery_longitude}`)
      
      // Construct the booking object with all information and event-specific staff
      bookings.push({
        id: booking.id,
        bookingNumber: booking.booking_number || undefined,
        client: booking.client,
        status: booking.status,
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
        rigStaff,
        eventStaff,
        rigDownStaff,
        created_at: booking.created_at,
        updated_at: booking.updated_at
      })
    } catch (error) {
      console.error(`Error processing booking ${booking.id}:`, error)
    }
  }
  
  return bookings
}
