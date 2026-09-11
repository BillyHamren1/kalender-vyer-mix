// @ts-nocheck
// ============================================================
// packing-preflight-check
// ------------------------------------------------------------
// Verify that an existing packing list / booking can be scanned
// against Bundle/WMS BEFORE the warehouse starts packing.
//
// This function is READ-ONLY. It never mutates booking_products,
// packing_list_items, or anything in WMS. Its only job is to
// surface old bookings where products are mis-mapped so they can
// be fixed before scanning begins.
//
// Input  (POST):
//   { packing_id: string, booking_number?: string }
//
// Output: per-row PASS / WARNING / BLOCKED + summary +
//         canStartScanning flag.
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

// ------------------------------------------------------------
// WMS lookup helpers
// ------------------------------------------------------------
// Calls Bundle/WMS item-type-lookup. READ-ONLY — never mutates WMS.
// On non-OK response we log and return [] so the row is classified
// as unverified (BLOCKED) rather than silently passing.
// ------------------------------------------------------------

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
      console.warn(`[preflight] WMS item-type-lookup failed status=${res.status} body=${text}`)
      throw new Error(`WMS item-type-lookup failed (${res.status})`)
    }
    return await res.json()
  } catch (e: any) {
    console.warn('[preflight] WMS item-type-lookup network error:', e?.message)
    throw e
  }
}

const toMatch = (m: any, matchedBy: string): PackingPreflightWmsMatch => ({
  id: m?.id ?? null,
  sku: m?.sku ?? null,
  name: m?.name_sv || m?.name_en || null,
  matchedBy,
})

async function wmsLookupByItemTypeId(
  itemTypeId: string,
  apiKey: string,
  orgId: string,
): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ item_type_id: itemTypeId }, apiKey, orgId)
  const m = data?.exactItemTypeMatch
  return m ? [toMatch(m, 'item_type_id')] : []
}

async function wmsLookupBySku(
  sku: string,
  apiKey: string,
  orgId: string,
): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ sku }, apiKey, orgId)
  const arr = Array.isArray(data?.skuMatches) ? data.skuMatches : []
  return arr.map((m: any) => toMatch(m, 'sku'))
}

async function wmsLookupByName(
  name: string,
  apiKey: string,
  orgId: string,
): Promise<PackingPreflightWmsMatch[]> {
  const data = await wmsLookup({ name }, apiKey, orgId)
  const arr = Array.isArray(data?.nameMatches) ? data.nameMatches : []
  return arr.map((m: any) => toMatch(m, 'name'))
}

// ------------------------------------------------------------
// HTTP entrypoint
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ success: false, error: 'POST required' }, 405)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const packingId: string | undefined = body?.packing_id
  const bookingNumberInput: string | undefined = body?.booking_number
  if (!packingId || typeof packingId !== 'string') {
    return json({ success: false, error: 'packing_id required' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Auth: require a Supabase JWT (admin-side preflight).
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!jwt) return json({ success: false, error: 'Auth required' }, 401)
  const { data: userRes, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !userRes?.user) {
    return json({ success: false, error: 'Invalid auth' }, 401)
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('user_id', userRes.user.id)
    .maybeSingle()
  const orgId = profile?.organization_id
  if (!orgId) return json({ success: false, error: 'No organization for user' }, 403)

  // 1. Load packing_projects → resolve booking_id + booking_number
  const { data: packing, error: packErr } = await supabase
    .from('packing_projects')
    .select('id, booking_id, organization_id')
    .eq('id', packingId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (packErr || !packing) {
    return json({ success: false, error: 'packing not found' }, 404)
  }

  let bookingNumber = bookingNumberInput || null
  if (!bookingNumber && packing.booking_id) {
    const { data: bk } = await supabase
      .from('bookings')
      .select('booking_number')
      .eq('id', packing.booking_id)
      .maybeSingle()
    bookingNumber = bk?.booking_number ?? null
  }

  // 2. Load packing_list_items + joined booking_products
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
        id,
        name,
        sku,
        inventory_item_type_id,
        quantity,
        parent_product_id,
        source_missing_since
      )
    `)
    .eq('packing_id', packingId)
    .eq('organization_id', orgId)

  if (itemsErr) {
    return json({ success: false, error: 'failed to load packing list', detail: itemsErr.message }, 500)
  }

  const PRICELIST_API_KEY = Deno.env.get('PRICELIST_API_KEY') || ''
  if (!PRICELIST_API_KEY) {
    return json({ success: false, error: 'PRICELIST_API_KEY saknas för WMS preflight' }, 500)
  }

  // 3. Per-row verification
  const rows: PreflightRow[] = []
  const packageHeaderIds = collectPackingPackageHeaderIds(items || [])
  for (const it of items || []) {
    if (!isPackingPreflightTarget(it, packageHeaderIds)) continue
    const bp = (it as any).booking_products || null
    const inventoryItemTypeId: string | null = (it as any).wms_item_type_id ?? bp?.inventory_item_type_id ?? null
    const sku: string | null = (it as any).wms_sku ?? bp?.sku ?? null
    const name: string | null = bp?.name ?? it.manual_name ?? null

    const [byItemTypeId, bySku, byName] = await Promise.all([
      inventoryItemTypeId
        ? wmsLookupByItemTypeId(inventoryItemTypeId, PRICELIST_API_KEY, orgId)
        : Promise.resolve([] as PackingPreflightWmsMatch[]),
      sku ? wmsLookupBySku(sku, PRICELIST_API_KEY, orgId) : Promise.resolve([] as PackingPreflightWmsMatch[]),
      name ? wmsLookupByName(name, PRICELIST_API_KEY, orgId) : Promise.resolve([] as PackingPreflightWmsMatch[]),
    ])

    const verdict = classifyPackingPreflightRow({
      inventoryItemTypeId,
      sku,
      byItemTypeId,
      bySku,
      byName,
    })

    rows.push({
      packingItemId: it.id,
      bookingProductId: bp?.id ?? null,
      name,
      sku,
      inventoryItemTypeId,
      quantityToPack: Number(it.quantity_to_pack ?? 0),
      status: verdict.status,
      reason: verdict.reason,
      suggestedFix: verdict.suggestedFix,
      wmsMatches: verdict.wmsMatches,
      resolvedItemTypeId: verdict.resolvedItemTypeId,
    })
  }

  const summary = {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    warning: rows.filter((r) => r.status === 'WARNING').length,
    blocked: rows.filter((r) => r.status === 'BLOCKED').length,
  }

  // Kort varsel-ändringar måste kvitteras av lagret innan packlistan används.
  const { count: pendingShortNotice } = await supabase
    .from('packing_change_requests')
    .select('id', { count: 'exact', head: true })
    .eq('packing_id', packingId)
    .eq('status', 'pending')
    .eq('urgency', 'short_notice')

  return json({
    success: true,
    packingId,
    bookingNumber,
    summary,
    pendingShortNoticeChanges: pendingShortNotice || 0,
    canStartScanning: summary.blocked === 0 && (pendingShortNotice || 0) === 0,
    items: rows,
  })
})
