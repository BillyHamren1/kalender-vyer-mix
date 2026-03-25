import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * sync-booking-to-packing
 * 
 * Ensures packing_projects always mirrors booking data.
 * Called on any booking update or confirmation.
 * 
 * Actions:
 * 1. If no packing project exists for a CONFIRMED booking → create one
 * 2. If packing project exists → update name to match booking client + event date
 * 3. Sync packing_list_items to match current booking_products
 * 4. If booking is CANCELLED → delete packing project (cascade)
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const body = await req.json()
    const { booking_id, organization_id } = body

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'booking_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: 'organization_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[sync-booking-to-packing] Starting sync for booking ${booking_id}`)

    // 1. Fetch the booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, delivery_city, delivery_postal_code, contact_name, contact_phone, contact_email, internalnotes, status, booking_number')
      .eq('id', booking_id)
      .eq('organization_id', organization_id)
      .single()

    if (bookingError || !booking) {
      console.error(`[sync-booking-to-packing] Booking not found: ${booking_id}`, bookingError)
      return new Response(
        JSON.stringify({ error: 'Booking not found', details: bookingError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const upperStatus = (booking.status || '').toUpperCase()

    // 2. If CANCELLED → remove packing project entirely
    if (upperStatus === 'CANCELLED') {
      console.log(`[sync-booking-to-packing] Booking ${booking_id} is cancelled, removing packing project`)
      const { error: deleteError } = await supabase
        .from('packing_projects')
        .delete()
        .eq('booking_id', booking_id)
        .eq('organization_id', organization_id)

      if (deleteError) {
        console.error(`[sync-booking-to-packing] Error deleting packing:`, deleteError)
      }

      return new Response(
        JSON.stringify({ action: 'deleted', booking_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Build the packing name from booking data
    const clientName = booking.client || 'Okänd kund'
    const eventDate = booking.eventdate
      ? new Date(booking.eventdate).toLocaleDateString('sv-SE')
      : ''
    const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName

    // 4. Check if packing project exists
    const { data: existingPacking } = await supabase
      .from('packing_projects')
      .select('id, name, status')
      .eq('booking_id', booking_id)
      .eq('organization_id', organization_id)
      .limit(1)
      .single()

    let packingId: string
    let action: string

    if (existingPacking) {
      // Update existing packing name if it changed
      if (existingPacking.name !== packingName) {
        console.log(`[sync-booking-to-packing] Updating packing name: "${existingPacking.name}" → "${packingName}"`)
        const { error: updateError } = await supabase
          .from('packing_projects')
          .update({ name: packingName, updated_at: new Date().toISOString() })
          .eq('id', existingPacking.id)

        if (updateError) {
          console.error(`[sync-booking-to-packing] Error updating packing name:`, updateError)
          throw updateError
        }
      }
      packingId = existingPacking.id
      action = 'updated'
    } else {
      // Only create for CONFIRMED bookings
      if (upperStatus !== 'CONFIRMED') {
        console.log(`[sync-booking-to-packing] Booking ${booking_id} is ${upperStatus}, not creating packing project`)
        return new Response(
          JSON.stringify({ action: 'skipped', reason: `Status is ${upperStatus}, not CONFIRMED`, booking_id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`[sync-booking-to-packing] Creating packing project: ${packingName}`)
      const { data: newPacking, error: insertError } = await supabase
        .from('packing_projects')
        .insert({
          booking_id: booking_id,
          name: packingName,
          status: 'planning',
          organization_id: organization_id
        })
        .select('id')
        .single()

      if (insertError || !newPacking) {
        console.error(`[sync-booking-to-packing] Error creating packing:`, insertError)
        throw insertError || new Error('Failed to create packing project')
      }

      packingId = newPacking.id
      action = 'created'

      // Create standard tasks for new packing projects
      await createStandardTasks(supabase, packingId, booking, organization_id)
    }

    // 5. Sync packing list items to match booking products
    const itemsSynced = await syncPackingListItems(supabase, packingId, booking_id, organization_id)

    console.log(`[sync-booking-to-packing] Done: action=${action}, packingId=${packingId}, itemsSynced=${itemsSynced}`)

    return new Response(
      JSON.stringify({
        action,
        booking_id,
        packing_id: packingId,
        packing_name: packingName,
        items_synced: itemsSynced
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`[sync-booking-to-packing] Error:`, error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Sync packing_list_items to match booking_products.
 * - Add items for new products
 * - Remove orphaned items (product no longer exists)
 * - Update quantity_to_pack if product quantity changed
 */
async function syncPackingListItems(
  supabase: any,
  packingId: string,
  bookingId: string,
  organizationId: string
): Promise<number> {
  // Fetch current booking products (exclude package headers - only actual packable items)
  const { data: products, error: prodError } = await supabase
    .from('booking_products')
    .select('id, name, quantity, parent_product_id, is_package_component, sku')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (prodError) {
    console.error(`[sync-booking-to-packing] Error fetching products:`, prodError)
    return 0
  }

  // Filter to packable items (exclude parent packages that have components)
  const parentIds = new Set(
    (products || [])
      .filter((p: any) => p.parent_product_id)
      .map((p: any) => p.parent_product_id)
  )
  const packableProducts = (products || []).filter((p: any) => !parentIds.has(p.id))

  // Fetch current packing list items
  const { data: existingItems, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_to_pack')
    .eq('packing_id', packingId)

  if (itemsError) {
    console.error(`[sync-booking-to-packing] Error fetching packing list items:`, itemsError)
    return 0
  }

  const existingByProductId = new Map(
    (existingItems || []).map((item: any) => [item.booking_product_id, item])
  )
  const productIds = new Set(packableProducts.map((p: any) => p.id))

  let synced = 0

  // Add missing items
  const newItems = packableProducts
    .filter((p: any) => !existingByProductId.has(p.id))
    .map((p: any) => ({
      packing_id: packingId,
      booking_product_id: p.id,
      quantity_to_pack: p.quantity || 1,
      quantity_packed: 0,
      organization_id: organizationId
    }))

  if (newItems.length > 0) {
    const { error: insertError } = await supabase
      .from('packing_list_items')
      .insert(newItems)

    if (insertError) {
      console.error(`[sync-booking-to-packing] Error inserting packing list items:`, insertError)
    } else {
      synced += newItems.length
      console.log(`[sync-booking-to-packing] Added ${newItems.length} new packing list items`)
    }
  }

  // Update quantity_to_pack for existing items where product quantity changed
  for (const product of packableProducts) {
    const existing = existingByProductId.get(product.id)
    if (existing && existing.quantity_to_pack !== product.quantity) {
      const { error: updateError } = await supabase
        .from('packing_list_items')
        .update({ quantity_to_pack: product.quantity })
        .eq('id', existing.id)

      if (!updateError) {
        synced++
        console.log(`[sync-booking-to-packing] Updated quantity for product ${product.id}: ${existing.quantity_to_pack} → ${product.quantity}`)
      }
    }
  }

  // Remove orphaned items (product deleted from booking)
  const orphanedItems = (existingItems || []).filter(
    (item: any) => item.booking_product_id && !productIds.has(item.booking_product_id)
  )

  if (orphanedItems.length > 0) {
    const orphanedIds = orphanedItems.map((item: any) => item.id)
    const { error: deleteError } = await supabase
      .from('packing_list_items')
      .delete()
      .in('id', orphanedIds)

    if (!deleteError) {
      synced += orphanedItems.length
      console.log(`[sync-booking-to-packing] Removed ${orphanedItems.length} orphaned packing list items`)
    }
  }

  return synced
}

/**
 * Create standard packing tasks for a new packing project
 */
async function createStandardTasks(
  supabase: any,
  packingId: string,
  booking: any,
  organizationId: string
): Promise<void> {
  const tasks: any[] = []
  let sortOrder = 0

  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(dateStr)
    d.setDate(d.getDate() + days)
    return d.toISOString().split('T')[0]
  }

  if (booking.rigdaydate) {
    tasks.push({
      packing_id: packingId,
      title: 'Packning',
      description: 'Packa utrustning för bokningen',
      deadline: addDays(booking.rigdaydate, -4),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: organizationId
    })
    tasks.push({
      packing_id: packingId,
      title: 'Utrustning packad',
      description: 'Verifiera att all utrustning är packad',
      deadline: addDays(booking.rigdaydate, -1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: organizationId
    })
  }

  if (booking.eventdate) {
    tasks.push({
      packing_id: packingId,
      title: 'Eventdag',
      description: 'Kontrollera utrustning på plats',
      deadline: booking.eventdate,
      sort_order: sortOrder++,
      completed: false,
      is_info_only: true,
      organization_id: organizationId
    })
  }

  if (booking.rigdowndate) {
    tasks.push({
      packing_id: packingId,
      title: 'Nedriggning',
      description: 'Rigga ned och packa ihop utrustning',
      deadline: booking.rigdowndate,
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: organizationId
    })
    tasks.push({
      packing_id: packingId,
      title: 'Retur inventering',
      description: 'Inventera returnerad utrustning',
      deadline: addDays(booking.rigdowndate, 1),
      sort_order: sortOrder++,
      completed: false,
      is_info_only: false,
      organization_id: organizationId
    })
  }

  if (tasks.length > 0) {
    const { error } = await supabase.from('packing_tasks').insert(tasks)
    if (error) {
      console.error(`[sync-booking-to-packing] Error creating tasks:`, error)
    } else {
      console.log(`[sync-booking-to-packing] Created ${tasks.length} standard tasks`)
    }
  }
}
