import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Validate API key
    const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')

    if (!webhookSecret || apiKey !== webhookSecret) {
      console.error('receive-booking: Invalid or missing API key')
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { booking_id, event_type, organization_id } = body

    console.log(`receive-booking: Incoming webhook - booking_id=${booking_id}, event_type=${event_type || 'unknown'}, organization_id=${organization_id || 'NOT PROVIDED'}`)

    if (!organization_id) {
      console.error('receive-booking: organization_id is required but was not provided.')
      return new Response(
        JSON.stringify({ error: 'Missing required field: organization_id. Hub must send organization_id explicitly.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: booking_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Handle cancellations and offer-downgrades directly without calling import-bookings
    if (event_type === 'booking.cancelled') {
      return await handleCancellation(supabaseUrl, serviceRoleKey, booking_id, organization_id)
    }

    if (event_type === 'booking.offer') {
      return await handleOfferDowngrade(supabaseUrl, serviceRoleKey, booking_id, organization_id)
    }

    // For all other event types (booking.confirmed, booking.updated, etc.),
    // forward to import-bookings with event_type as a hint
    console.log(`receive-booking: Forwarding event_type=${event_type || 'unknown'} to import-bookings for booking ${booking_id}`)

    const importPayload: Record<string, any> = { booking_id, syncMode: 'single' }
    if (organization_id) importPayload.organization_id = organization_id
    if (event_type) importPayload.event_type = event_type

    // Fire-and-forget: trigger import-bookings without awaiting the response
    // This prevents the booking system's ~16s webhook timeout from being exceeded.
    // If the edge runtime terminates early, the background sync (every 30s) will catch it.
    fetch(`${supabaseUrl}/functions/v1/import-bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify(importPayload),
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => 'no body')
        console.error(`receive-booking: import-bookings background call failed (${res.status}): ${body}`)
      } else {
        console.log(`receive-booking: import-bookings background call succeeded for ${booking_id}`)
      }
    }).catch(err => {
      console.error(`receive-booking: import-bookings background call error:`, err)
    })

    // Respond immediately — booking system gets a fast 202
    return new Response(
      JSON.stringify({ success: true, accepted: true, booking_id, event_type: event_type || 'unknown' }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('receive-booking: Unexpected error', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Handle booking.cancelled: update status but KEEP calendar events visible
 * Calendar events are kept so users can see the cancellation visually (strikethrough)
 * and manually remove them via a trash icon in the calendar UI.
 */
async function handleCancellation(
  supabaseUrl: string,
  serviceRoleKey: string,
  bookingId: string,
  organizationId: string
): Promise<Response> {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log(`receive-booking: Handling CANCELLATION for booking ${bookingId} in org ${organizationId}`)

  // Check if booking exists locally
  const { data: existing, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fetchError) {
    console.error(`receive-booking: Error fetching booking ${bookingId}`, fetchError)
    return new Response(
      JSON.stringify({ error: 'Database error', details: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!existing) {
    console.log(`receive-booking: Booking ${bookingId} not found locally — nothing to cancel`)
    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, action: 'not_found_locally', message: 'Booking does not exist in local DB' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (existing.status === 'CANCELLED') {
    console.log(`receive-booking: Booking ${bookingId} is already CANCELLED — no action needed`)
    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, action: 'already_cancelled' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const actions: string[] = []

  // 1. Update booking status to CANCELLED
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('organization_id', organizationId)

  if (updateError) {
    console.error(`receive-booking: Failed to update booking status`, updateError)
  } else {
    actions.push('status_updated_to_CANCELLED')
    console.log(`receive-booking: ✅ Booking ${bookingId} status set to CANCELLED`)
  }

  // 2. KEEP calendar events — they will be shown with strikethrough in the UI
  // Users can manually remove them via a trash icon in the calendar
  actions.push('calendar_events_kept_for_visibility')
  console.log(`receive-booking: ℹ️ Calendar events kept for booking ${bookingId} (visual cancellation indicator)`)

  // 3. Delete warehouse calendar events (these are operational, not needed for visibility)
  const { error: whError, count: whCount } = await supabase
    .from('warehouse_calendar_events')
    .delete({ count: 'exact' })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (whError) {
    console.error(`receive-booking: Failed to delete warehouse_calendar_events`, whError)
  } else {
    actions.push(`deleted_${whCount || 0}_warehouse_calendar_events`)
    console.log(`receive-booking: ✅ Deleted ${whCount || 0} warehouse calendar events`)
  }

  // 4. Set linked projects to completed
  const { error: projError, count: projCount } = await supabase
    .from('projects')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .neq('status', 'completed')

  if (projError) {
    console.error(`receive-booking: Failed to update projects`, projError)
  } else if (projCount && projCount > 0) {
    actions.push(`completed_${projCount}_projects`)
    console.log(`receive-booking: ✅ Set ${projCount} projects to completed`)
  }

  // 5. Set linked jobs to completed
  const { error: jobError, count: jobCount } = await supabase
    .from('jobs')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)
    .neq('status', 'completed')

  if (jobError) {
    console.error(`receive-booking: Failed to update jobs`, jobError)
  } else if (jobCount && jobCount > 0) {
    actions.push(`completed_${jobCount}_jobs`)
    console.log(`receive-booking: ✅ Set ${jobCount} jobs to completed`)
  }

  // 6. Delete packing projects
  const { error: packError, count: packCount } = await supabase
    .from('packing_projects')
    .delete({ count: 'exact' })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (packError) {
    console.error(`receive-booking: Failed to delete packing_projects`, packError)
  } else {
    actions.push(`deleted_${packCount || 0}_packing_projects`)
    console.log(`receive-booking: ✅ Deleted ${packCount || 0} packing projects`)
  }

  // 7. Delete booking products
  const { error: prodError, count: prodCount } = await supabase
    .from('booking_products')
    .delete({ count: 'exact' })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (prodError) {
    console.error(`receive-booking: Failed to delete booking_products`, prodError)
  } else {
    actions.push(`deleted_${prodCount || 0}_booking_products`)
    console.log(`receive-booking: ✅ Deleted ${prodCount || 0} booking products`)
  }

  console.log(`receive-booking: ✅ Cancellation complete for ${bookingId}. Actions: ${actions.join(', ')}`)

  return new Response(
    JSON.stringify({ success: true, booking_id: bookingId, event_type: 'booking.cancelled', actions }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Handle booking.offer: downgrade from confirmed to offer
 * Remove calendar events (offers don't appear in planning calendar)
 */
async function handleOfferDowngrade(
  supabaseUrl: string,
  serviceRoleKey: string,
  bookingId: string,
  organizationId: string
): Promise<Response> {
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  console.log(`receive-booking: Handling OFFER DOWNGRADE for booking ${bookingId} in org ${organizationId}`)

  const { data: existing, error: fetchError } = await supabase
    .from('bookings')
    .select('id, status')
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (fetchError) {
    console.error(`receive-booking: Error fetching booking ${bookingId}`, fetchError)
    return new Response(
      JSON.stringify({ error: 'Database error', details: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (!existing) {
    console.log(`receive-booking: Booking ${bookingId} not found locally — nothing to downgrade`)
    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, action: 'not_found_locally' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (existing.status === 'OFFER') {
    console.log(`receive-booking: Booking ${bookingId} is already OFFER — no action needed`)
    return new Response(
      JSON.stringify({ success: true, booking_id: bookingId, action: 'already_offer' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const actions: string[] = []

  // 1. Update booking status to OFFER
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'OFFER', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('organization_id', organizationId)

  if (updateError) {
    console.error(`receive-booking: Failed to update booking status to OFFER`, updateError)
  } else {
    actions.push('status_updated_to_OFFER')
    console.log(`receive-booking: ✅ Booking ${bookingId} status set to OFFER`)
  }

  // 2. Delete calendar events (offers should not appear in planning calendar)
  const { error: calError, count: calCount } = await supabase
    .from('calendar_events')
    .delete({ count: 'exact' })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (calError) {
    console.error(`receive-booking: Failed to delete calendar_events`, calError)
  } else {
    actions.push(`deleted_${calCount || 0}_calendar_events`)
    console.log(`receive-booking: ✅ Deleted ${calCount || 0} calendar events`)
  }

  // 3. Delete warehouse calendar events
  const { error: whError, count: whCount } = await supabase
    .from('warehouse_calendar_events')
    .delete({ count: 'exact' })
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (whError) {
    console.error(`receive-booking: Failed to delete warehouse_calendar_events`, whError)
  } else {
    actions.push(`deleted_${whCount || 0}_warehouse_calendar_events`)
    console.log(`receive-booking: ✅ Deleted ${whCount || 0} warehouse calendar events`)
  }

  console.log(`receive-booking: ✅ Offer downgrade complete for ${bookingId}. Actions: ${actions.join(', ')}`)

  return new Response(
    JSON.stringify({ success: true, booking_id: bookingId, event_type: 'booking.offer', actions }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
