// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

/**
 * apply-packing-change-request
 *
 * Lagret kvitterar en (eller alla) bokningsändringar. Först DÅ skrivs
 * ändringen in i packlistan. Vid kort varsel är packningen blockerad tills
 * inga pending short_notice-rader återstår.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    const { data: userData } = await supabase.auth.getUser(jwt)
    const user = userData?.user || null

    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.change_request_ids) ? body.change_request_ids : []
    const packingId: string | null = body?.packing_id || null
    const acknowledgedByName: string | null = body?.acknowledged_by_name || null
    const force: boolean = body?.force === true

    if (!packingId) {
      return json({ error: 'packing_id is required' }, 400)
    }

    let query = supabase
      .from('packing_change_requests')
      .select('*')
      .eq('packing_id', packingId)
      .eq('status', 'pending')
    if (ids.length > 0) query = query.in('id', ids)

    const { data: requests, error: reqError } = await query
    if (reqError) return json({ error: reqError.message }, 500)
    if (!requests || requests.length === 0) return json({ applied: 0, skipped: [], blocked: [] })

    const organizationId = requests[0].organization_id
    const applied: string[] = []
    const blocked: any[] = []

    for (const cr of requests) {
      try {
        if (cr.change_type === 'item_added' && cr.booking_product_id) {
          const { data: existing } = await supabase
            .from('packing_list_items')
            .select('id')
            .eq('packing_id', packingId)
            .eq('booking_product_id', cr.booking_product_id)
            .maybeSingle()

          if (!existing) {
            const { data: product } = await supabase
              .from('booking_products')
              .select('id, sku, inventory_item_type_id')
              .eq('id', cr.booking_product_id)
              .maybeSingle()

            const { error } = await supabase.from('packing_list_items').insert({
              packing_id: packingId,
              booking_product_id: cr.booking_product_id,
              quantity_to_pack: cr.new_quantity ?? 1,
              quantity_packed: 0,
              organization_id: organizationId,
              wms_item_type_id: product?.inventory_item_type_id || null,
              wms_sku: product?.sku || null,
              wms_identity_source: product?.inventory_item_type_id
                ? 'booking_item_type_id'
                : product?.sku
                  ? 'booking_sku_legacy'
                  : 'missing',
              wms_identity_needs_repair: !product?.inventory_item_type_id,
            })
            if (error) throw error
          }
        }

        if (cr.change_type === 'item_removed' && cr.booking_product_id) {
          const { data: item } = await supabase
            .from('packing_list_items')
            .select('id, quantity_packed')
            .eq('packing_id', packingId)
            .eq('booking_product_id', cr.booking_product_id)
            .maybeSingle()

          if (item) {
            if ((item.quantity_packed || 0) > 0) {
              const { error: allocationError } = await supabase
                .from('packing_list_item_allocations')
                .delete()
                .eq('packing_list_item_id', item.id)
                .eq('organization_id', organizationId)
              if (allocationError) throw allocationError

              const { error: resetError } = await supabase
                .from('packing_list_items')
                .update({
                  quantity_packed: 0,
                  packed_at: null,
                  packed_by: null,
                  packed_by_staff_id: null,
                  verified_at: null,
                  verified_by: null,
                  verified_by_staff_id: null,
                  parcel_id: null,
                })
                .eq('id', item.id)
                .eq('organization_id', organizationId)
              if (resetError) throw resetError
            }
            const { error } = await supabase
              .from('packing_list_items')
              .delete()
              .eq('id', item.id)
              .eq('organization_id', organizationId)
            if (error) throw error
          }
        }

        if (cr.change_type === 'quantity_changed' && cr.booking_product_id) {
          const { error } = await supabase
            .from('packing_list_items')
            .update({ quantity_to_pack: cr.new_quantity ?? 0 })
            .eq('packing_id', packingId)
            .eq('booking_product_id', cr.booking_product_id)
          if (error) throw error
        }

        const { error: markError } = await supabase
          .from('packing_change_requests')
          .update({
            status: 'applied',
            acknowledged_by: user?.id || null,
            acknowledged_by_name: acknowledgedByName || user?.email || null,
            acknowledged_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', cr.id)
        if (markError) throw markError

        applied.push(cr.id)
      } catch (err) {
        console.error('[apply-packing-change-request] failed for', cr.id, err)
        blocked.push({ id: cr.id, reason: 'error', message: String(err) })
      }
    }

    const { count } = await supabase
      .from('packing_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('packing_id', packingId)
      .eq('status', 'pending')
      .eq('urgency', 'short_notice')

    const { count: pendingAll } = await supabase
      .from('packing_change_requests')
      .select('id', { count: 'exact', head: true })
      .eq('packing_id', packingId)
      .eq('status', 'pending')

    await supabase
      .from('packing_projects')
      .update({
        blocked_by_short_notice_change: (count || 0) > 0,
        needs_packing_review: (pendingAll || 0) > 0,
        needs_packing_review_reason:
          (pendingAll || 0) > 0 ? 'booking_changed_after_packing_started' : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', packingId)

    return json({
      applied: applied.length,
      applied_ids: applied,
      blocked,
      pending_short_notice: count || 0,
    })
  } catch (err) {
    console.error('[apply-packing-change-request] error', err)
    return json({ error: String(err) }, 500)
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
