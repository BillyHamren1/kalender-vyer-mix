import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify base64 token (same format as mobile-app-api)
const TOKEN_EXPIRY_HOURS = 24

function verifyToken(token: string): { valid: boolean; staffId?: string; error?: string } {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) {
      return { valid: false, error: 'Invalid token format' }
    }
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Token expired' }
    }
    return { valid: true, staffId: payload.staffId }
  } catch {
    return { valid: false, error: 'Invalid token' }
  }
}

// Verify token and return staff record with organization_id
async function authenticateRequest(supabase: any, token: string | undefined) {
  if (!token) {
    throw { status: 401, message: 'Token required' }
  }

  const tokenResult = verifyToken(token)
  if (!tokenResult.valid) {
    throw { status: 401, message: tokenResult.error || 'Invalid or expired token' }
  }

  const staffId = tokenResult.staffId!

  // Get staff member info and organization_id
  const { data: staffMember, error } = await supabase
    .from('staff_members')
    .select('id, name, organization_id')
    .eq('id', staffId)
    .single()

  if (error || !staffMember) {
    throw { status: 401, message: 'Staff member not found' }
  }

  return {
    staffId: staffMember.id,
    organizationId: staffMember.organization_id,
    staffName: staffMember.name || 'Unknown'
  }
}

// ============== STATUS FLOW LOGIC ==============
// Allowed transitions: planning → in_progress → packed → delivered
// Status is computed automatically based on packing state.

async function transitionToInProgress(supabase: any, packingId: string, orgId: string) {
  // Only transition if currently 'planning'
  const { data } = await supabase
    .from('packing_projects')
    .select('status')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .single()

  if (data?.status === 'planning') {
    console.log(`[status-flow] ${packingId}: planning → in_progress`)
    await supabase
      .from('packing_projects')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  }
}

async function checkIfAllPacked(supabase: any, packingId: string, orgId: string) {
  // Check if all items have quantity_packed >= quantity_to_pack
  const { data: items, error } = await supabase
    .from('packing_list_items')
    .select('id, quantity_to_pack, quantity_packed, booking_products!inner(is_package_component, parent_product_id)')
    .eq('packing_id', packingId)
    .eq('organization_id', orgId)

  if (error || !items || items.length === 0) return

  // Only count non-parent items (exclude package headers)
  const countableItems = items.filter((item: any) => {
    const bp = item.booking_products
    // Exclude items that are package headers (have children but are not components themselves)
    return bp?.is_package_component !== false || bp?.parent_product_id !== null
  })

  // If no countable items, check all items instead
  const itemsToCheck = countableItems.length > 0 ? countableItems : items

  const allPacked = itemsToCheck.every((item: any) => 
    (item.quantity_packed || 0) >= item.quantity_to_pack
  )

  const { data: packing } = await supabase
    .from('packing_projects')
    .select('status')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .single()

  if (allPacked && packing?.status === 'in_progress') {
    console.log(`[status-flow] ${packingId}: in_progress → packed`)
    await supabase
      .from('packing_projects')
      .update({ status: 'packed', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  } else if (!allPacked && packing?.status === 'packed') {
    // Revert if items were decremented/unpacked
    console.log(`[status-flow] ${packingId}: packed → in_progress (items unpacked)`)
    await supabase
      .from('packing_projects')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { action, token, ...params } = await req.json()

    // Authenticate and get organization_id
    let auth: { staffId: string; organizationId: string; staffName: string }
    try {
      auth = await authenticateRequest(supabase, token)
    } catch (authErr: any) {
      return new Response(
        JSON.stringify({ error: authErr.message || 'Unauthorized' }),
        { status: authErr.status || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ORG_ID = auth.organizationId

    switch (action) {
      case 'list_active_packings': {
        // Fetch packings that are actionable: planning, in_progress, packed
        const fourteenDaysFromNow = new Date()
        fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14)
        const cutoffDate = fourteenDaysFromNow.toISOString().split('T')[0]

        const { data: allPackings, error } = await supabase
          .from('packing_projects')
          .select('*')
          .eq('organization_id', ORG_ID)
          .in('status', ['planning', 'in_progress', 'packed'])
          .order('created_at', { ascending: false })
          .limit(100)

        if (error) throw error

        // Fetch booking data for all packings to enable date filtering
        const packingsWithBookings = await Promise.all(
          (allPackings || []).map(async (packing: any) => {
            if (packing.booking_id) {
              const { data: booking } = await supabase
                .from('bookings')
                .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
                .eq('id', packing.booking_id)
                .eq('organization_id', ORG_ID)
                .single()
              return { ...packing, booking }
            }
            return packing
          })
        )

        // Filter: in_progress/packed always shown; planning only if rigdaydate <= 14 days from now (or no date)
        const filtered = packingsWithBookings.filter((p: any) => {
          if (p.status === 'in_progress' || p.status === 'packed') return true
          // Planning: show if rigdaydate is within 14 days or not set
          const rigDate = p.booking?.rigdaydate
          if (!rigDate) return true // No date = show it (manual packing without booking date)
          return rigDate <= cutoffDate
        }).slice(0, 50)

        return new Response(JSON.stringify(filtered), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'get_packing': {
        const { id } = params
        const { data: packing, error } = await supabase
          .from('packing_projects')
          .select('*')
          .eq('id', id)
          .eq('organization_id', ORG_ID)
          .single()

        if (error) throw error

        let result = packing
        if (packing?.booking_id) {
          const { data: booking } = await supabase
            .from('bookings')
            .select('id, client, eventdate, rigdaydate, rigdowndate, deliveryaddress, contact_name, contact_phone, contact_email, booking_number')
            .eq('id', packing.booking_id)
            .eq('organization_id', ORG_ID)
            .single()
          result = { ...packing, booking }
        }

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'get_packing_items': {
        const { packingId } = params

        const { data: packing } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .single()

        // Full validation & self-healing sync
        if (packing?.booking_id) {
          const [{ data: products }, { data: existingItems }] = await Promise.all([
            supabase.from('booking_products').select('id, quantity').eq('booking_id', packing.booking_id).eq('organization_id', ORG_ID),
            supabase.from('packing_list_items').select('id, booking_product_id, quantity_to_pack').eq('packing_id', packingId).eq('organization_id', ORG_ID)
          ])

          const productMap = new Map((products || []).map((p: any) => [p.id, p]))
          const existingMap = new Map((existingItems || []).map((i: any) => [i.booking_product_id, i]))

          const toInsert: any[] = []
          const toUpdate: any[] = []
          const toDelete: string[] = []

          // Check for new or changed products
          for (const [productId, product] of productMap) {
            const existing = existingMap.get(productId)
            if (!existing) {
              toInsert.push({
                packing_id: packingId,
                booking_product_id: productId,
                quantity_to_pack: (product as any).quantity,
                quantity_packed: 0,
                organization_id: ORG_ID
              })
            } else if (existing.quantity_to_pack !== (product as any).quantity) {
              toUpdate.push({ id: existing.id, quantity_to_pack: (product as any).quantity })
            }
          }

          // Check for orphaned packing items (product removed from booking)
          for (const [bpId, item] of existingMap) {
            if (!productMap.has(bpId)) {
              toDelete.push((item as any).id)
            }
          }

          const hasMismatch = toInsert.length > 0 || toUpdate.length > 0 || toDelete.length > 0

          if (hasMismatch) {
            console.warn(`[packing-sync] Mismatch detected for packing ${packingId}: +${toInsert.length} ins, ${toUpdate.length} upd, -${toDelete.length} del`)

            // Self-heal
            const ops: Promise<any>[] = []
            if (toInsert.length > 0) {
              ops.push(supabase.from('packing_list_items').insert(toInsert))
            }
            for (const upd of toUpdate) {
              ops.push(supabase.from('packing_list_items').update({ quantity_to_pack: upd.quantity_to_pack }).eq('id', upd.id).eq('organization_id', ORG_ID))
            }
            if (toDelete.length > 0) {
              ops.push(supabase.from('packing_list_items').delete().in('id', toDelete).eq('organization_id', ORG_ID))
            }
            await Promise.all(ops)

            // Log the sync event
            await supabase.from('packing_sync_log').insert({
              packing_id: packingId,
              action: 'packing_sync_mismatch',
              details: {
                inserted: toInsert.length,
                updated: toUpdate.length,
                deleted: toDelete.length,
                inserted_products: toInsert.map((i: any) => i.booking_product_id),
                updated_items: toUpdate.map((u: any) => ({ id: u.id, new_qty: u.quantity_to_pack })),
                deleted_items: toDelete,
              },
              performed_by: 'system',
              organization_id: ORG_ID,
            })
          }
        }

        const { data, error } = await supabase
          .from('packing_list_items')
          .select(`*, booking_products (id, name, quantity, sku, notes, parent_product_id, parent_package_id, is_package_component)`)
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        if (error) throw error
        return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'verify_product': {
        const { packingId, sku: serialNumber, verifiedBy } = params

        // STATUS FLOW: First scan → set to in_progress
        await transitionToInProgress(supabase, packingId, ORG_ID)

        // 1. Get booking_id from packing_projects (separate query, no join)
        const { data: packing, error: packingError } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .single()

        if (packingError || !packing?.booking_id) {
          console.error('[verify_product] Packing lookup failed:', { packingId, error: packingError })
          return json({ success: false, error: 'Packlistan saknar kopplad bokning' })
        }

        // 2. Get booking_number from bookings table
        const { data: bookingData, error: bookingError } = await supabase
          .from('bookings')
          .select('booking_number')
          .eq('id', packing.booking_id)
          .eq('organization_id', ORG_ID)
          .single()

        const bookingNumber = bookingData?.booking_number
        if (bookingError || !bookingNumber) {
          console.error('[verify_product] Booking lookup failed:', { bookingId: packing.booking_id, error: bookingError })
          return json({ success: false, error: 'Bokningen saknar bokningsnummer' })
        }

        // 2. Call external inventory API to allocate the instance
        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY) {
          console.error('PRICELIST_API_KEY not configured')
          return json({ success: false, error: 'Lagersystem ej konfigurerat' })
        }

        console.log('[allocate-instance] Request:', {
          url: 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/allocate-instance',
          serial_number: serialNumber,
          reservation_id: bookingNumber,
          booking_id: packing.booking_id,
          hasApiKey: !!PRICELIST_API_KEY,
          orgId: ORG_ID,
        })

        const allocateResponse = await fetch(
          'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/allocate-instance',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${PRICELIST_API_KEY}`,
              'x-organization-id': ORG_ID,
            },
            body: JSON.stringify({
              serial_number: serialNumber,
              reservation_id: bookingNumber,
              booking_number: bookingNumber,
            }),
          }
        )

        const responseText = await allocateResponse.text()
        console.log('[allocate-instance] Response:', {
          status: allocateResponse.status,
          statusText: allocateResponse.statusText,
          body: responseText,
        })

        if (!allocateResponse.ok) {
          const status = allocateResponse.status
          const errBody = (() => { try { return JSON.parse(responseText) } catch { return {} } })()
          if (status === 404) {
            return json({ success: false, error: `Enheten "${serialNumber}" hittades inte i lagersystemet` })
          }
          if (status === 409) {
            return json({ success: false, error: errBody.error || 'Enheten är inte tillgänglig eller redan allokerad' })
          }
          console.error('Inventory API error:', status, errBody)
          return json({ success: false, error: errBody.error || `Lagerfel (${status})` })
        }

        const allocateData = (() => { try { return JSON.parse(responseText) } catch { return {} } })()

        // Extract SKU/item_type from various response formats
        // Split batch serial numbers (may contain newlines)
        const serialNumbers = serialNumber.split('\n').map((s: string) => s.trim()).filter(Boolean)

        let returnedSku = allocateData.sku || allocateData.data?.sku || allocateData.data?.item_type_id
        let returnedItemType = allocateData.item_type || allocateData.data?.item_type
        const alreadyAllocatedSerials: string[] = []
        const failedSerials: string[] = []
        let successfulAllocations = 0

        // Format A: Batch response with results array
        if (Array.isArray(allocateData.results)) {
          for (const r of allocateData.results) {
            if (!serialNumbers.includes(r.serial_number)) continue

            if (r.data?.already_allocated || r.data?.over_allocated) {
              alreadyAllocatedSerials.push(r.serial_number)
              if (!returnedSku) returnedSku = r.data?.sku || r.data?.item_type_id || r.sku || r.item_type_id
              if (!returnedItemType) returnedItemType = r.data?.item_type || r.item_type
              continue
            }

            if (!r.success) {
              const isAlreadyAllocated = (r.error || '').toLowerCase().includes('fully allocated')
              if (isAlreadyAllocated) {
                alreadyAllocatedSerials.push(r.serial_number)
                if (!returnedSku) returnedSku = r.data?.sku || r.data?.item_type_id || r.sku || r.item_type_id
                if (!returnedItemType) returnedItemType = r.data?.item_type || r.item_type
              } else {
                failedSerials.push(r.serial_number)
              }
              continue
            }

            successfulAllocations += 1
            if (!returnedSku) returnedSku = r.data?.sku || r.data?.item_type_id || r.sku || r.item_type_id
            if (!returnedItemType) returnedItemType = r.data?.item_type || r.item_type
          }

          // If ALL were already allocated and no identifiers found, we cannot local-match
          if (!returnedSku && !returnedItemType && alreadyAllocatedSerials.length > 0 && failedSerials.length === 0) {
            const shortNrs = alreadyAllocatedSerials.map((s: string) => s.replace(/^FACE\d{16}/, '').replace(/^0+/, '') || s)
            console.warn('[allocate-instance] Alla redan allokerade utan artikelinfo:', shortNrs)
            return json({
              success: false,
              error: `Nr ${shortNrs.join(', ')} är redan scannad/allokerad`,
              alreadyScanned: true
            })
          }

          if (!returnedSku && !returnedItemType && failedSerials.length > 0 && alreadyAllocatedSerials.length === 0) {
            console.warn('[allocate-instance] Allokering misslyckades för:', failedSerials)
            return json({ success: false, error: 'Allokering misslyckades i lagersystemet' })
          }
        }

        // Format B: Single-item response (no results array)
        if (!Array.isArray(allocateData.results)) {
          if (allocateData.data?.already_allocated) {
            // No item metadata in this response format => cannot safely local-match
            console.warn('[allocate-instance] Redan allokerad (single, flagga):', serialNumber)
            return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
          }

          const isFullyAllocated = (allocateData.error || '').toLowerCase().includes('fully allocated')
          if (isFullyAllocated) {
            returnedSku = returnedSku || allocateData.data?.item_type_id || allocateData.data?.sku
            returnedItemType = returnedItemType || allocateData.data?.item_type
            if (!returnedSku && !returnedItemType) {
              return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
            }
          } else if (allocateData.success) {
            successfulAllocations = 1
          }
        }

        if (!returnedSku && !returnedItemType) {
          console.error('Inventory API returned no SKU/item_type:', allocateData)
          return json({ success: false, error: 'Lagersystemet returnerade ingen artikeltyp' })
        }

        // 3. Match returned SKU or item_type against local packing_list_items
        const { data: packingItems, error: fetchError } = await supabase
          .from('packing_list_items')
          .select(`id, quantity_to_pack, quantity_packed, verified_at, booking_products (id, name, sku, inventory_item_type_id)`)
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        if (fetchError) return json({ success: false, error: 'Kunde inte hämta packlista' })

        const normalizeItemTypeName = (value: string): string =>
          value
            .toLowerCase()
            .replace(/^[↳└⦿\s,\-–—]+/, '')
            .replace(/\s+/g, ' ')
            .trim()

        const normalizedSku = returnedSku?.toLowerCase()
        const normalizedItemType = returnedItemType ? normalizeItemTypeName(returnedItemType) : null

        let matchedItems = (packingItems || []).filter((item: any) => {
          if (!normalizedSku) return false
          const bp = item.booking_products
          return bp?.sku?.toLowerCase() === normalizedSku || bp?.inventory_item_type_id?.toLowerCase() === normalizedSku
        })

        if (matchedItems.length === 0 && normalizedItemType) {
          matchedItems = (packingItems || []).filter((item: any) => {
            const name = item.booking_products?.name
            if (!name) return false
            return normalizeItemTypeName(name) === normalizedItemType
          })
        }

        if (matchedItems.length === 0) {
          return json({ success: false, error: `Artikeltyp "${returnedSku || returnedItemType}" finns inte i packlistan` })
        }

        // Deterministic order + pick first not-full row
        const sortedMatchedItems = [...matchedItems].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
        const selectedItem = sortedMatchedItems.find((item: any) => (item.quantity_packed || 0) < item.quantity_to_pack) || sortedMatchedItems[0]

        const currentPacked = (selectedItem as any).quantity_packed || 0
        const quantityToPack = (selectedItem as any).quantity_to_pack
        const incrementBy = Math.max(successfulAllocations, 1)
        const isAlreadyFull = currentPacked >= quantityToPack
        const newQuantity = currentPacked + incrementBy
        const isNowFull = newQuantity >= quantityToPack
        const now = new Date().toISOString()

        await supabase.from('packing_list_items').update({
          quantity_packed: newQuantity,
          packed_at: now,
          packed_by: verifiedBy,
          ...(isNowFull ? { verified_at: now, verified_by: verifiedBy } : {})
        }).eq('id', (selectedItem as any).id)

        // STATUS FLOW: Check if all items are now packed
        await checkIfAllPacked(supabase, packingId, ORG_ID)

        const productName = (selectedItem as any).booking_products?.name
        return json({
          success: true,
          overscan: isAlreadyFull,
          itemId: (selectedItem as any).id,
          newQuantity,
          quantityToPack,
          productName: `${productName} (${newQuantity}/${quantityToPack})`
        })
      }

      case 'toggle_item': {
        const { itemId, currentlyPacked, quantityToPack, verifiedBy } = params
        const now = new Date().toISOString()

        // Get the packing_id for status flow
        const { data: itemData } = await supabase
          .from('packing_list_items')
          .select('packing_id')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        const packingId = itemData?.packing_id

        if (currentlyPacked) {
          await supabase.from('packing_list_items').update({
            quantity_packed: 0, packed_at: null, packed_by: null, verified_at: null, verified_by: null
          }).eq('id', itemId).eq('organization_id', ORG_ID)
        } else {
          // STATUS FLOW: First manual toggle → set to in_progress
          if (packingId) await transitionToInProgress(supabase, packingId, ORG_ID)

          const { data: currentItem } = await supabase.from('packing_list_items').select('quantity_packed').eq('id', itemId).eq('organization_id', ORG_ID).single()
          const currentQty = currentItem?.quantity_packed || 0
          const newQty = Math.min(currentQty + 1, quantityToPack)
          const isFull = newQty >= quantityToPack

          await supabase.from('packing_list_items').update({
            quantity_packed: newQty,
            packed_at: now,
            packed_by: verifiedBy,
            ...(isFull ? { verified_at: now, verified_by: verifiedBy } : {})
          }).eq('id', itemId).eq('organization_id', ORG_ID)
        }

        // STATUS FLOW: Check if all items are now packed (or reverted)
        if (packingId) await checkIfAllPacked(supabase, packingId, ORG_ID)

        return json({ success: true })
      }

      case 'decrement_item': {
        const { itemId } = params
        
        // Get current state + packing_id
        const { data: currentItem } = await supabase
          .from('packing_list_items')
          .select('quantity_packed, packing_id')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()
        
        const currentPacked = currentItem?.quantity_packed || 0
        if (currentPacked <= 0) return json({ success: false, error: 'Redan på 0' })

        const newQty = currentPacked - 1
        await supabase.from('packing_list_items').update({
          quantity_packed: newQty,
          verified_at: null,
          verified_by: null,
          ...(newQty === 0 ? { packed_at: null, packed_by: null } : {})
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        // STATUS FLOW: Items decremented, may revert from packed → in_progress
        if (currentItem?.packing_id) {
          await checkIfAllPacked(supabase, currentItem.packing_id, ORG_ID)
        }

        return json({ success: true })
      }

      case 'create_parcel': {
        const { packingId, createdBy } = params

        const { data: existing } = await supabase
          .from('packing_parcels')
          .select('parcel_number')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .order('parcel_number', { ascending: false })
          .limit(1)

        const nextNumber = (existing && existing.length > 0) ? existing[0].parcel_number + 1 : 1

        const { data, error } = await supabase
          .from('packing_parcels')
          .insert({ packing_id: packingId, parcel_number: nextNumber, created_by: createdBy, organization_id: ORG_ID })
          .select()
          .single()

        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'assign_item_to_parcel': {
        const { itemId, parcelId } = params
        const { error } = await supabase.from('packing_list_items').update({ parcel_id: parcelId }).eq('id', itemId).eq('organization_id', ORG_ID)
        if (error) throw error
        return json({ success: true })
      }

      case 'get_parcels': {
        const { packingId } = params
        const { data, error } = await supabase
          .from('packing_parcels')
          .select('*')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .order('parcel_number', { ascending: true })

        if (error) throw error
        return new Response(JSON.stringify(data || []), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'get_item_parcels': {
        const { packingId } = params

        const { data: items } = await supabase
          .from('packing_list_items')
          .select('id, parcel_id')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .not('parcel_id', 'is', null)

        if (!items || items.length === 0) return json({})

        const parcelIds = [...new Set(items.map((i: any) => i.parcel_id).filter(Boolean))]
        const { data: parcels } = await supabase.from('packing_parcels').select('id, parcel_number').in('id', parcelIds)

        const parcelMap: Record<string, number> = {}
        ;(parcels || []).forEach((p: any) => { parcelMap[p.id] = p.parcel_number })

        const result: Record<string, number> = {}
        items.forEach((item: any) => {
          if (item.parcel_id && parcelMap[item.parcel_id]) {
            result[item.id] = parcelMap[item.parcel_id]
          }
        })

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'sign_packing': {
        const { packingId, signedBy } = params

        // STATUS FLOW: Signing = delivery confirmed → set to delivered
        // Only allow signing if status is 'packed' or 'in_progress'
        const { data: currentPacking } = await supabase
          .from('packing_projects')
          .select('status')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .single()

        if (currentPacking?.status === 'delivered') {
          return json({ success: false, error: 'Packlistan är redan signerad och levererad' })
        }

        const { error } = await supabase
          .from('packing_projects')
          .update({ signed_by: signedBy, signed_at: new Date().toISOString(), status: 'delivered' })
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)

        if (error) throw error
        console.log(`[status-flow] ${packingId}: → delivered (signed by ${signedBy})`)
        return json({ success: true })
      }

      case 'get_progress': {
        const { packingId } = params
        const { data, error } = await supabase
          .from('packing_list_items')
          .select('id, verified_at')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        if (error) throw error
        const total = data?.length || 0
        const verified = data?.filter((item: any) => item.verified_at !== null).length || 0
        return json({ total, verified, percentage: total > 0 ? Math.round((verified / total) * 100) : 0 })
      }

      case 'identify_product': {
        const { serialNumber } = params
        if (!serialNumber) {
          return json({ found: false, error: 'Serienummer saknas' })
        }

        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY) {
          return json({ found: false, error: 'Lagersystem ej konfigurerat' })
        }

        // Try external inventory lookup
        try {
          const lookupResponse = await fetch(
            'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/identify-instance',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PRICELIST_API_KEY}`,
                'x-organization-id': ORG_ID,
              },
              body: JSON.stringify({ serial_number: serialNumber }),
            }
          )

          if (lookupResponse.ok) {
            const lookupData = await lookupResponse.json()
            return json({
              found: true,
              name: lookupData.name || lookupData.item_type_name || lookupData.product_name || null,
              sku: lookupData.sku || lookupData.serial_number || serialNumber,
              status: lookupData.status || 'unknown',
              currentBooking: lookupData.reservation_id || lookupData.booking_number || null,
              location: lookupData.location || null,
              rawData: lookupData,
            })
          }

          // If 404, product not found in external system
          if (lookupResponse.status === 404) {
            // Fall back to local DB match
            const { data: localMatch } = await supabase
              .from('booking_products')
              .select('id, name, sku, booking_id')
              .eq('organization_id', ORG_ID)
              .eq('sku', serialNumber)
              .limit(1)
              .maybeSingle()

            if (localMatch) {
              const { data: booking } = await supabase
                .from('bookings')
                .select('client, booking_number')
                .eq('id', localMatch.booking_id)
                .single()

              return json({
                found: true,
                name: localMatch.name,
                sku: localMatch.sku,
                status: 'local_match',
                currentBooking: booking?.booking_number || null,
                client: booking?.client || null,
              })
            }

            return json({ found: false, error: `Produkt "${serialNumber}" hittades inte` })
          }

          // Other errors
          const errText = await lookupResponse.text()
          console.error('[identify_product] External API error:', lookupResponse.status, errText)
          return json({ found: false, error: `Kunde inte identifiera produkt (${lookupResponse.status})` })
        } catch (fetchErr) {
          console.error('[identify_product] Fetch error:', fetchErr)
          return json({ found: false, error: 'Kunde inte nå lagersystemet' })
        }
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  } catch (err) {
    console.error('Scanner API error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function json(data: any) {
  return new Response(JSON.stringify(data), { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
}
