// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deriveStatusFromProgress } from '../_shared/packing-progress.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verify base64 token (same format as mobile-app-api)
// Scanner sessions live in warehouse where users rarely log out — give them 30 days.
const TOKEN_EXPIRY_HOURS = 24 * 30

function verifyToken(token: string): { valid: boolean; staffId?: string; error?: string; reason?: string } {
  try {
    const payload = JSON.parse(atob(token))
    if (!payload.staffId || !payload.expiresAt) {
      return { valid: false, error: 'Invalid token format', reason: 'bad_format' }
    }
    if (Date.now() > payload.expiresAt) {
      return { valid: false, error: 'Token expired', reason: 'expired' }
    }
    return { valid: true, staffId: payload.staffId }
  } catch {
    return { valid: false, error: 'Invalid token', reason: 'parse_error' }
  }
}

// Verify token and return staff record with organization_id
async function authenticateRequest(supabase: any, token: string | undefined) {
  if (!token) {
    console.warn('[scanner-api auth] 401 reason=missing_token')
    throw { status: 401, message: 'Token required', reason: 'missing_token' }
  }

  const tokenResult = verifyToken(token)
  if (!tokenResult.valid) {
    console.warn(`[scanner-api auth] 401 reason=${tokenResult.reason} tokenLen=${token.length}`)
    throw { status: 401, message: tokenResult.error || 'Invalid or expired token', reason: tokenResult.reason }
  }

  const staffId = tokenResult.staffId!

  // Get staff member info and organization_id
  const { data: staffMember, error } = await supabase
    .from('staff_members')
    .select('id, name, organization_id')
    .eq('id', staffId)
    .single()

  if (error || !staffMember) {
    console.warn(`[scanner-api auth] 401 reason=staff_not_found staffId=${staffId} dbError=${error?.message ?? 'none'}`)
    throw { status: 401, message: 'Staff member not found', reason: 'staff_not_found' }
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
  // Use the shared packing-progress helper so this evaluation is BIT-FOR-BIT
  // identical to what the UI shows. See `supabase/functions/_shared/packing-progress.ts`
  // and its mirror `src/lib/packing/progress.ts` for the rule.
  //
  // We must fetch the same columns the helper inspects: `excluded` (so excluded
  // rows don't keep status stuck at in_progress when the UI considers them done)
  // and the booking_products id + parent_product_id (so package headers are
  // collapsed exactly the same way).
  const { data: items, error } = await supabase
    .from('packing_list_items')
    .select('id, excluded, quantity_to_pack, quantity_packed, booking_products(id, parent_product_id)')
    .eq('packing_id', packingId)
    .eq('organization_id', orgId)

  if (error || !items || items.length === 0) return

  const desired = deriveStatusFromProgress(items)
  if (desired === null) return // empty list — leave status untouched

  const { data: packing } = await supabase
    .from('packing_projects')
    .select('status')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .single()

  const current = packing?.status
  // Only flip between in_progress ↔ packed. `pending` is owned by upstream
  // creation logic and must not be overwritten here.
  if (desired === 'packed' && current === 'in_progress') {
    console.log(`[status-flow] ${packingId}: in_progress → packed`)
    await supabase
      .from('packing_projects')
      .update({ status: 'packed', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  } else if (desired === 'in_progress' && current === 'packed') {
    console.log(`[status-flow] ${packingId}: packed → in_progress (items unpacked or excluded changed)`)
    await supabase
      .from('packing_projects')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  }
}

// ============== RETURN (IN) FLOW LOGIC ==============
// Allowed transitions for return: delivered → returning → returned
// Driven by quantity_returned vs quantity_packed on the same items.

async function transitionToReturning(supabase: any, packingId: string, orgId: string) {
  const { data } = await supabase
    .from('packing_projects')
    .select('status')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .single()

  // Tillåt: delivered (I produktion) ELLER back (Tillbaka) → returning (Påbörjad)
  if (data?.status === 'delivered' || data?.status === 'back') {
    console.log(`[return-flow] ${packingId}: ${data.status} → returning`)
    await supabase
      .from('packing_projects')
      .update({ status: 'returning', updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  }
}

async function checkIfAllReturned(supabase: any, packingId: string, orgId: string) {
  const { data: items, error } = await supabase
    .from('packing_list_items')
    .select('id, excluded, quantity_to_pack, quantity_packed, quantity_returned, booking_products(id, parent_product_id)')
    .eq('packing_id', packingId)
    .eq('organization_id', orgId)

  if (error || !items || items.length === 0) return

  const headers = new Set<string>()
  for (const it of items) {
    const pid = (it as any).booking_products?.parent_product_id
    if (pid) headers.add(pid)
  }
  let totalOut = 0
  let totalReturned = 0
  let anyReturned = false
  for (const it of items) {
    if ((it as any).excluded === true) continue
    const productId = (it as any).booking_products?.id
    if (productId && headers.has(productId)) continue
    const sent = Math.max(0, ((it as any).quantity_packed ?? 0) | 0)
    const back = Math.max(0, ((it as any).quantity_returned ?? 0) | 0)
    totalOut += sent
    totalReturned += Math.min(back, sent)
    if (back > 0) anyReturned = true
  }

  if (totalOut === 0) return

  const { data: packing } = await supabase
    .from('packing_projects')
    .select('status, booking_id')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .single()

  const current = packing?.status

  if (totalReturned >= totalOut) {
    if (current === 'delivered' || current === 'back' || current === 'returning') {
      console.log(`[return-flow] ${packingId}: ${current} → returned`)
      await supabase
        .from('packing_projects')
        .update({ status: 'returned', updated_at: new Date().toISOString() })
        .eq('id', packingId)
        .eq('organization_id', orgId)
    }
  } else if (anyReturned && (current === 'delivered' || current === 'back')) {
    await transitionToReturning(supabase, packingId, orgId)
  } else if (!anyReturned && current === 'returning') {
    // Alla retur-scans ångrade → tillbaka till `back` om rigdown passerat, annars `delivered`
    let revertTo: 'back' | 'delivered' = 'delivered'
    if (packing?.booking_id) {
      const { data: bk } = await supabase
        .from('bookings')
        .select('rigdowndate')
        .eq('id', packing.booking_id)
        .eq('organization_id', orgId)
        .single()
      const today = new Date().toISOString().slice(0, 10)
      if (bk?.rigdowndate && bk.rigdowndate <= today) revertTo = 'back'
    }
    console.log(`[return-flow] ${packingId}: returning → ${revertTo} (alla retur-scans ångrade)`)
    await supabase
      .from('packing_projects')
      .update({ status: revertTo, updated_at: new Date().toISOString() })
      .eq('id', packingId)
      .eq('organization_id', orgId)
  }
}

// ============== WMS ALLOCATION MIRROR ==============
// Replicates the WMS allocation truth into wms_reservation_allocations so the
// scanner UI can subscribe via Supabase Realtime filtered on packing_id /
// reservation_id. Idempotent on (reservation_id, serial_number).
type WmsAllocRow = {
  serial_number: string
  instance_id?: string | null
  item_type_id?: string | null
  sku?: string | null
  item_type_name?: string | null
  raw?: any
}

async function mirrorWmsAllocations(
  supabase: any,
  opts: {
    orgId: string
    packingId: string
    reservationId: string
    rows: WmsAllocRow[]
    source?: string
  },
): Promise<number> {
  const cleaned = (opts.rows || [])
    .map((r) => ({
      ...r,
      serial_number: (r?.serial_number || '').trim(),
    }))
    .filter((r) => r.serial_number)

  if (cleaned.length === 0) return 0

  const payload = cleaned.map((r) => ({
    organization_id: opts.orgId,
    packing_id: opts.packingId,
    reservation_id: opts.reservationId,
    serial_number: r.serial_number,
    instance_id: r.instance_id || null,
    item_type_id: r.item_type_id || null,
    sku: r.sku || null,
    item_type_name: r.item_type_name || null,
    source: opts.source || 'allocate-instance',
    raw: r.raw ?? null,
    allocated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('wms_reservation_allocations')
    .upsert(payload, { onConflict: 'reservation_id,serial_number' })

  if (error) {
    console.warn('[mirrorWmsAllocations] upsert failed', { error: error.message, count: payload.length })
    return 0
  }
  return payload.length
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
        JSON.stringify({
          error: authErr.message || 'Unauthorized',
          debugCode: `AUTH_${(authErr.reason || 'unknown').toUpperCase()}`,
        }),
        { status: authErr.status || 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const ORG_ID = auth.organizationId

    switch (action) {
      case 'list_active_packings': {
        // Fetch packings that are actionable: planning, in_progress, packed
        // Horizon: 60 dagar framåt så att lager kan planera packningar i förväg.
        const horizonDays = Number(params?.horizonDays) || 60
        const horizon = new Date()
        horizon.setDate(horizon.getDate() + horizonDays)
        const cutoffDate = horizon.toISOString().split('T')[0]

        const { data: allPackings, error } = await supabase
          .from('packing_projects')
          .select('*')
          .eq('organization_id', ORG_ID)
          .in('status', ['planning', 'in_progress', 'packed', 'delivered', 'returning', 'back'])
          .order('created_at', { ascending: false })
          .limit(500)

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

        // Filter rules:
        // - in_progress / packed / returning  → always shown (active work)
        // - planning   → show if rigdaydate within 14 days (or unset)
        // - delivered  → show if rigdowndate within 14 days (or unset) so the
        //                return (IN) flow can be picked up from the calendar.
        const filtered = packingsWithBookings.filter((p: any) => {
          if (p.status === 'in_progress' || p.status === 'packed' || p.status === 'returning' || p.status === 'back') return true
          if (p.status === 'planning') {
            const rigDate = p.booking?.rigdaydate
            if (!rigDate) return true
            return rigDate <= cutoffDate
          }
          if (p.status === 'delivered') {
            const downDate = p.booking?.rigdowndate
            if (!downDate) return true
            return downDate <= cutoffDate
          }
          return false
        }).slice(0, 300)

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

      // ====== HYDRATE WMS allocations for a packing (called on screen mount) ======
      // Proxies WMS get-reservation-allocations and mirrors the result into
      // wms_reservation_allocations so the frontend can subscribe via Realtime.
      case 'get_reservation_allocations': {
        const { packingId } = params
        if (!packingId) return json({ success: false, error: 'packingId krävs', allocations: [] })

        const { data: packing, error: packErr } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .single()
        if (packErr || !packing?.booking_id) {
          return json({ success: false, error: 'Packlistan saknar bokning', allocations: [] })
        }
        const { data: bookingData } = await supabase
          .from('bookings')
          .select('booking_number')
          .eq('id', packing.booking_id)
          .eq('organization_id', ORG_ID)
          .single()
        const bookingNumber = bookingData?.booking_number
        if (!bookingNumber) {
          return json({ success: false, error: 'Bokningen saknar bokningsnummer', allocations: [] })
        }

        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY) {
          return json({ success: false, error: 'Lagersystem ej konfigurerat', allocations: [] })
        }

        const url = `https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/get-reservation-allocations?reservation_id=${encodeURIComponent(bookingNumber)}`
        let wmsAllocs: WmsAllocRow[] = []
        let wmsCurrentState: any = null
        try {
          const resp = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${PRICELIST_API_KEY}`,
              'x-organization-id': ORG_ID,
            },
          })
          const txt = await resp.text()
          let body: any = {}
          try { body = JSON.parse(txt) } catch { /* ignore */ }
          console.log('[get_reservation_allocations] WMS response', {
            status: resp.status,
            bookingNumber,
            packingId,
            keys: Object.keys(body || {}),
          })
          if (!resp.ok) {
            return json({
              success: false,
              error: body?.error || `WMS svarade ${resp.status}`,
              allocations: [],
              debugCode: `WMS_${resp.status}`,
            })
          }
          const list: any[] = Array.isArray(body?.allocations)
            ? body.allocations
            : Array.isArray(body?.data?.allocations)
              ? body.data.allocations
              : Array.isArray(body?.results)
                ? body.results
                : Array.isArray(body)
                  ? body
                  : []
          wmsCurrentState = body?.current_state || body?.data?.current_state || null
          wmsAllocs = list
            .map((row: any) => {
              const data = row?.data && typeof row.data === 'object' ? { ...row, ...row.data } : row
              return {
                serial_number: data?.serial_number || data?.serial || data?.sku_serial || '',
                instance_id: data?.instance_id || data?.id || null,
                item_type_id: data?.item_type_id || data?.itemTypeId || null,
                sku: data?.sku || null,
                item_type_name: data?.item_type_name || data?.item_type || data?.product_name || data?.name || null,
                raw: data,
              } as WmsAllocRow
            })
            .filter((r) => r.serial_number)
        } catch (err: any) {
          console.error('[get_reservation_allocations] fetch error', err)
          return json({
            success: false,
            error: err?.message || 'Kunde inte nå lagersystemet',
            allocations: [],
          })
        }

        const mirrored = await mirrorWmsAllocations(supabase, {
          orgId: ORG_ID,
          packingId,
          reservationId: bookingNumber,
          rows: wmsAllocs,
          source: 'get-reservation-allocations',
        })

        return json({
          success: true,
          reservation_id: bookingNumber,
          packing_id: packingId,
          allocations: wmsAllocs,
          current_state: wmsCurrentState,
          mirroredCount: mirrored,
        })
      }

      case 'verify_product': {

        const { packingId, sku: serialNumber, verifiedBy, activeParcelId, verifiedByStaffId } = params
        console.log('[verify_product] start', { packingId, serialNumber, orgId: ORG_ID, verifiedBy: auth.staffName })

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

        const serialNumbers = serialNumber.split('\n').map((s: string) => s.trim()).filter(Boolean)

        // Metadata-only recovery via WMS scan-status (GET).
        // Used ONLY to retrieve SKU/item_type after WMS reported "already allocated"
        // for a serial. Never used to override WMS's authority on whether a scan is valid.
        const recoverAlreadyAllocatedIdentifiers = async (serials: string[]) => {
          for (const serial of serials) {
            try {
              const url = `https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/scan-status?serial_number=${encodeURIComponent(serial)}`
              const lookupResponse = await fetch(url, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${PRICELIST_API_KEY}`,
                  'x-organization-id': ORG_ID,
                },
              })

              if (!lookupResponse.ok) {
                await lookupResponse.text()
                continue
              }

              const lookupData = await lookupResponse.json().catch(() => null) as any
              if (!lookupData) continue

              const reservationId =
                lookupData.reservation_id ||
                lookupData.booking_number ||
                lookupData.active_reservation?.reservation_id ||
                lookupData.active_reservation?.booking_number ||
                null
              if (reservationId && reservationId !== bookingNumber) {
                console.warn('[verify_product] already-allocated serial belongs to another booking', {
                  serial, bookingNumber, reservationId, orgId: ORG_ID,
                })
                continue
              }

              return {
                returnedSku: lookupData.sku || lookupData.item_type_id || lookupData.serial_number || null,
                returnedItemType: lookupData.item_type || lookupData.item_type_name || lookupData.product_name || lookupData.name || null,
              }
            } catch (lookupError) {
              console.warn('[verify_product] scan-status recovery failed', { serial, lookupError })
            }
          }

          return null
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

        let allocateData = (() => { try { return JSON.parse(responseText) } catch { return {} } })()

        // ===== Ambiguous scan code (WMS duplicate) — handle FIRST, never recover =====
        // En dublett är inte samma sak som "already allocated". Vi får aldrig
        // försöka recovera eller packa lokalt — vi måste stoppa scanflödet helt.
        const isAmbiguous =
          (allocateResponse.status === 409 && allocateData?.code === 'ambiguous_scan_code') ||
          (allocateData?.success === false && allocateData?.code === 'ambiguous_scan_code')
        if (isAmbiguous) {
          console.warn('[verify_product] ambiguous_scan_code_from_wms', {
            packingId,
            bookingNumber,
            serialNumber,
            matches: allocateData?.matches,
          })
          return json({
            success: false,
            code: 'ambiguous_scan_code',
            error: allocateData?.error || 'Dublett QR/serial hittad i WMS',
            matches: Array.isArray(allocateData?.matches) ? allocateData.matches : [],
            scannedValue: serialNumber,
            debugCode: 'WMS_AMBIGUOUS_SCAN_CODE',
          })
        }

        // WMS-fel: HTTP-fel ELLER 200+success:false → skicka WMS error rakt av
        const wmsBlocked = !allocateResponse.ok || allocateData?.success === false
        if (wmsBlocked) {
          const status = allocateResponse.status
          const errBody = allocateData || {}
          const wmsError = errBody.error || errBody.message
          if (status === 409 || /already|allocated|fully/i.test(wmsError || '')) {
            console.warn('[verify_product] WMS_409', { serialNumber, bookingNumber, body: errBody })
            const recovered = await recoverAlreadyAllocatedIdentifiers(serialNumbers)
            if (!recovered) {
              return json({ success: false, error: wmsError || 'Enheten är inte tillgänglig eller redan allokerad', data: errBody.data, debugCode: 'WMS_409' })
            }
            allocateData = {
              results: serialNumbers.map((serial: string) => ({
                serial_number: serial,
                success: false,
                data: {
                  already_allocated: true,
                  sku: recovered.returnedSku,
                  item_type: recovered.returnedItemType,
                },
              })),
            }
          } else {
            console.warn('[verify_product] WMS_BLOCKED', { status, body: errBody })
            return json({ success: false, error: wmsError || `WMS svarade ${status}`, data: errBody.data, debugCode: `WMS_${status}` })
          }
        }

        // Extract stable identifiers from WMS response.
        // WMS = source of truth for what physical item this QR is.
        // Field shapes seen: top-level, .data.*, batch .results[].data.*
        const pickFirst = (...vals: any[]) => vals.find((v) => typeof v === 'string' && v.length > 0) || null
        let wmsItemTypeId: string | null = pickFirst(
          allocateData.data?.item_type_id, allocateData.item_type_id,
        )
        let wmsInstanceId: string | null = pickFirst(
          allocateData.data?.instance_id, allocateData.instance_id,
        )
        let wmsSerialNumber: string | null = pickFirst(
          allocateData.data?.serial_number, allocateData.serial_number, serialNumber,
        )
        let wmsSku: string | null = pickFirst(
          allocateData.data?.sku, allocateData.sku,
        )
        let wmsItemTypeName: string | null = pickFirst(
          allocateData.data?.item_type_name, allocateData.item_type_name,
          allocateData.data?.item_type, allocateData.item_type,
        )

        const alreadyAllocatedSerials: string[] = []
        const failedSerials: string[] = []
        let successfulAllocations = 0

        const absorbWmsFields = (src: any) => {
          if (!src) return
          wmsItemTypeId = wmsItemTypeId || pickFirst(src.data?.item_type_id, src.item_type_id)
          wmsInstanceId = wmsInstanceId || pickFirst(src.data?.instance_id, src.instance_id)
          wmsSerialNumber = wmsSerialNumber || pickFirst(src.data?.serial_number, src.serial_number)
          wmsSku = wmsSku || pickFirst(src.data?.sku, src.sku)
          wmsItemTypeName = wmsItemTypeName || pickFirst(
            src.data?.item_type_name, src.item_type_name,
            src.data?.item_type, src.item_type,
          )
        }

        // Format A: Batch response with results array
        if (Array.isArray(allocateData.results)) {
          for (const r of allocateData.results) {
            if (!serialNumbers.includes(r.serial_number)) continue

            if (r.data?.already_allocated || r.data?.over_allocated) {
              alreadyAllocatedSerials.push(r.serial_number)
              absorbWmsFields(r)
              continue
            }

            if (!r.success) {
              const isAlreadyAllocated = (r.error || '').toLowerCase().includes('fully allocated')
              if (isAlreadyAllocated) {
                alreadyAllocatedSerials.push(r.serial_number)
                absorbWmsFields(r)
              } else {
                failedSerials.push(r.serial_number)
              }
              continue
            }

            successfulAllocations += 1
            absorbWmsFields(r)
          }

          // If ALL were already allocated and no identifiers found, recover via lookup
          if (!wmsItemTypeId && !wmsSku && !wmsItemTypeName && alreadyAllocatedSerials.length > 0 && failedSerials.length === 0) {
            const recovered = await recoverAlreadyAllocatedIdentifiers(alreadyAllocatedSerials)
            if (recovered) {
              // recovered.returnedSku historically may be either sku or item_type_id
              wmsSku = wmsSku || recovered.returnedSku || null
              wmsItemTypeName = wmsItemTypeName || recovered.returnedItemType || null
            }
          }

          if (!wmsItemTypeId && !wmsSku && !wmsItemTypeName && alreadyAllocatedSerials.length > 0 && failedSerials.length === 0) {
            const shortNrs = alreadyAllocatedSerials.map((s: string) => s.replace(/^FACE\d{16}/, '').replace(/^0+/, '') || s)
            console.warn('[allocate-instance] Alla redan allokerade utan artikelinfo:', shortNrs)
            return json({
              success: false,
              error: `Nr ${shortNrs.join(', ')} är redan scannad/allokerad`,
              alreadyScanned: true,
            })
          }

          if (!wmsItemTypeId && !wmsSku && !wmsItemTypeName && failedSerials.length > 0 && alreadyAllocatedSerials.length === 0) {
            console.warn('[allocate-instance] Allokering misslyckades för:', failedSerials)
            return json({ success: false, error: 'Allokering misslyckades i lagersystemet' })
          }
        }

        // Format B: Single-item response (no results array)
        if (!Array.isArray(allocateData.results)) {
          if (allocateData.data?.already_allocated) {
            const recovered = await recoverAlreadyAllocatedIdentifiers(serialNumbers)
            if (!recovered) {
              console.warn('[allocate-instance] Redan allokerad (single, flagga):', serialNumber)
              return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
            }
            wmsSku = wmsSku || recovered.returnedSku || null
            wmsItemTypeName = wmsItemTypeName || recovered.returnedItemType || null
          }

          const isFullyAllocated = (allocateData.error || '').toLowerCase().includes('fully allocated')
          if (isFullyAllocated) {
            absorbWmsFields(allocateData)
            if (!wmsItemTypeId && !wmsSku && !wmsItemTypeName) {
              return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
            }
          } else if (allocateData.success) {
            successfulAllocations = 1
          }
        }

        if (!wmsItemTypeId && !wmsSku && !wmsItemTypeName) {
          console.error('Inventory API returned no item_type_id/sku/name:', allocateData)
          return json({ success: false, error: 'Lagersystemet returnerade ingen artikeltyp' })
        }

        // 3. Match WMS identifiers against local packing_list_items in strict priority:
        //    (A) inventory_item_type_id  (B) sku  (C) name fallback (warn only)
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

        const itemTypeIdLower = wmsItemTypeId?.toLowerCase() || null
        const skuLower = wmsSku?.toLowerCase() || null
        const nameNorm = wmsItemTypeName ? normalizeItemTypeName(wmsItemTypeName) : null

        let matchedBy: 'item_type_id' | 'sku' | 'name_fallback' | null = null
        let matchedItems: any[] = []

        // (A) item_type_id
        if (itemTypeIdLower) {
          matchedItems = (packingItems || []).filter((item: any) =>
            item.booking_products?.inventory_item_type_id?.toLowerCase() === itemTypeIdLower)
          if (matchedItems.length > 0) matchedBy = 'item_type_id'
        }
        // (B) sku
        if (matchedItems.length === 0 && skuLower) {
          matchedItems = (packingItems || []).filter((item: any) =>
            item.booking_products?.sku?.toLowerCase() === skuLower)
          if (matchedItems.length > 0) matchedBy = 'sku'
        }
        // (C) name fallback — last resort, log warning
        if (matchedItems.length === 0 && nameNorm) {
          matchedItems = (packingItems || []).filter((item: any) => {
            const name = item.booking_products?.name
            return name ? normalizeItemTypeName(name) === nameNorm : false
          })
          if (matchedItems.length > 0) {
            matchedBy = 'name_fallback'
            console.warn('[verify_product] name_fallback_match_used', {
              packingId,
              wmsItemTypeId,
              wmsSku,
              wmsItemTypeName,
              wmsInstanceId,
              wmsSerialNumber,
              candidates: matchedItems.map((m: any) => m.id),
            })
          }
        }

        if (matchedItems.length === 0) {
          return json({
            success: false,
            notInPackingList: true,
            wmsItemTypeId,
            wmsSku,
            wmsInstanceId,
            wmsSerialNumber,
            scannedSku: wmsSku || wmsItemTypeId || null, // legacy field
            scannedName: wmsItemTypeName || null,        // legacy field
            bookingId: packing.booking_id,
            error: `Artikeln ${wmsItemTypeName || wmsSku || wmsItemTypeId} finns i WMS men inte i packlistan`,
          })
        }

        if (matchedItems.length > 1) {
          console.warn('[verify_product] multiple_local_rows_matched', {
            packingId,
            matchedBy,
            wmsItemTypeId,
            wmsSku,
            candidates: matchedItems.map((m: any) => ({
              id: m.id,
              packed: m.quantity_packed,
              toPack: m.quantity_to_pack,
            })),
          })
        }

        // Pick row with lowest remaining first (i.e. quantity_packed < quantity_to_pack).
        // If multiple still possible, sort deterministically by id.
        const remaining = (it: any) => Math.max(0, (it.quantity_to_pack || 0) - (it.quantity_packed || 0))
        const sortedMatchedItems = [...matchedItems].sort((a: any, b: any) => {
          const aHas = remaining(a) > 0 ? 0 : 1
          const bHas = remaining(b) > 0 ? 0 : 1
          if (aHas !== bHas) return aHas - bHas
          // Both have-remaining or both full → lowest remaining first, then id
          const ra = remaining(a)
          const rb = remaining(b)
          if (ra !== rb) return ra - rb
          return String(a.id).localeCompare(String(b.id))
        })
        const selectedItem = sortedMatchedItems[0]

        const currentPacked = (selectedItem as any).quantity_packed || 0
        const quantityToPack = (selectedItem as any).quantity_to_pack
        // WMS = source of truth. quantity_packed may only grow by NEW
        // successful allocations confirmed by WMS.
        const incrementBy = successfulAllocations
        const isAlreadyFull = currentPacked >= quantityToPack
        const productName = (selectedItem as any).booking_products?.name
        const now = new Date().toISOString()

        const debug = {
          matchedBy,
          wmsInstanceId,
          wmsItemTypeId,
          wmsSerialNumber,
          wmsSku,
        }

        if (incrementBy <= 0) {
          console.log('[scanner-api] duplicate_scan_blocked_no_local_increment', {
            packingId,
            itemId: (selectedItem as any).id,
            serialNumbers,
            alreadyAllocatedSerials,
            currentPacked,
            quantityToPack,
            ...debug,
          })
          return json({
            success: true,
            alreadyScanned: true,
            overscan: true,
            itemId: (selectedItem as any).id,
            newQuantity: currentPacked,
            quantityToPack,
            productName: `${productName} (${currentPacked}/${quantityToPack})`,
            ...debug,
          })
        }

        const newQuantity = Math.min(currentPacked + incrementBy, quantityToPack)
        const isNowFull = newQuantity >= quantityToPack

        await supabase.from('packing_list_items').update({
          quantity_packed: newQuantity,
          packed_at: now,
          packed_by: verifiedBy,
          packed_by_staff_id: verifiedByStaffId || null,
          ...(isNowFull ? { verified_at: now, verified_by: verifiedBy, verified_by_staff_id: verifiedByStaffId || null } : {}),
          ...(activeParcelId ? { parcel_id: activeParcelId } : {}),
        }).eq('id', (selectedItem as any).id)

        console.log('[scanner-api] local_quantity_packed_incremented', {
          packingId,
          itemId: (selectedItem as any).id,
          from: currentPacked,
          to: newQuantity,
          incrementBy,
          source: 'wms_allocations',
          ...debug,
        })

        // PARCEL ALLOCATION
        if (activeParcelId && !isAlreadyFull) {
          const allocQty = Math.min(incrementBy, quantityToPack - currentPacked)
          if (allocQty > 0) {
            await supabase.from('packing_list_item_allocations').insert({
              packing_list_item_id: (selectedItem as any).id,
              parcel_id: activeParcelId,
              quantity: allocQty,
              scanned_by: verifiedBy || null,
              scanned_by_staff_id: verifiedByStaffId || null,
              organization_id: ORG_ID,
            })
          }
        }

        await checkIfAllPacked(supabase, packingId, ORG_ID)

        // Mirror WMS allocations (both successful + already_allocated) so frontend Realtime fires.
        try {
          const allSerials = [
            ...(Array.isArray(allocateData.results)
              ? allocateData.results.map((r: any) => r.serial_number)
              : [serialNumber]),
            ...alreadyAllocatedSerials,
          ].filter(Boolean)
          const uniqSerials = Array.from(new Set(allSerials))
          if (uniqSerials.length > 0) {
            await mirrorWmsAllocations(supabase, {
              orgId: ORG_ID,
              packingId,
              reservationId: bookingNumber,
              rows: uniqSerials.map((s: string) => ({
                serial_number: s,
                instance_id: wmsInstanceId,
                item_type_id: wmsItemTypeId,
                sku: wmsSku,
                item_type_name: wmsItemTypeName,
              })),
              source: 'verify_product',
            })
          }
        } catch (mirrorErr) {
          console.warn('[verify_product] mirror skipped', mirrorErr)
        }


        return json({
          success: true,
          overscan: isAlreadyFull,
          itemId: (selectedItem as any).id,
          newQuantity,
          quantityToPack,
          productName: `${productName} (${newQuantity}/${quantityToPack})`,
          ...debug,
        })
      }

      case 'toggle_item': {
        const { itemId, currentlyPacked, quantityToPack, verifiedBy, verifiedByStaffId } = params
        const now = new Date().toISOString()

        // Get the packing_id + product info for status flow + WMS sync
        const { data: itemData } = await supabase
          .from('packing_list_items')
          .select(`
            packing_id,
            quantity_packed,
            booking_products ( id, name, sku, inventory_item_type_id, parent_product_id )
          `)
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        const packingId = (itemData as any)?.packing_id
        const product = (itemData as any)?.booking_products || null
        const productName: string | undefined = product?.name

        let newQty = (itemData as any)?.quantity_packed || 0

        // ── DECREMENT / RESET PATH (currentlyPacked === true) ──
        // Local-first is fine here per spec; only increments require WMS-first.
        if (currentlyPacked) {
          await supabase.from('packing_list_items').update({
            quantity_packed: 0, packed_at: null, packed_by: null, packed_by_staff_id: null, verified_at: null, verified_by: null, verified_by_staff_id: null, parcel_id: null
          }).eq('id', itemId).eq('organization_id', ORG_ID)
          await supabase.from('packing_list_item_allocations').delete().eq('packing_list_item_id', itemId).eq('organization_id', ORG_ID)
          newQty = 0
          if (packingId) await checkIfAllPacked(supabase, packingId, ORG_ID)
          return json({ success: true, manualScan: false, bundleSynced: false, productName, newQuantity: newQty })
        }

        // ── INCREMENT PATH — WMS-FIRST ──
        const currentQty = (itemData as any)?.quantity_packed || 0
        if (currentQty >= quantityToPack) {
          // Nothing to add — preserve existing semantics, no WMS call.
          return json({ success: true, manualScan: false, bundleSynced: false, productName, newQuantity: currentQty })
        }

        const sku = product?.sku || null
        const itemTypeId = product?.inventory_item_type_id || null

        // 1) Block rows without any WMS coupling — never tyst lokalt
        if (!sku && !itemTypeId) {
          console.warn('[toggle_item] increment blocked — no WMS coupling', { itemId })
          return json({
            success: false,
            manualScan: true,
            bundleSynced: false,
            productName,
            newQuantity: currentQty,
            error: 'Artikeln saknar WMS-koppling och kan inte bockas av som godkänd scan',
            bundleErrorCode: 'no_wms_coupling',
          })
        }

        // 2) Resolve booking_number (required for reservation_id)
        const { data: packingMeta } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .maybeSingle()

        let bookingNumber: string | null = null
        if ((packingMeta as any)?.booking_id) {
          const { data: bk } = await supabase
            .from('bookings')
            .select('booking_number')
            .eq('id', (packingMeta as any).booking_id)
            .eq('organization_id', ORG_ID)
            .maybeSingle()
          bookingNumber = (bk as any)?.booking_number || null
        }

        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY || !bookingNumber) {
          console.warn('[toggle_item] increment blocked — missing reservation/key', { itemId, hasKey: !!PRICELIST_API_KEY, bookingNumber })
          return json({
            success: false,
            manualScan: true,
            bundleSynced: false,
            productName,
            newQuantity: currentQty,
            error: 'Kunde inte synka manuell avbockning till WMS (saknar reservation eller nyckel)',
            bundleErrorCode: 'missing_reservation',
          })
        }

        // 3) Call WMS manual-pack-scan FIRST
        const HARD_ERROR_CODES = new Set([
          'line_not_in_reservation',
          'line_already_fully_packed',
          'manual_quantity_exceeds_remaining',
          'ambiguous_scan_code',
        ])

        let wmsOk = false
        let bundleError: string | null = null
        let bundleErrorCode: string | null = null
        let networkError = false

        try {
          const resp = await fetch(
            'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/manual-pack-scan',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PRICELIST_API_KEY}`,
                'x-organization-id': ORG_ID,
              },
              body: JSON.stringify({
                item_type_id: itemTypeId,
                sku,
                booking_number: bookingNumber,
                reservation_id: bookingNumber,
                quantity: 1,
                source: 'manual-pack-scan',
                performed_by_label: verifiedBy || null,
                product_name: productName || null,
                packing_list_item_id: itemId,
                verified_by: verifiedBy || null,
              }),
            }
          )
          const text = await resp.text()
          let body: any = {}
          try { body = JSON.parse(text) } catch { /* ignore */ }
          if (resp.ok && body?.success !== false) {
            wmsOk = true
            console.log('[manual-pack-scan] OK', { itemId, itemTypeId, sku, bookingNumber })
          } else {
            bundleError = body?.error || `HTTP ${resp.status}`
            bundleErrorCode = body?.code || null
            console.warn('[manual-pack-scan] failed', { itemId, status: resp.status, code: bundleErrorCode, body: text })
          }
        } catch (err) {
          networkError = true
          bundleError = (err as any)?.message || 'network_error'
          console.warn('[manual-pack-scan] network error', { itemId, err })
        }

        // 4) Hard error or network error → DO NOT touch local quantity_packed
        if (!wmsOk) {
          const isHard = bundleErrorCode && HARD_ERROR_CODES.has(bundleErrorCode)
          const friendly = networkError
            ? 'Kunde inte synka manuell avbockning till WMS'
            : (bundleErrorCode === 'line_already_fully_packed' ? 'Redan fullpackad i WMS'
              : bundleErrorCode === 'ambiguous_scan_code' ? 'Dublett QR/serial i WMS'
              : bundleErrorCode === 'line_not_in_reservation' ? 'Artikeln finns inte i WMS-reservationen'
              : bundleErrorCode === 'manual_quantity_exceeds_remaining' ? 'Antal överstiger kvarvarande i WMS'
              : (bundleError || 'WMS nekade scan'))
          return json({
            success: false,
            manualScan: true,
            bundleSynced: false,
            productName,
            newQuantity: currentQty,
            error: friendly,
            bundleError,
            bundleErrorCode,
            ...(isHard ? { hardWmsError: true } : {}),
          })
        }

        // 5) WMS accepted → now persist local increment
        if (packingId) await transitionToInProgress(supabase, packingId, ORG_ID)

        newQty = Math.min(currentQty + 1, quantityToPack)
        const isFull = newQty >= quantityToPack
        const activeParcelId = (params as any).activeParcelId

        await supabase.from('packing_list_items').update({
          quantity_packed: newQty,
          packed_at: now,
          packed_by: verifiedBy,
          packed_by_staff_id: verifiedByStaffId || null,
          ...(isFull ? { verified_at: now, verified_by: verifiedBy, verified_by_staff_id: verifiedByStaffId || null } : {}),
          ...(activeParcelId ? { parcel_id: activeParcelId } : {}),
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        if (activeParcelId && newQty > currentQty) {
          await supabase.from('packing_list_item_allocations').insert({
            packing_list_item_id: itemId,
            parcel_id: activeParcelId,
            quantity: newQty - currentQty,
            scanned_by: verifiedBy || null,
            scanned_by_staff_id: verifiedByStaffId || null,
            organization_id: ORG_ID,
          })
        }

        if (packingId) await checkIfAllPacked(supabase, packingId, ORG_ID)

        return json({
          success: true,
          manualScan: true,
          bundleSynced: true,
          productName,
          newQuantity: newQty,
        })
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
          ...(newQty === 0 ? { packed_at: null, packed_by: null, parcel_id: null } : {})
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        // PARCEL ALLOCATION: remove 1 unit from the most-recent allocation
        const { data: lastAlloc } = await supabase
          .from('packing_list_item_allocations')
          .select('id, quantity')
          .eq('packing_list_item_id', itemId)
          .eq('organization_id', ORG_ID)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastAlloc) {
          if ((lastAlloc as any).quantity <= 1) {
            await supabase.from('packing_list_item_allocations').delete().eq('id', (lastAlloc as any).id)
          } else {
            await supabase.from('packing_list_item_allocations').update({ quantity: (lastAlloc as any).quantity - 1 }).eq('id', (lastAlloc as any).id)
          }
        }

        // STATUS FLOW: Items decremented, may revert from packed → in_progress
        if (currentItem?.packing_id) {
          await checkIfAllPacked(supabase, currentItem.packing_id, ORG_ID)
        }

        return json({ success: true })
      }

      case 'decrement_by_serial': {
        // Minus-scan for unique codes (RFID / serial numbers).
        //
        // AUTHORITY: WMS is the single source of truth.
        // We ALWAYS call checkin-scan against WMS first. No local lookups
        // decide whether the scan is valid — only WMS does. After WMS confirms
        // (or returns a known "not allocated" state), we mirror the change
        // locally by decrementing the matching packing_list_item.
        const { packingId, serialNumber } = params
        const serial = String(serialNumber || '').trim()
        if (!packingId || !serial) {
          return json({ success: false, error: 'packingId and serialNumber required' }, 400)
        }

        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY) {
          return json({ success: false, error: 'Lagersystem ej konfigurerat' })
        }

        // 1. Call WMS checkin-scan FIRST. This is the source of truth.
        let checkinData: any = null
        let checkinStatus = 0
        try {
          const checkinResponse = await fetch(
            'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/checkin-scan',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PRICELIST_API_KEY}`,
                'x-organization-id': ORG_ID,
              },
              body: JSON.stringify({ serial_number: serial }),
            }
          )
          checkinStatus = checkinResponse.status
          const text = await checkinResponse.text()
          try { checkinData = JSON.parse(text) } catch { checkinData = { raw: text } }
          console.log('[checkin-scan] Response:', { status: checkinStatus, body: checkinData })

          // WMS-fel: skicka WMS error-fältet rakt av (HTTP-fel ELLER 200+success:false)
          const wmsBlocked = !checkinResponse.ok || checkinData?.success === false
          if (wmsBlocked) {
            const wmsError = checkinData?.error || checkinData?.message || `WMS svarade ${checkinStatus}`
            return json({ success: false, error: wmsError, data: checkinData?.data, wmsStatus: checkinStatus })
          }
        } catch (err) {
          console.error('[checkin-scan] network error', { serial, err })
          return json({ success: false, error: 'Kunde inte nå lagersystemet' })
        }

        // WMS kan returnera nyttodata under .data — packa upp för fältmatchning nedan
        if (checkinData?.data && typeof checkinData.data === 'object') {
          checkinData = { ...checkinData, ...checkinData.data }
        }

        // 2. WMS accepted the checkin. Mirror it locally.
        // Strict ID-first matching (A) item_type_id → (B) sku → (C) name fallback (warn).
        const pickFirst = (...vals: any[]) => vals.find((v) => typeof v === 'string' && v.length > 0) || null
        const wmsItemTypeId: string | null = pickFirst(checkinData?.item_type_id)
        const wmsInstanceId: string | null = pickFirst(checkinData?.instance_id)
        const wmsSerialNumber: string | null = pickFirst(checkinData?.serial_number, serial)
        const wmsSku: string | null = pickFirst(checkinData?.sku)
        const wmsItemTypeName: string | null = pickFirst(
          checkinData?.item_type_name, checkinData?.item_type, checkinData?.product_name, checkinData?.name,
        )

        const { data: packingItems } = await supabase
          .from('packing_list_items')
          .select(`id, quantity_packed, packing_id, booking_products (id, name, sku, inventory_item_type_id)`)
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .gt('quantity_packed', 0)

        const normalizeItemTypeName = (value: string): string =>
          value.toLowerCase().replace(/^[↳└⦿\s,\-–—]+/, '').replace(/\s+/g, ' ').trim()

        const itemTypeIdLower = wmsItemTypeId?.toLowerCase() || null
        const skuLower = wmsSku?.toLowerCase() || null
        const nameNorm = wmsItemTypeName ? normalizeItemTypeName(wmsItemTypeName) : null

        let matchedBy: 'item_type_id' | 'sku' | 'name_fallback' | null = null
        let matched: any[] = []

        if (itemTypeIdLower) {
          matched = (packingItems || []).filter((item: any) =>
            item.booking_products?.inventory_item_type_id?.toLowerCase() === itemTypeIdLower)
          if (matched.length > 0) matchedBy = 'item_type_id'
        }
        if (matched.length === 0 && skuLower) {
          matched = (packingItems || []).filter((item: any) =>
            item.booking_products?.sku?.toLowerCase() === skuLower)
          if (matched.length > 0) matchedBy = 'sku'
        }
        if (matched.length === 0 && nameNorm) {
          matched = (packingItems || []).filter((item: any) => {
            const name = item.booking_products?.name
            return name ? normalizeItemTypeName(name) === nameNorm : false
          })
          if (matched.length > 0) {
            matchedBy = 'name_fallback'
            console.warn('[decrement_by_serial] name_fallback_match_used', {
              packingId, wmsItemTypeId, wmsSku, wmsItemTypeName, wmsInstanceId, wmsSerialNumber,
              candidates: matched.map((m: any) => m.id),
            })
          }
        }

        const debug = { matchedBy, wmsInstanceId, wmsItemTypeId, wmsSerialNumber, wmsSku, scannedValue: serial }

        // WMS accepted the checkin even if we can't find a matching local row.
        if (matched.length === 0) {
          await checkIfAllPacked(supabase, packingId, ORG_ID)
          console.log('[scanner-api] decrement_by_serial no_local_row', debug)
          return json({
            success: true,
            itemId: null,
            newQuantity: 0,
            productName: wmsItemTypeName || wmsSku || serial,
            note: 'WMS checkin OK, no local packing row to decrement',
            ...debug,
          })
        }

        const target = [...matched].sort((a: any, b: any) =>
          (b.quantity_packed || 0) - (a.quantity_packed || 0) || String(a.id).localeCompare(String(b.id))
        )[0] as any
        console.log('[scanner-api] decrement_by_serial matched', { ...debug, localPackingItemId: target.id })

        const newQty = Math.max(0, (target.quantity_packed || 0) - 1)
        await supabase.from('packing_list_items').update({
          quantity_packed: newQty,
          verified_at: null,
          verified_by: null,
          ...(newQty === 0 ? { packed_at: null, packed_by: null, parcel_id: null } : {})
        }).eq('id', target.id).eq('organization_id', ORG_ID)

        const { data: lastAlloc } = await supabase
          .from('packing_list_item_allocations')
          .select('id, quantity')
          .eq('packing_list_item_id', target.id)
          .eq('organization_id', ORG_ID)
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lastAlloc) {
          if ((lastAlloc as any).quantity <= 1) {
            await supabase.from('packing_list_item_allocations').delete().eq('id', (lastAlloc as any).id)
          } else {
            await supabase.from('packing_list_item_allocations').update({ quantity: (lastAlloc as any).quantity - 1 }).eq('id', (lastAlloc as any).id)
          }
        }

        await checkIfAllPacked(supabase, packingId, ORG_ID)

        return json({
          success: true,
          itemId: target.id,
          newQuantity: newQty,
          productName: target.booking_products?.name || returnedItemType || returnedSku,
        })
      }

      case 'create_parcel': {
        const { packingId, createdBy, createdByStaffId } = params

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
          .insert({ packing_id: packingId, parcel_number: nextNumber, created_by: createdBy, created_by_staff_id: createdByStaffId || null, organization_id: ORG_ID })
          .select()
          .single()

        if (error) throw error
        return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'register_qr_parcel': {
        // Register a free-form QR-coded physical parcel against a packing list.
        // QR codes are reusable across bookings/packings over time, but unique per packing.
        // is_qr_only=true marks this parcel as a "physical counter only" — no products
        // are assigned to it, it just bumps the parcel counter for shipping/labeling.
        const { packingId, qrCode, createdBy, createdByStaffId } = params
        const code = String(qrCode || '').trim()
        if (!packingId || !code) {
          return json({ success: false, error: 'packingId and qrCode required' }, 400)
        }
        if (code.length > 200) {
          return json({ success: false, error: 'qrCode too long' }, 400)
        }

        // Reject if this QR is already on this packing
        const { data: dup } = await supabase
          .from('packing_parcels')
          .select('id, parcel_number')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .eq('qr_code', code)
          .maybeSingle()
        if (dup) {
          return json({ success: false, error: 'duplicate', parcel: dup }, 409)
        }

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
          .insert({
            packing_id: packingId,
            parcel_number: nextNumber,
            qr_code: code,
            is_qr_only: true,
            created_by: createdBy || 'Scanner',
            created_by_staff_id: createdByStaffId || null,
            organization_id: ORG_ID,
          })
          .select()
          .single()
        if (error) throw error
        return json({ success: true, parcel: data })
      }

      case 'list_qr_parcels': {
        const { packingId } = params
        if (!packingId) return json({ success: false, error: 'packingId required' }, 400)
        const { data, error } = await supabase
          .from('packing_parcels')
          .select('id, parcel_number, qr_code, is_qr_only, created_by, created_at')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .not('qr_code', 'is', null)
          .order('parcel_number', { ascending: true })
        if (error) throw error
        return json({ success: true, parcels: data || [] })
      }

      case 'delete_qr_parcel': {
        const { parcelId } = params
        if (!parcelId) return json({ success: false, error: 'parcelId required' }, 400)
        // Only allow deletion of qr-only parcels with no allocations
        const { data: allocs } = await supabase
          .from('packing_list_item_allocations')
          .select('id')
          .eq('parcel_id', parcelId)
          .eq('organization_id', ORG_ID)
          .limit(1)
        if (allocs && allocs.length > 0) {
          return json({ success: false, error: 'parcel_has_allocations' }, 409)
        }
        const { error } = await supabase
          .from('packing_parcels')
          .delete()
          .eq('id', parcelId)
          .eq('organization_id', ORG_ID)
          .eq('is_qr_only', true)
        if (error) throw error
        return json({ success: true })
      }

      case 'assign_item_to_parcel': {
        // New allocation-based model: a single item can be split across multiple parcels.
        // Inserts an allocation row of `quantity` (default 1). Caller may pass quantity to allocate
        // multiple units in one call. Pass `parcelId: null` + `clearAllocations: true` to clear.
        const { itemId, parcelId, quantity, scannedBy, scannedByStaffId, clearAllocations } = params

        if (clearAllocations) {
          const { error } = await supabase
            .from('packing_list_item_allocations')
            .delete()
            .eq('packing_list_item_id', itemId)
            .eq('organization_id', ORG_ID)
          if (error) throw error
          // Legacy column cleanup
          await supabase.from('packing_list_items').update({ parcel_id: null }).eq('id', itemId).eq('organization_id', ORG_ID)
          return json({ success: true })
        }

        if (!parcelId) return json({ success: false, error: 'parcelId required' })

        const qty = Math.max(1, Number(quantity) || 1)

        // Cap allocation so total allocated never exceeds quantity_to_pack
        const { data: itemRow } = await supabase
          .from('packing_list_items')
          .select('quantity_to_pack')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        const { data: existing } = await supabase
          .from('packing_list_item_allocations')
          .select('quantity')
          .eq('packing_list_item_id', itemId)
          .eq('organization_id', ORG_ID)

        const alreadyAllocated = (existing || []).reduce((s: number, r: any) => s + (r.quantity || 0), 0)
        const cap = itemRow?.quantity_to_pack ?? qty
        const remaining = Math.max(0, cap - alreadyAllocated)
        const finalQty = Math.min(qty, remaining)

        if (finalQty <= 0) {
          return json({ success: true, skipped: true, reason: 'fully_allocated' })
        }

        const { error } = await supabase
          .from('packing_list_item_allocations')
          .insert({
            packing_list_item_id: itemId,
            parcel_id: parcelId,
            quantity: finalQty,
            scanned_by: scannedBy || null,
            scanned_by_staff_id: scannedByStaffId || null,
            organization_id: ORG_ID,
          })
        if (error) throw error

        // Keep legacy parcel_id pointing at the most recent parcel for back-compat consumers.
        await supabase.from('packing_list_items').update({ parcel_id: parcelId }).eq('id', itemId).eq('organization_id', ORG_ID)

        return json({ success: true, quantityAllocated: finalQty })
      }

      case 'get_item_allocations': {
        // Returns: { [itemId]: [{ parcelId, parcelNumber, quantity }] }
        const { packingId } = params

        const { data: items } = await supabase
          .from('packing_list_items')
          .select('id')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        const itemIds = (items || []).map((i: any) => i.id)
        if (itemIds.length === 0) return json({})

        const { data: allocs } = await supabase
          .from('packing_list_item_allocations')
          .select('packing_list_item_id, parcel_id, quantity, scanned_at')
          .in('packing_list_item_id', itemIds)
          .eq('organization_id', ORG_ID)
          .order('scanned_at', { ascending: true })

        const parcelIds = [...new Set((allocs || []).map((a: any) => a.parcel_id))]
        const { data: parcels } = parcelIds.length
          ? await supabase.from('packing_parcels').select('id, parcel_number').in('id', parcelIds)
          : { data: [] }
        const parcelMap: Record<string, number> = {}
        ;(parcels || []).forEach((p: any) => { parcelMap[p.id] = p.parcel_number })

        const result: Record<string, Array<{ parcelId: string; parcelNumber: number; quantity: number }>> = {}
        ;(allocs || []).forEach((a: any) => {
          const arr = result[a.packing_list_item_id] || (result[a.packing_list_item_id] = [])
          // Merge same parcel rows for compact UI
          const existing = arr.find(x => x.parcelId === a.parcel_id)
          if (existing) existing.quantity += a.quantity
          else arr.push({ parcelId: a.parcel_id, parcelNumber: parcelMap[a.parcel_id] ?? 0, quantity: a.quantity })
        })

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
        // LEGACY: returns one parcelNumber per item (the highest parcel_number it appears in).
        // New code should use 'get_item_allocations' to see full split across parcels.
        const { packingId } = params

        const { data: items } = await supabase
          .from('packing_list_items')
          .select('id')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        const itemIds = (items || []).map((i: any) => i.id)
        if (itemIds.length === 0) return json({})

        const { data: allocs } = await supabase
          .from('packing_list_item_allocations')
          .select('packing_list_item_id, parcel_id')
          .in('packing_list_item_id', itemIds)
          .eq('organization_id', ORG_ID)

        const parcelIds = [...new Set((allocs || []).map((a: any) => a.parcel_id))]
        if (parcelIds.length === 0) return json({})

        const { data: parcels } = await supabase
          .from('packing_parcels')
          .select('id, parcel_number')
          .in('id', parcelIds)

        const parcelNumber: Record<string, number> = {}
        ;(parcels || []).forEach((p: any) => { parcelNumber[p.id] = p.parcel_number })

        const result: Record<string, number> = {}
        ;(allocs || []).forEach((a: any) => {
          const num = parcelNumber[a.parcel_id]
          if (!num) return
          if (!result[a.packing_list_item_id] || num > result[a.packing_list_item_id]) {
            result[a.packing_list_item_id] = num
          }
        })

        return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      case 'sign_packing': {
        const { packingId, signedBy, signedByStaffId } = params

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
          .update({ signed_by: signedBy, signed_by_staff_id: signedByStaffId || null, signed_at: new Date().toISOString(), status: 'delivered' })
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

        // WMS scan-status (GET) — read-only lookup, single source of truth
        try {
          const url = `https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/scan-status?serial_number=${encodeURIComponent(serialNumber)}`
          const lookupResponse = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${PRICELIST_API_KEY}`,
              'x-organization-id': ORG_ID,
            },
          })

          if (lookupResponse.ok) {
            const lookupData = await lookupResponse.json()
            // 200+success:false → blockerad/ej hittad enligt WMS — passa fram error
            if (lookupData?.success === false) {
              return json({ found: false, error: lookupData.error || lookupData.message || 'Kunde inte identifiera produkt', data: lookupData.data })
            }
            const payload = lookupData?.data && typeof lookupData.data === 'object' ? { ...lookupData, ...lookupData.data } : lookupData
            return json({
              found: true,
              name: payload.name || payload.item_type_name || payload.product_name || null,
              sku: payload.sku || payload.serial_number || serialNumber,
              status: payload.status || 'unknown',
              condition: payload.condition || null,
              itemType: payload.item_type || payload.item_type_name || null,
              location: payload.location || null,
              currentBooking:
                payload.reservation_id ||
                payload.booking_number ||
                payload.active_reservation?.reservation_id ||
                payload.active_reservation?.booking_number ||
                null,
              activeReservation: payload.active_reservation || null,
              rawData: lookupData,
            })
          }

          const errText = await lookupResponse.text()
          let errBody: any = {}
          try { errBody = JSON.parse(errText) } catch { errBody = {} }
          console.error('[identify_product] scan-status error:', lookupResponse.status, errText)
          return json({ found: false, error: errBody.error || errBody.message || `Kunde inte identifiera produkt (${lookupResponse.status})`, data: errBody.data })
        } catch (fetchErr) {
          console.error('[identify_product] Fetch error:', fetchErr)
          return json({ found: false, error: 'Kunde inte nå lagersystemet' })
        }
      }

      case 'add_unknown_product': {
        const {
          packingId, sku, name, quantityToPack, verifiedBy, verifiedByStaffId,
          // WMS identity (any of these may arrive depending on caller version)
          inventory_item_type_id, inventoryItemTypeId,
          item_type_id, itemTypeId,
          wms_item_type_id, wmsItemTypeId,
          wms_sku, wmsSku,
          wms_instance_id, wmsInstanceId,
          wms_serial_number, wmsSerialNumber,
        } = params

        const qty = Math.max(1, parseInt(quantityToPack, 10) || 1)

        // Resolve WMS identity from any accepted alias
        const resolvedItemTypeId: string | null =
          inventory_item_type_id || inventoryItemTypeId ||
          item_type_id || itemTypeId ||
          wms_item_type_id || wmsItemTypeId || null
        const resolvedWmsSku: string | null = wms_sku || wmsSku || null
        const resolvedWmsInstanceId: string | null = wms_instance_id || wmsInstanceId || null
        const resolvedWmsSerialNumber: string | null = wms_serial_number || wmsSerialNumber || null

        // Prefer the user-entered name, then WMS name (passed in name), then sku-fallback
        const finalSku: string | null = (resolvedWmsSku || sku || null)
        const productName = (name && String(name).trim())
          || (finalSku ? `Okänd: ${finalSku}` : 'Okänd produkt')

        // 1. Resolve booking_id from packing
        const { data: packing, error: packErr } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .eq('organization_id', ORG_ID)
          .single()

        if (packErr || !packing?.booking_id) {
          return json({ success: false, error: 'Packlistan saknar kopplad bokning' })
        }

        // 2. Insert into booking_products so the project/booking is updated.
        //    If WMS knew the item_type_id we MUST persist it — otherwise the
        //    product becomes a frikopplad lokal produkt with no inventory link.
        const bookingProductInsert: Record<string, any> = {
          booking_id: packing.booking_id,
          organization_id: ORG_ID,
          name: productName,
          sku: finalSku,
          quantity: qty,
        }
        if (resolvedItemTypeId) {
          bookingProductInsert.inventory_item_type_id = resolvedItemTypeId
        }

        const { data: bookingProduct, error: bpErr } = await supabase
          .from('booking_products')
          .insert(bookingProductInsert)
          .select('id')
          .single()

        if (bpErr || !bookingProduct) {
          console.error('[add_unknown_product] booking_products insert failed:', bpErr, {
            hadItemTypeId: !!resolvedItemTypeId,
          })
          return json({ success: false, error: 'Kunde inte lägga till produkten i bokningen' })
        }

        console.log('[add_unknown_product] booking_product_created', {
          bookingProductId: bookingProduct.id,
          source: 'scanner_unknown_wms_product',
          inventory_item_type_id: resolvedItemTypeId,
          wms_sku: resolvedWmsSku,
          wms_instance_id: resolvedWmsInstanceId,
          wms_serial_number: resolvedWmsSerialNumber,
        })

        // 3. Insert matching packing_list_items row with quantity_packed = 1
        const now = new Date().toISOString()
        const isFull = 1 >= qty
        const { data: pli, error: pliErr } = await supabase
          .from('packing_list_items')
          .insert({
            packing_id: packingId,
            booking_product_id: bookingProduct.id,
            organization_id: ORG_ID,
            quantity_to_pack: qty,
            quantity_packed: 1,
            packed_at: now,
            packed_by: verifiedBy,
            packed_by_staff_id: verifiedByStaffId || null,
            ...(isFull ? { verified_at: now, verified_by: verifiedBy, verified_by_staff_id: verifiedByStaffId || null } : {}),
          })
          .select('id')
          .single()

        if (pliErr || !pli) {
          console.error('[add_unknown_product] packing_list_items insert failed:', pliErr)
          return json({ success: false, error: 'Kunde inte lägga till i packlistan' })
        }

        await transitionToInProgress(supabase, packingId, ORG_ID)
        await checkIfAllPacked(supabase, packingId, ORG_ID)

        return json({
          success: true,
          itemId: pli.id,
          bookingProductId: bookingProduct.id,
          productName: `${productName} (1/${qty})`,
        })
      }

      case 'physical_return_scan': {
        // WMS-first physical return scan (RFID/serial/QR).
        // 1) Call WMS checkin-scan — that is the source of truth.
        // 2) Only if WMS confirms, mirror locally by bumping quantity_returned
        //    on the packing_list_items row that matches WMS item_type_id/sku.
        const { packingId, scannedValue, returnedBy } = params
        const serial = String(scannedValue || '').trim()
        if (!packingId || !serial) {
          return json({ success: false, error: 'packingId och scannedValue krävs' }, 400)
        }
        console.log('[scanner-api] physical_return_scan_start', {
          packingId,
          scannedValuePrefix: serial.slice(0, 12),
          returnedBy,
        })

        const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY')
        if (!PRICELIST_API_KEY) {
          return json({ success: false, error: 'Lagersystem ej konfigurerat' })
        }

        // 0) Resolve expected booking_number for this packing so WMS can
        //    block returns scanned against the wrong project/booking.
        let expectedBookingNumber: string | null = null
        try {
          const { data: packingRow } = await supabase
            .from('packing_projects')
            .select('id, booking_id')
            .eq('id', packingId)
            .eq('organization_id', ORG_ID)
            .maybeSingle()
          if (packingRow?.booking_id) {
            const { data: bookingRow } = await supabase
              .from('bookings')
              .select('id, booking_number')
              .eq('id', packingRow.booking_id)
              .eq('organization_id', ORG_ID)
              .maybeSingle()
            expectedBookingNumber = bookingRow?.booking_number ? String(bookingRow.booking_number) : null
          }
          if (expectedBookingNumber) {
            console.log('[scanner-api] physical_return_expected_booking_loaded', {
              packingId, expected_booking_number: expectedBookingNumber,
            })
          } else {
            console.warn('[scanner-api] physical_return_expected_booking_missing', {
              packingId, reason: packingRow?.booking_id ? 'booking_without_number' : 'packing_without_booking',
            })
          }
        } catch (e) {
          console.warn('[scanner-api] physical_return_expected_booking_missing', {
            packingId, error: String(e),
          })
        }

        // 1) WMS checkin-scan FIRST.
        let checkinData: any = null
        let checkinStatus = 0
        try {
          const checkinResponse = await fetch(
            'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/checkin-scan',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${PRICELIST_API_KEY}`,
                'x-organization-id': ORG_ID,
              },
              body: JSON.stringify({
                serial_number: serial,
                ...(expectedBookingNumber ? {
                  booking_number: expectedBookingNumber,
                  expected_booking_number: expectedBookingNumber,
                } : {}),
              }),
            }
          )
          checkinStatus = checkinResponse.status
          const text = await checkinResponse.text()
          try { checkinData = JSON.parse(text) } catch { checkinData = { raw: text } }

          const wmsBlocked = !checkinResponse.ok || checkinData?.success === false
          if (wmsBlocked) {
            const wmsError = checkinData?.error || checkinData?.message || `WMS svarade ${checkinStatus}`
            const wrongBooking =
              checkinData?.code === 'wrong_booking' ||
              checkinData?.error_code === 'wrong_booking' ||
              /wrong[_ ]booking|fel\s*bokning|annan\s*bokning/i.test(String(wmsError))
            if (wrongBooking) {
              console.warn('[scanner-api] physical_return_wrong_booking_blocked', {
                packingId,
                expected_booking_number: expectedBookingNumber,
                actual_booking_number:
                  checkinData?.actual_booking_number || checkinData?.booking_number || null,
                serialPrefix: serial.slice(0, 12),
                wmsError,
              })
            } else {
              console.warn('[scanner-api] wms_checkin_failed', {
                packingId, serialPrefix: serial.slice(0, 12), status: checkinStatus, error: wmsError,
              })
            }
            return json({ success: false, error: wmsError, data: checkinData?.data, wmsStatus: checkinStatus, wrongBooking })
          }
        } catch (err) {
          console.error('[scanner-api] wms_checkin_failed (network)', { serialPrefix: serial.slice(0, 12), err: String(err) })
          return json({ success: false, error: 'Kunde inte nå lagersystemet' })
        }

        // Unwrap .data nesting
        if (checkinData?.data && typeof checkinData.data === 'object') {
          checkinData = { ...checkinData, ...checkinData.data }
        }

        const wmsItemTypeId: string | null = checkinData?.item_type_id || null
        const wmsSku: string | null = checkinData?.sku || null
        const wmsItemTypeName: string | null =
          checkinData?.item_type_name || checkinData?.item_type || checkinData?.product_name || checkinData?.name || null
        const wmsInstanceId: string | null = checkinData?.instance_id || null
        const wmsSerialNumber: string | null = checkinData?.serial_number || null

        console.log('[scanner-api] wms_checkin_success', {
          packingId,
          instance_id: wmsInstanceId,
          serial_number: wmsSerialNumber,
          item_type_id: wmsItemTypeId,
          sku: wmsSku,
          item_type_name: wmsItemTypeName,
        })

        // 2) Match local packing_list_items strictly by item_type_id then sku.
        const { data: rows, error: rowsErr } = await supabase
          .from('packing_list_items')
          .select('id, quantity_packed, quantity_returned, booking_products (id, name, sku, inventory_item_type_id)')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)
          .gt('quantity_packed', 0)

        if (rowsErr) {
          console.error('[scanner-api] physical_return_scan rows fetch failed', rowsErr)
          return json({ success: false, error: 'Kunde inte läsa packlistan' })
        }

        const itemTypeLower = wmsItemTypeId?.toLowerCase() || null
        const skuLower = wmsSku?.toLowerCase() || null

        let matched: any[] = []
        if (itemTypeLower) {
          matched = (rows || []).filter((r: any) =>
            r.booking_products?.inventory_item_type_id?.toLowerCase() === itemTypeLower
          )
        }
        if (matched.length === 0 && skuLower) {
          matched = (rows || []).filter((r: any) =>
            r.booking_products?.sku?.toLowerCase() === skuLower
          )
        }

        if (matched.length === 0) {
          console.warn('[scanner-api] local_return_match_missing', {
            packingId,
            item_type_id: wmsItemTypeId,
            sku: wmsSku,
            item_type_name: wmsItemTypeName,
          })
          return json({
            success: false,
            error: `WMS bekräftade scan men hittar ingen rad i packlistan (item_type=${wmsItemTypeId || '?'}, sku=${wmsSku || '?'})`,
            wms: { instance_id: wmsInstanceId, item_type_id: wmsItemTypeId, sku: wmsSku, item_type_name: wmsItemTypeName },
            debugCode: 'LOCAL_RETURN_MATCH_MISSING',
          })
        }

        // Pick the row with most remaining-to-return (sent − back), deterministic
        const target = [...matched].sort((a: any, b: any) => {
          const remA = Math.max(0, (a.quantity_packed || 0) - (a.quantity_returned || 0))
          const remB = Math.max(0, (b.quantity_packed || 0) - (b.quantity_returned || 0))
          return (remB - remA) || String(a.id).localeCompare(String(b.id))
        })[0]

        const sentOut = Math.max(0, (target as any).quantity_packed ?? 0)
        const currentBack = Math.max(0, (target as any).quantity_returned ?? 0)

        console.log('[scanner-api] local_return_match_found', {
          packingId,
          itemId: (target as any).id,
          sentOut,
          currentBack,
          via: itemTypeLower && (target as any).booking_products?.inventory_item_type_id?.toLowerCase() === itemTypeLower ? 'item_type_id' : 'sku',
        })

        if (currentBack >= sentOut) {
          return json({
            success: true,
            alreadyReturned: true,
            itemId: (target as any).id,
            quantity_returned: currentBack,
            quantity_packed: sentOut,
            productName: (target as any).booking_products?.name || wmsItemTypeName,
          })
        }

        const newQty = Math.min(currentBack + 1, sentOut)
        await supabase.from('packing_list_items').update({
          quantity_returned: newQty,
          returned_at: new Date().toISOString(),
          returned_by: returnedBy || null,
        }).eq('id', (target as any).id).eq('organization_id', ORG_ID)

        console.log('[scanner-api] local_quantity_returned_incremented', {
          packingId,
          itemId: (target as any).id,
          from: currentBack,
          to: newQty,
          source: 'wms_checkin',
        })

        await transitionToReturning(supabase, packingId, ORG_ID)
        await checkIfAllReturned(supabase, packingId, ORG_ID)

        return json({
          success: true,
          itemId: (target as any).id,
          productName: (target as any).booking_products?.name || wmsItemTypeName,
          quantity_returned: newQty,
          quantity_packed: sentOut,
          wms: { instance_id: wmsInstanceId, item_type_id: wmsItemTypeId, sku: wmsSku },
        })
      }

      case 'return_scan_sku': {
        // Local-only return scan: match scanned value (SKU or product name)
        // against the packing's items where quantity_packed > quantity_returned,
        // and bump quantity_returned by 1. No WMS round-trip.
        const { packingId, sku: scannedValue, returnedBy } = params
        if (!packingId || !scannedValue) return json({ success: false, error: 'packingId och sku krävs' })

        const trimmed = String(scannedValue).trim()
        const lower = trimmed.toLowerCase()

        const { data: rows, error: rowsErr } = await supabase
          .from('packing_list_items')
          .select('id, quantity_packed, quantity_returned, manual_name, booking_products(id, sku, name)')
          .eq('packing_id', packingId)
          .eq('organization_id', ORG_ID)

        if (rowsErr) {
          console.error('[return_scan_sku] rows fetch failed', rowsErr)
          return json({ success: false, error: 'Kunde inte läsa packlistan' })
        }

        // Match priority: exact SKU > exact name > contains name
        const matchSku = (rows || []).find((r: any) => {
          const s = r.booking_products?.sku
          return s && String(s).trim().toLowerCase() === lower
        })
        const matchName = matchSku || (rows || []).find((r: any) => {
          const n = r.booking_products?.name || r.manual_name
          return n && String(n).trim().toLowerCase() === lower
        })
        const matchContains = matchName || (rows || []).find((r: any) => {
          const n = r.booking_products?.name || r.manual_name
          return n && String(n).toLowerCase().includes(lower)
        })

        const matched = matchContains
        if (!matched) {
          return json({ success: false, error: `Hittade ingen produkt för "${trimmed}" i denna packning`, debugCode: 'RETURN_NO_MATCH' })
        }

        const sentOut = Math.max(0, (matched as any).quantity_packed ?? 0)
        const currentBack = Math.max(0, (matched as any).quantity_returned ?? 0)
        if (sentOut === 0) {
          return json({ success: false, error: 'Inget skickades ut för denna rad', debugCode: 'RETURN_NOT_SENT' })
        }
        if (currentBack >= sentOut) {
          return json({
            success: false,
            error: `Alla ${sentOut} st av "${(matched as any).booking_products?.name || trimmed}" är redan returnerade`,
            debugCode: 'RETURN_ALREADY_FULL',
            itemId: (matched as any).id,
          })
        }

        await transitionToReturning(supabase, packingId, ORG_ID)

        const newQty = Math.min(currentBack + 1, sentOut)
        await supabase.from('packing_list_items').update({
          quantity_returned: newQty,
          returned_at: new Date().toISOString(),
          returned_by: returnedBy || null,
        }).eq('id', (matched as any).id).eq('organization_id', ORG_ID)

        await checkIfAllReturned(supabase, packingId, ORG_ID)
        return json({
          success: true,
          itemId: (matched as any).id,
          productName: (matched as any).booking_products?.name || (matched as any).manual_name,
          quantity_returned: newQty,
          quantity_packed: sentOut,
        })
      }

      // ============== RETURN (IN) FLOW ==============
      // Mirrors toggle_item / decrement_item but on quantity_returned, capped
      // by quantity_packed (= what actually went out). Status flows
      // delivered → returning → returned via checkIfAllReturned.

      case 'return_toggle_item': {
        const { itemId, returnedBy } = params
        const now = new Date().toISOString()

        const { data: itemData } = await supabase
          .from('packing_list_items')
          .select('packing_id, quantity_packed, quantity_returned')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        if (!itemData) return json({ success: false, error: 'Item not found' })
        const sentOut = Math.max(0, (itemData as any).quantity_packed ?? 0)
        const currentBack = Math.max(0, (itemData as any).quantity_returned ?? 0)

        if (sentOut === 0) {
          return json({ success: false, error: 'Inget skickades ut för denna rad' })
        }

        const packingId = (itemData as any).packing_id
        await transitionToReturning(supabase, packingId, ORG_ID)

        const newQty = Math.min(currentBack + 1, sentOut)
        await supabase.from('packing_list_items').update({
          quantity_returned: newQty,
          returned_at: now,
          returned_by: returnedBy || null,
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        await checkIfAllReturned(supabase, packingId, ORG_ID)
        return json({ success: true, quantity_returned: newQty, quantity_packed: sentOut })
      }

      case 'return_decrement_item': {
        const { itemId } = params
        const { data: currentItem } = await supabase
          .from('packing_list_items')
          .select('quantity_returned, packing_id')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        const currentBack = Math.max(0, (currentItem as any)?.quantity_returned ?? 0)
        if (currentBack <= 0) return json({ success: false, error: 'Redan på 0' })

        const newQty = currentBack - 1
        await supabase.from('packing_list_items').update({
          quantity_returned: newQty,
          ...(newQty === 0 ? { returned_at: null, returned_by: null } : {}),
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        if ((currentItem as any)?.packing_id) {
          await checkIfAllReturned(supabase, (currentItem as any).packing_id, ORG_ID)
        }
        return json({ success: true, quantity_returned: newQty })
      }

      case 'reset_return_item': {
        // Set quantity_returned back to 0 for one row (used by "Töm rad" UI)
        const { itemId } = params
        const { data: currentItem } = await supabase
          .from('packing_list_items')
          .select('packing_id')
          .eq('id', itemId)
          .eq('organization_id', ORG_ID)
          .single()

        await supabase.from('packing_list_items').update({
          quantity_returned: 0,
          returned_at: null,
          returned_by: null,
        }).eq('id', itemId).eq('organization_id', ORG_ID)

        if ((currentItem as any)?.packing_id) {
          await checkIfAllReturned(supabase, (currentItem as any).packing_id, ORG_ID)
        }
        return json({ success: true })
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
