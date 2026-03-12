import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify token and return staff record with organization_id
async function authenticateRequest(supabase: any, token: string | undefined) {
  if (!token) {
    throw { status: 401, message: 'Token required' }
  }

  const { data: staff, error } = await supabase
    .from('staff_accounts')
    .select('staff_id, organization_id')
    .eq('token', token)
    .single()

  if (error || !staff) {
    throw { status: 401, message: 'Invalid or expired token' }
  }

  // Get staff name for logging
  const { data: staffMember } = await supabase
    .from('staff_members')
    .select('name')
    .eq('id', staff.staff_id)
    .single()

  return {
    staffId: staff.staff_id,
    organizationId: staff.organization_id,
    staffName: staffMember?.name || 'Unknown'
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
        const { data: packings, error } = await supabase
          .from('packing_projects')
          .select('*')
          .eq('organization_id', ORG_ID)
          .in('status', ['planning', 'in_progress'])
          .order('created_at', { ascending: false })

        if (error) throw error

        const packingsWithBookings = await Promise.all(
          (packings || []).map(async (packing: any) => {
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

        return new Response(JSON.stringify(packingsWithBookings), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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

        if (packing?.booking_id) {
          const [itemsCount, productsCount] = await Promise.all([
            supabase.from('packing_list_items').select('id', { count: 'exact', head: true }).eq('packing_id', packingId).eq('organization_id', ORG_ID),
            supabase.from('booking_products').select('id', { count: 'exact', head: true }).eq('booking_id', packing.booking_id).eq('organization_id', ORG_ID)
          ])

          const existingCount = itemsCount.count || 0
          const productCount = productsCount.count || 0

          if (existingCount === 0 && productCount > 0) {
            const { data: products } = await supabase
              .from('booking_products')
              .select('id, quantity')
              .eq('booking_id', packing.booking_id)
              .eq('organization_id', ORG_ID)

            if (products && products.length > 0) {
              await supabase.from('packing_list_items').insert(
                products.map((p: any) => ({
                  packing_id: packingId,
                  booking_product_id: p.id,
                  quantity_to_pack: p.quantity,
                  quantity_packed: 0,
                  organization_id: ORG_ID
                }))
              )
            }
          } else if (existingCount < productCount) {
            const [{ data: products }, { data: existingItems }] = await Promise.all([
              supabase.from('booking_products').select('id, quantity').eq('booking_id', packing.booking_id).eq('organization_id', ORG_ID),
              supabase.from('packing_list_items').select('booking_product_id').eq('packing_id', packingId).eq('organization_id', ORG_ID)
            ])

            const existingIds = new Set((existingItems || []).map((i: any) => i.booking_product_id))
            const toAdd = (products || []).filter((p: any) => !existingIds.has(p.id))

            if (toAdd.length > 0) {
              await supabase.from('packing_list_items').insert(
                toAdd.map((p: any) => ({
                  packing_id: packingId,
                  booking_product_id: p.id,
                  quantity_to_pack: p.quantity,
                  quantity_packed: 0,
                  organization_id: ORG_ID
                }))
              )
            }
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
        const { packingId, sku, verifiedBy } = params

        const { data: packingItems, error: fetchError } = await supabase
          .from('packing_list_items')
          .select(`id, quantity_to_pack, quantity_packed, verified_at, booking_products (id, name, sku)`)
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        if (fetchError) return json({ success: false, error: 'Kunde inte hämta packlista' })

        const matchingItem = packingItems?.find((item: any) => item.booking_products?.sku?.toLowerCase() === sku.toLowerCase())
        if (!matchingItem) return json({ success: false, error: `Ingen produkt med SKU "${sku}" hittades` })

        const currentPacked = (matchingItem as any).quantity_packed || 0
        if (currentPacked >= (matchingItem as any).quantity_to_pack) {
          return json({ success: false, error: `${(matchingItem as any).booking_products?.name} är redan fullständigt packad`, productName: (matchingItem as any).booking_products?.name })
        }

        const newQuantity = currentPacked + 1
        const isNowFull = newQuantity >= (matchingItem as any).quantity_to_pack
        const now = new Date().toISOString()

        await supabase.from('packing_list_items').update({
          quantity_packed: newQuantity,
          packed_at: now,
          packed_by: verifiedBy,
          ...(isNowFull ? { verified_at: now, verified_by: verifiedBy } : {})
        }).eq('id', (matchingItem as any).id)

        return json({ success: true, productName: `${(matchingItem as any).booking_products?.name} (${newQuantity}/${(matchingItem as any).quantity_to_pack})` })
      }

      case 'toggle_item': {
        const { itemId, currentlyPacked, quantityToPack, verifiedBy } = params
        const now = new Date().toISOString()

        if (currentlyPacked) {
          await supabase.from('packing_list_items').update({
            quantity_packed: 0, packed_at: null, packed_by: null, verified_at: null, verified_by: null
          }).eq('id', itemId)
        } else {
          const { data: currentItem } = await supabase.from('packing_list_items').select('quantity_packed').eq('id', itemId).single()
          const currentQty = currentItem?.quantity_packed || 0
          const newQty = Math.min(currentQty + 1, quantityToPack)
          const isFull = newQty >= quantityToPack

          await supabase.from('packing_list_items').update({
            quantity_packed: newQty,
            packed_at: now,
            packed_by: verifiedBy,
            ...(isFull ? { verified_at: now, verified_by: verifiedBy } : {})
          }).eq('id', itemId)
        }

        return json({ success: true })
      }

      case 'decrement_item': {
        const { itemId } = params
        const { data: currentItem } = await supabase.from('packing_list_items').select('quantity_packed').eq('id', itemId).single()
        const currentPacked = currentItem?.quantity_packed || 0
        if (currentPacked <= 0) return json({ success: false, error: 'Redan på 0' })

        const newQty = currentPacked - 1
        await supabase.from('packing_list_items').update({
          quantity_packed: newQty,
          verified_at: null,
          verified_by: null,
          ...(newQty === 0 ? { packed_at: null, packed_by: null } : {})
        }).eq('id', itemId)

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
        const { error } = await supabase.from('packing_list_items').update({ parcel_id: parcelId }).eq('id', itemId)
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
        const { error } = await supabase
          .from('packing_projects')
          .update({ signed_by: signedBy, signed_at: new Date().toISOString(), status: 'delivered' })
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)

        if (error) throw error
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
