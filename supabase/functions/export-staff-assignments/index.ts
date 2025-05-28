
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Define CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, x-api-key, content-type',
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to validate the API key
const validateApiKey = async (apiKey: string | null) => {
  if (!apiKey) {
    throw new Error('Missing API key')
  }

  const expectedApiKey = Deno.env.get('EXPORT_API_KEY')
  if (!expectedApiKey) {
    throw new Error('Export API key not configured on server')
  }

  if (apiKey !== expectedApiKey) {
    throw new Error('Invalid API key')
  }

  return true
}

// Main handler for the endpoint
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the API key from the headers
    const apiKey = req.headers.get('x-api-key')
    
    // Validate the API key
    try {
      await validateApiKey(apiKey)
    } catch (error) {
      console.error('API key validation failed:', error.message)
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Starting staff assignments export...')

    // Get all staff assignments with booking information
    const { data: assignments, error: assignmentsError } = await supabase
      .from('booking_staff_assignments')
      .select(`
        *,
        staff_members (
          id,
          name,
          email,
          phone
        ),
        bookings (
          id,
          client,
          booking_number,
          status,
          rigdaydate,
          eventdate,
          rigdowndate,
          deliveryaddress,
          delivery_city,
          delivery_postal_code,
          delivery_latitude,
          delivery_longitude,
          carry_more_than_10m,
          ground_nails_allowed,
          exact_time_needed,
          exact_time_info,
          contact_name,
          contact_phone,
          contact_email,
          internalnotes,
          created_at,
          updated_at
        )
      `)
      .order('assignment_date', { ascending: false })

    if (assignmentsError) {
      console.error('Error fetching staff assignments:', assignmentsError)
      throw assignmentsError
    }

    console.log(`Found ${assignments?.length || 0} staff assignments`)

    // Get booking products for all bookings
    const bookingIds = [...new Set(assignments?.map(a => a.booking_id) || [])]
    
    const { data: products, error: productsError } = await supabase
      .from('booking_products')
      .select('*')
      .in('booking_id', bookingIds)

    if (productsError) {
      console.error('Error fetching booking products:', productsError)
      // Continue without products rather than failing
    }

    // Get booking attachments
    const { data: attachments, error: attachmentsError } = await supabase
      .from('booking_attachments')
      .select('*')
      .in('booking_id', bookingIds)

    if (attachmentsError) {
      console.error('Error fetching booking attachments:', attachmentsError)
      // Continue without attachments rather than failing
    }

    // Get calendar events for these bookings
    const { data: events, error: eventsError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('booking_id', bookingIds)

    if (eventsError) {
      console.error('Error fetching calendar events:', eventsError)
      // Continue without events rather than failing
    }

    // Create lookup maps for efficient data joining
    const productsMap = new Map()
    products?.forEach(product => {
      if (!productsMap.has(product.booking_id)) {
        productsMap.set(product.booking_id, [])
      }
      productsMap.get(product.booking_id).push(product)
    })

    const attachmentsMap = new Map()
    attachments?.forEach(attachment => {
      if (!attachmentsMap.has(attachment.booking_id)) {
        attachmentsMap.set(attachment.booking_id, [])
      }
      attachmentsMap.get(attachment.booking_id).push(attachment)
    })

    const eventsMap = new Map()
    events?.forEach(event => {
      if (!eventsMap.has(event.booking_id)) {
        eventsMap.set(event.booking_id, [])
      }
      eventsMap.get(event.booking_id).push(event)
    })

    // Process and enrich the data
    const enrichedAssignments = (assignments || []).map(assignment => {
      const staff = assignment.staff_members
      const booking = assignment.bookings
      const bookingProducts = productsMap.get(assignment.booking_id) || []
      const bookingAttachments = attachmentsMap.get(assignment.booking_id) || []
      const bookingEvents = eventsMap.get(assignment.booking_id) || []

      return {
        // Assignment information
        assignmentId: assignment.id,
        assignmentDate: assignment.assignment_date,
        teamId: assignment.team_id,
        createdAt: assignment.created_at,
        updatedAt: assignment.updated_at,

        // Staff information
        staff: {
          id: staff?.id || assignment.staff_id,
          name: staff?.name || 'Unknown Staff',
          email: staff?.email,
          phone: staff?.phone
        },

        // Complete booking information
        booking: booking ? {
          id: booking.id,
          bookingNumber: booking.booking_number,
          client: booking.client,
          status: booking.status,
          
          // Dates
          rigDayDate: booking.rigdaydate,
          eventDate: booking.eventdate,
          rigDownDate: booking.rigdowndate,
          
          // Delivery information
          deliveryAddress: booking.deliveryaddress,
          deliveryCity: booking.delivery_city,
          deliveryPostalCode: booking.delivery_postal_code,
          deliveryLatitude: booking.delivery_latitude,
          deliveryLongitude: booking.delivery_longitude,
          
          // Contact information
          contactName: booking.contact_name,
          contactPhone: booking.contact_phone,
          contactEmail: booking.contact_email,
          
          // Logistics options
          carryMoreThan10m: booking.carry_more_than_10m,
          groundNailsAllowed: booking.ground_nails_allowed,
          exactTimeNeeded: booking.exact_time_needed,
          exactTimeInfo: booking.exact_time_info,
          
          // Notes
          internalNotes: booking.internalnotes,
          
          // Products
          products: bookingProducts.map(product => ({
            id: product.id,
            name: product.name,
            quantity: product.quantity,
            notes: product.notes
          })),
          
          // Attachments
          attachments: bookingAttachments.map(attachment => ({
            id: attachment.id,
            fileName: attachment.file_name,
            fileType: attachment.file_type,
            url: attachment.url,
            uploadedAt: attachment.uploaded_at
          })),
          
          // Calendar events
          events: bookingEvents.map(event => ({
            id: event.id,
            title: event.title,
            startTime: event.start_time,
            endTime: event.end_time,
            eventType: event.event_type,
            resourceId: event.resource_id,
            deliveryAddress: event.delivery_address
          })),
          
          // Metadata
          createdAt: booking.created_at,
          updatedAt: booking.updated_at
        } : null
      }
    })

    // Generate export metadata
    const exportMetadata = {
      exportedAt: new Date().toISOString(),
      totalAssignments: enrichedAssignments.length,
      uniqueStaff: [...new Set(enrichedAssignments.map(a => a.staff.id))].length,
      uniqueBookings: [...new Set(enrichedAssignments.map(a => a.booking?.id).filter(Boolean))].length,
      dateRange: {
        earliest: enrichedAssignments.length > 0 ? 
          Math.min(...enrichedAssignments.map(a => new Date(a.assignmentDate).getTime())) : null,
        latest: enrichedAssignments.length > 0 ? 
          Math.max(...enrichedAssignments.map(a => new Date(a.assignmentDate).getTime())) : null
      }
    }

    // Convert timestamps to readable dates
    if (exportMetadata.dateRange.earliest) {
      exportMetadata.dateRange.earliest = new Date(exportMetadata.dateRange.earliest).toISOString().split('T')[0]
    }
    if (exportMetadata.dateRange.latest) {
      exportMetadata.dateRange.latest = new Date(exportMetadata.dateRange.latest).toISOString().split('T')[0]
    }

    const responseData = {
      metadata: exportMetadata,
      assignments: enrichedAssignments
    }

    console.log(`Export completed successfully: ${enrichedAssignments.length} assignments exported`)

    // Return the enriched data
    return new Response(
      JSON.stringify(responseData, null, 2),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        } 
      }
    )
  } catch (error) {
    console.error('Error in export staff assignments function:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
