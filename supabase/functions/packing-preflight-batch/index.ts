// @ts-nocheck
// ============================================================
// packing-preflight-batch
// ------------------------------------------------------------
// Batch version of packing-preflight-check. Runs the same
// per-row WMS verification across ALL packing lists whose linked
// booking falls inside the requested date range, and returns a
// per-packing summary sorted worst-first.
//
// READ-ONLY. Never mutates booking_products / packing_list_items.
//
// Input (POST):
//   {
//     "from_date": "2026-05-08",   // inclusive (eventdate or rigdaydate)
//     "to_date":   "2026-06-30",   // inclusive
//     "status":    "confirmed"     // optional booking status filter
//   }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  classifyPackingPreflightRow,
  collectPackingPackageHeaderIds,
  isPackingPreflightTarget,
  type PackingPreflightStatus,
  type PackingPreflightWmsMatch,
} from '../_shared/packingPreflight.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

interface PreflightRow {
  packingItemId: string
  bookingProductId: string | null
  name: string | null
  sku: string | null
  inventoryItemTypeId: string | null
  quantityToPack: number
  status: PackingPreflightStatus
  reason: string
  suggestedFix: string | null
  wmsMatches: PackingPreflightWmsMatch[]
  resolvedItemTypeId: string | null
}

// ---------- WMS lookup (mirrors packing-preflight-check) ----------
const WMS_BASE_URL = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1'

async function wmsLookup(
  body: Record<string, unknown>,
  apiKey: string,
  orgId: string,
): Promise<any> {
  try {
    const res = await fetch(`${WMS_BASE_URL}/item-type-lookup`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'x-organization-id': orgId,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn(`[preflight-batch] WMS item-type-lookup failed status=${res.status} body=${text}`)
      throw new Error(`WMS item-type-lookup failed (${res.status})`)
    }
    return await res.json()
  } catch (e: any) {
    console.warn('[preflight-batch] WMS network error:', e?.message)
    throw e
  }
}

const toMatch = (m: any, matchedBy: string): PackingPreflightWmsMatch => ({
  id: m?.id ?? null,
  sku: m?.sku ?? null,
  name: m?.name_sv || m?.name_en || null,
  matchedBy,
})

async function wmsLookupByItemTypeId(id: string, apiKey: string, orgId: string): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ item_type_id: id }, apiKey, orgId)
  const m = data?.exactItemTypeMatch
  return m ? [toMatch(m, 'item_type_id')] : []
}
async function wmsLookupBySku(sku: string, apiKey: string, orgId: string): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ sku }, apiKey, orgId)
  const arr = Array.isArray(data?.skuMatches) ? data.skuMatches : []
  return arr.map((m: any) => toMatch(m, 'sku'))
}
async function wmsLookupByName(name: string, apiKey: string, orgId: string): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ name }, apiKey, orgId)
  const arr = Array.isArray(data?.nameMatches) ? data.nameMatches : []
  return arr.map((m: any) => toMatch(m, 'name'))
}

const worstOf = (a: PackingPreflightStatus, b: PackingPreflightStatus): PackingPreflightStatus => {
  const order: Record<PackingPreflightStatus, number> = { PASS: 0, WARNING: 1, BLOCKED: 2 }
  return order[a] >= order[b] ? a : b
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: 'POST required' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ success: false, error: 'Invalid JSON body' }, 400) }

  const fromDate: string | undefined = body?.from_date
  const toDate: string | undefined = body?.to_date
  const statusFilter: string | undefined = body?.status
  if (!fromDate || !toDate) {
    return json({ success: false, error: 'from_date and to_date required (YYYY-MM-DD)' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Auth
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!jwt) return json({ success: false, error: 'Auth required' }, 401)
  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) return json({ success: false, error: 'Invalid auth' }, 401)
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userRes.user.id)
    .maybeSingle()
  const orgId = profile?.organization_id
  if (!orgId) return json({ success: false, error: 'No organization for user' }, 403)

  const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY') || ''
  if (!PRICELIST_API_KEY) {
    return json({ success: false, error: 'PRICELIST_API_KEY saknas för WMS preflight' }, 500)
  }

  // 1. Find bookings in range (eventdate OR rigdaydate inside window)
  let bookingQ = supabase
    .from('bookings')
    .select('id, booking_number, client, eventdate, rigdaydate, status')
    .eq('organization_id', orgId)
    .or(`and(eventdate.gte.${fromDate},eventdate.lte.${toDate}),and(rigdaydate.gte.${fromDate},rigdaydate.lte.${toDate})`)
  if (statusFilter) bookingQ = bookingQ.eq('status', statusFilter)
  const { data: bookings, error: bookingsErr } = await bookingQ
  if (bookingsErr) return json({ success: false, error: 'failed to load bookings', detail: bookingsErr.message }, 500)

  const bookingById = new Map<string, any>()
  for (const b of bookings || []) bookingById.set(b.id, b)
  const bookingIds = Array.from(bookingById.keys())

  if (bookingIds.length === 0) {
    return json({ success: true, totalBookingsChecked: 0, bookings: [] })
  }

  // 2. Find packing_projects for those bookings (via direct booking_id and via packing_project_bookings)
  const packingByBooking = new Map<string, { id: string; bookingId: string }>()

  const { data: directPacks } = await supabase
    .from('packing_projects')
    .select('id, booking_id')
    .eq('organization_id', orgId)
    .in('booking_id', bookingIds)
  for (const p of directPacks || []) {
    if (p.booking_id) packingByBooking.set(p.id + '|' + p.booking_id, { id: p.id, bookingId: p.booking_id })
  }

  const { data: linkRows } = await supabase
    .from('packing_project_bookings')
    .select('packing_project_id, booking_id')
    .in('booking_id', bookingIds)
  for (const l of linkRows || []) {
    packingByBooking.set(l.packing_project_id + '|' + l.booking_id, { id: l.packing_project_id, bookingId: l.booking_id })
  }

  // De-dup by packingId, prefer first booking encountered
  const seenPack = new Set<string>()
  const packPairs: { id: string; bookingId: string }[] = []
  for (const v of packingByBooking.values()) {
    if (seenPack.has(v.id)) continue
    seenPack.add(v.id)
    packPairs.push(v)
  }

  // 3. Per packing list: load items + classify
  const results: any[] = []
  for (const { id: packingId, bookingId } of packPairs) {
    const booking = bookingById.get(bookingId)
    try {
      const { data: items, error: itemsErr } = await supabase
        .from('packing_list_items')
        .select(`
          id,
          booking_product_id,
          quantity_to_pack,
          excluded,
          manual_name,
          wms_item_type_id,
          wms_sku,
          wms_identity_needs_repair,
          booking_products (
            id, name, sku, inventory_item_type_id, quantity, parent_product_id, source_missing_since
          )
        `)
        .eq('packing_id', packingId)
        .eq('organization_id', orgId)
      if (itemsErr) throw new Error(itemsErr.message)

      const rows: PreflightRow[] = []
      let worst: PackingPreflightStatus = 'PASS'
      let pass = 0, warning = 0, blocked = 0
      const packageHeaderIds = collectPackingPackageHeaderIds(items || [])
      for (const it of items || []) {
        if (!isPackingPreflightTarget(it as any, packageHeaderIds)) continue
        const bp = (it as any).booking_products || null
        const inventoryItemTypeId: string | null = (it as any).wms_item_type_id ?? bp?.inventory_item_type_id ?? null
        const sku: string | null = (it as any).wms_sku ?? bp?.sku ?? null
        const name: string | null = bp?.name ?? (it as any).manual_name ?? null
        const [byItemTypeId, bySku, byName] = await Promise.all([
          inventoryItemTypeId ? wmsLookupByItemTypeId(inventoryItemTypeId, PRICELIST_API_KEY, orgId) : Promise.resolve([]),
          sku ? wmsLookupBySku(sku, PRICELIST_API_KEY, orgId) : Promise.resolve([]),
          name ? wmsLookupByName(name, PRICELIST_API_KEY, orgId) : Promise.resolve([]),
        ])
        const verdict = classifyPackingPreflightRow({ inventoryItemTypeId, sku, byItemTypeId, bySku, byName })
        const row: PreflightRow = {
          packingItemId: (it as any).id,
          bookingProductId: bp?.id ?? null,
          name,
          sku,
          inventoryItemTypeId,
          quantityToPack: Number((it as any).quantity_to_pack ?? 0),
          status: verdict.status,
          reason: verdict.reason,
          suggestedFix: verdict.suggestedFix,
          wmsMatches: verdict.wmsMatches,
          resolvedItemTypeId: verdict.resolvedItemTypeId,
        }
        rows.push(row)
        worst = worstOf(worst, row.status)
        if (row.status === 'PASS') pass++
        else if (row.status === 'WARNING') warning++
        else blocked++
      }

      const blockedItems = rows.filter((r) => r.status === 'BLOCKED')

      results.push({
        packingId,
        bookingNumber: booking?.booking_number ?? null,
        customerName: booking?.client ?? null,
        eventDate: booking?.eventdate ?? booking?.rigdaydate ?? null,
        totalItems: rows.length,
        pass,
        warning,
        blocked,
        canStartScanning: blocked === 0,
        worstStatus: worst,
        blockedItems,
      })
    } catch (e: any) {
      console.warn(`[preflight-batch] packing ${packingId} failed:`, e?.message)
      results.push({
        packingId,
        bookingNumber: booking?.booking_number ?? null,
        customerName: booking?.client ?? null,
        eventDate: booking?.eventdate ?? booking?.rigdaydate ?? null,
        totalItems: 0,
        pass: 0,
        warning: 0,
        blocked: 0,
        canStartScanning: false,
        worstStatus: 'ERROR',
        blockedItems: [],
        error: e?.message || 'Unknown error',
      })
    }
  }

  // 4. Sort worst-first
  const sortRank: Record<string, number> = { ERROR: -1, BLOCKED: 0, WARNING: 1, PASS: 2 }
  results.sort((a, b) => {
    const r = sortRank[a.worstStatus] - sortRank[b.worstStatus]
    if (r !== 0) return r
    if (b.blocked !== a.blocked) return b.blocked - a.blocked
    return (a.eventDate || '').localeCompare(b.eventDate || '')
  })

  return json({
    success: true,
    totalBookingsChecked: bookingIds.length,
    bookings: results,
  })
})
