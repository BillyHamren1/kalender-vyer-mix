// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  daysUntil,
  queuePackingChangeRequests,
  requiresWarehouseAcknowledgement,
} from '../_shared/packingChangeRequests.ts'


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
    const { booking_id, organization_id, target_packing_id } = body

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

    console.log(`[sync-booking-to-packing] Starting sync for booking ${booking_id}${target_packing_id ? ` → explicit packing ${target_packing_id}` : ''}`)

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

    const clientName = booking.client || 'Okänd kund'
    const eventDate = booking.eventdate
      ? new Date(booking.eventdate).toLocaleDateString('sv-SE')
      : ''
    const packingName = eventDate ? `${clientName} - ${eventDate}` : clientName

    const syncFields = {
      name: packingName,
      client_name: booking.client || null,
      start_date: booking.rigdaydate || null,
      end_date: booking.rigdowndate || null,
      delivery_address: booking.deliveryaddress || null,
      notes: booking.internalnotes || null,
      updated_at: new Date().toISOString()
    }

    // ========================================================================
    // EXPLICIT TARGET MODE (large project / consolidated packing).
    // When the caller passes target_packing_id we DO NOT look up by booking_id
    // and we DO NOT create new packing rows — we just sync items into the
    // already-existing consolidated packing. This prevents duplicate packings
    // when several bookings belong to the same consolidated list.
    // ========================================================================
    if (target_packing_id) {
      // Verify the target exists and belongs to the same org.
      const { data: target, error: targetErr } = await supabase
        .from('packing_projects')
        .select('id, organization_id, large_project_id')
        .eq('id', target_packing_id)
        .eq('organization_id', organization_id)
        .maybeSingle()

      if (targetErr || !target) {
        return new Response(
          JSON.stringify({ error: 'target_packing_id not found in organization' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Idempotently ensure link row exists in packing_project_bookings.
      await supabase
        .from('packing_project_bookings')
        .upsert(
          { packing_id: target_packing_id, booking_id, organization_id },
          { onConflict: 'packing_id,booking_id', ignoreDuplicates: true }
        )

      const itemsSynced = await syncPackingListItems(supabase, target_packing_id, booking_id, organization_id)
      console.log(`[sync-booking-to-packing] Explicit target sync done: packing=${target_packing_id} booking=${booking_id} items=${itemsSynced}`)

      return new Response(
        JSON.stringify({
          action: 'explicit_target_synced',
          booking_id,
          packing_id: target_packing_id,
          items_synced: itemsSynced
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. If CANCELLED → mark packing project as cancelled (not delete)
    if (upperStatus === 'CANCELLED') {
      console.log(`[sync-booking-to-packing] Booking ${booking_id} is cancelled, marking packing as cancelled`)
      const { error: cancelError } = await supabase
        .from('packing_projects')
        .update({ ...syncFields, status: 'cancelled' })
        .eq('booking_id', booking_id)
        .eq('organization_id', organization_id)

      if (cancelError) {
        console.error(`[sync-booking-to-packing] Error cancelling packing:`, cancelError)
      }

      return new Response(
        JSON.stringify({ action: 'cancelled', booking_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Check if packing project exists.
    // First check if this booking is already linked to a CONSOLIDATED packing
    // via packing_project_bookings. If so, sync into that one — never create
    // a duplicate single-booking packing alongside the consolidated list.
    const { data: linkedConsolidated } = await supabase
      .from('packing_project_bookings')
      .select('packing_id, packing_projects!inner(id, large_project_id, organization_id)')
      .eq('booking_id', booking_id)
      .eq('organization_id', organization_id)
      .limit(1)
      .maybeSingle()

    if (linkedConsolidated?.packing_id) {
      const consolidatedId = linkedConsolidated.packing_id
      console.log(`[sync-booking-to-packing] Booking ${booking_id} belongs to consolidated packing ${consolidatedId} — syncing items into it`)
      const itemsSynced = await syncPackingListItems(supabase, consolidatedId, booking_id, organization_id)
      return new Response(
        JSON.stringify({
          action: 'consolidated_synced',
          booking_id,
          packing_id: consolidatedId,
          items_synced: itemsSynced
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Defensive: ignore soft-cancelled duplicates and deterministically pick the
    // canonical row (oldest active). Logs a warning if multiple actives exist so
    // we can spot drift in Edge Function logs.
    const { data: activeMatches } = await supabase
      .from('packing_projects')
      .select('id, name, status, created_at')
      .eq('booking_id', booking_id)
      .eq('organization_id', organization_id)
      .is('large_project_id', null)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: true })
      .limit(10)

    if (activeMatches && activeMatches.length > 1) {
      console.warn(
        `[sync-booking-to-packing] Duplicate packing_projects detected for booking ${booking_id} (count=${activeMatches.length}); using oldest ${activeMatches[0].id}`
      )
    }
    const existingPacking = activeMatches && activeMatches.length > 0 ? activeMatches[0] : null

    let packingId: string
    let action: string

    if (existingPacking) {
      // Always update all synced fields
      console.log(`[sync-booking-to-packing] Updating packing project ${existingPacking.id}`)
      const { error: updateError } = await supabase
        .from('packing_projects')
        .update(syncFields)
        .eq('id', existingPacking.id)

      if (updateError) {
        console.error(`[sync-booking-to-packing] Error updating packing:`, updateError)
        throw updateError
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
          ...syncFields,
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
    .select('id, name, quantity, parent_product_id, is_package_component, sku, inventory_item_type_id, source_missing_since')
    .eq('booking_id', bookingId)
    .eq('organization_id', organizationId)

  if (prodError) {
    console.error(`[sync-booking-to-packing] Error fetching products:`, prodError)
    return 0
  }

  // Filter to packable items (exclude parent packages that have components)
  const activeProducts = (products || []).filter((p: any) => !p.source_missing_since)
  const parentIds = new Set(
    activeProducts
      .filter((p: any) => p.parent_product_id)
      .map((p: any) => p.parent_product_id)
  )
  const packableProducts = activeProducts.filter((p: any) => !parentIds.has(p.id))

  // Fetch current packing list items for this packing.
  // NOTE: a consolidated packing (large project) contains items from multiple
  // bookings. We must scope orphan detection to items belonging to THIS
  // booking only — otherwise syncing booking B would delete booking A's items.
  const { data: existingItemsRaw, error: itemsError } = await supabase
    .from('packing_list_items')
    .select('id, booking_product_id, quantity_to_pack, quantity_packed, wms_sku, manual_name, booking_products!inner(booking_id, name, sku)')
    .eq('packing_id', packingId)

  if (itemsError) {
    console.error(`[sync-booking-to-packing] Error fetching packing list items:`, itemsError)
    return 0
  }

  // Items currently linked to THIS booking (via booking_product_id → booking_products.booking_id)
  const itemsForThisBooking = (existingItemsRaw || []).filter(
    (item: any) => item.booking_products?.booking_id === bookingId
  )

  const existingByProductId = new Map(
    itemsForThisBooking.map((item: any) => [item.booking_product_id, item])
  )
  const productIds = new Set(packableProducts.map((p: any) => p.id))

  // The operational packing snapshot is mutable ONLY while the packing is in
  // planning. Once floor work has started, booking edits may flag drift but
  // must never silently add/remove/re-target rows behind the warehouse team.
  const { data: packingMeta } = await supabase
    .from('packing_projects')
    .select('status')
    .eq('id', packingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  const packingStatus = (packingMeta as any)?.status || null

  const { data: bookingDates } = await supabase
    .from('bookings')
    .select('rigdaydate, eventdate')
    .eq('id', bookingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  const rigDate = (bookingDates as any)?.rigdaydate || (bookingDates as any)?.eventdate || null
  const needsWarehouseAck = requiresWarehouseAcknowledgement({
    daysUntilRig: daysUntil(rigDate),
    packingStatus,
    hasPackedQuantity: itemsForThisBooking.some((item: any) => (item.quantity_packed || 0) > 0),
  })

  const newItems = packableProducts
    .filter((p: any) => !existingByProductId.has(p.id))
    .map((p: any) => ({
      packing_id: packingId,
      booking_product_id: p.id,
      quantity_to_pack: p.quantity || 1,
      quantity_packed: 0,
      organization_id: organizationId,
      wms_item_type_id: p.inventory_item_type_id || null,
      wms_sku: p.sku || null,
      wms_identity_source: p.inventory_item_type_id ? 'booking_item_type_id' : (p.sku ? 'booking_sku_legacy' : 'missing'),
      wms_identity_needs_repair: !p.inventory_item_type_id
    }))
  const orphanedItems = itemsForThisBooking.filter(
    (item: any) => item.booking_product_id && !productIds.has(item.booking_product_id)
  )
  const quantityDrift = packableProducts.filter((product: any) => {
    const existing = existingByProductId.get(product.id) as any
    return existing && existing.quantity_to_pack !== product.quantity
  })

  // Undantag: en HELT tom/orörd lista kan aldrig störa lagret — det finns
  // inget packat att skriva över. Då fyller vi på direkt även vid kort varsel
  // eller status in_progress (samma policy som repairPackingItems), annars
  // fastnar packningen tom och oanvändbar bakom kvittens-kön.
  const listIsUntouched =
    itemsForThisBooking.length === 0 &&
    (packingStatus === 'planning' || packingStatus === 'in_progress')

  if (needsWarehouseAck && !listIsUntouched) {
    // Snapshotet är fryst. I stället för att bara flagga "något har ändrats"
    // köar vi varje konkret ändring i packing_change_requests. Lagret måste
    // ta emot ändringen innan packlistan skrivs om (kort varsel = blockerande).
    const productById = new Map(packableProducts.map((p: any) => [p.id, p]))
    const drafts: any[] = []

    for (const item of newItems) {
      const p: any = productById.get(item.booking_product_id)
      drafts.push({
        booking_product_id: item.booking_product_id,
        change_type: 'item_added',
        product_name: p?.name || null,
        sku: p?.sku || null,
        old_quantity: null,
        new_quantity: item.quantity_to_pack ?? null,
      })
    }

    for (const item of orphanedItems) {
      const p: any = item.booking_products
      drafts.push({
        booking_product_id: item.booking_product_id,
        packing_list_item_id: item.id,
        change_type: 'item_removed',
        product_name: p?.name || item.manual_name || (item.wms_sku ? `Artikel ${item.wms_sku}` : 'Borttagen artikel'),
        sku: p?.sku || item.wms_sku || null,
        old_quantity: item.quantity_to_pack ?? null,
        new_quantity: null,
      })
    }

    for (const product of quantityDrift) {
      const existing: any = existingByProductId.get(product.id)
      drafts.push({
        booking_product_id: product.id,
        packing_list_item_id: existing?.id || null,
        change_type: 'quantity_changed',
        product_name: product.name || null,
        sku: product.sku || null,
        old_quantity: existing?.quantity_to_pack ?? null,
        new_quantity: product.quantity ?? null,
      })
    }

    const result = await queuePackingChangeRequests(supabase, {
      packingId,
      bookingId,
      organizationId,
      rigDate,
      drafts,
    })

    console.warn(
      `[sync-booking-to-packing] Warehouse acknowledgement required for packing ${packingId}: ${drafts.length} change(s) queued (pending short notice: ${result.pendingShortNotice})`
    )
    return 0
  }


  let synced = 0

  // Add missing items (planning only; guarded above).
  if (newItems.length > 0) {
    const { error: insertError } = await supabase
      .from('packing_list_items')
      .insert(newItems)

    if (insertError) {
      console.error(`[sync-booking-to-packing] Error inserting packing list items:`, insertError)
    } else {
      synced += newItems.length
      console.log(`[sync-booking-to-packing] Added ${newItems.length} new packing list items`)
      // Raderna finns nu — pending "item_added"-kvittenser är inte längre relevanta.
      await supabase
        .from('packing_change_requests')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('packing_id', packingId)
        .eq('status', 'pending')
        .eq('change_type', 'item_added')
        .in('booking_product_id', newItems.map((i: any) => i.booking_product_id))
    }
  }

  // Update quantity_to_pack for existing items (planning only; guarded above).
  for (const product of packableProducts) {
    const existing = existingByProductId.get(product.id) as any
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

  // Refresh WMS identity snapshot while the packing is still in planning.
  // Once floor work starts, the snapshot is frozen together with the operational rows.
  for (const product of packableProducts) {
    const existing = existingByProductId.get(product.id) as any
    if (!existing) continue
    const { error: identityError } = await supabase
      .from('packing_list_items')
      .update({
        wms_item_type_id: product.inventory_item_type_id || null,
        wms_sku: product.sku || null,
        wms_identity_source: product.inventory_item_type_id ? 'booking_item_type_id' : (product.sku ? 'booking_sku_legacy' : 'missing'),
        wms_identity_needs_repair: !product.inventory_item_type_id,
      })
      .eq('id', existing.id)
      .eq('organization_id', organizationId)
    if (identityError) {
      console.error(`[sync-booking-to-packing] Failed to refresh WMS identity snapshot for ${existing.id}:`, identityError)
    }
  }

  // Remove orphaned items — ONLY among items belonging to this booking and
  // only while planning (the frozen-state guard above already returned).
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
