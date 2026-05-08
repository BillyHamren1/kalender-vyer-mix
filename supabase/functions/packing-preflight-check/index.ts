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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type RowStatus = 'PASS' | 'WARNING' | 'BLOCKED'

interface WmsItemType {
  id: string | null
  sku: string | null
  name: string | null
  matchedBy: 'item_type_id' | 'sku' | 'name' | string
}

interface PreflightRow {
  packingItemId: string
  bookingProductId: string | null
  name: string | null
  sku: string | null
  inventoryItemTypeId: string | null
  quantityToPack: number
  status: RowStatus
  reason: string
  suggestedFix: string | null
  wmsMatches: WmsItemType[]
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
): Promise<any | null> {
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
      return null
    }
    return await res.json()
  } catch (e: any) {
    console.warn('[preflight] WMS item-type-lookup network error:', e?.message)
    return null
  }
}

const toMatch = (m: any, matchedBy: string): WmsItemType => ({
  id: m?.id ?? null,
  sku: m?.sku ?? null,
  name: m?.name_sv || m?.name_en || null,
  matchedBy,
})

async function wmsLookupByItemTypeId(
  itemTypeId: string,
  apiKey: string,
  orgId: string,
): Promise<WmsItemType[]> {
  const data = await wmsLookup({ item_type_id: itemTypeId }, apiKey, orgId)
  const m = data?.exactItemTypeMatch
  return m ? [toMatch(m, 'item_type_id')] : []
}

async function wmsLookupBySku(
  sku: string,
  apiKey: string,
  orgId: string,
): Promise<WmsItemType[]> {
  const data = await wmsLookup({ sku }, apiKey, orgId)
  const arr = Array.isArray(data?.skuMatches) ? data.skuMatches : []
  return arr.map((m: any) => toMatch(m, 'sku'))
}

async function wmsLookupByName(
  name: string,
  apiKey: string,
  orgId: string,
): Promise<WmsItemType[]> {
  const data = await wmsLookup({ name }, apiKey, orgId)
  const arr = Array.isArray(data?.nameMatches) ? data.nameMatches : []
  return arr.map((m: any) => toMatch(m, 'name'))
}

// ------------------------------------------------------------
// Per-row classification
// ------------------------------------------------------------
function classifyRow(args: {
  inventoryItemTypeId: string | null
  sku: string | null
  name: string | null
  byItemTypeId: WmsItemType[]
  bySku: WmsItemType[]
  byName: WmsItemType[]
}): { status: RowStatus; reason: string; suggestedFix: string | null; wmsMatches: WmsItemType[] } {
  const { inventoryItemTypeId, sku, name, byItemTypeId, bySku, byName } = args

  // Aggregate WMS matches (deduped by id)
  const seen = new Set<string>()
  const wmsMatches: WmsItemType[] = []
  for (const m of [...byItemTypeId, ...bySku, ...byName]) {
    const key = `${m.id ?? ''}|${m.sku ?? ''}|${m.name ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    wmsMatches.push(m)
  }

  // 1. inventory_item_type_id present → require WMS confirmation by id
  if (inventoryItemTypeId) {
    if (byItemTypeId.length === 1) {
      const m = byItemTypeId[0]
      // Optional sku/name sanity
      if (sku && m.sku && m.sku.toLowerCase() !== sku.toLowerCase()) {
        return {
          status: 'WARNING',
          reason: `WMS sku (${m.sku}) skiljer sig från booking sku (${sku})`,
          suggestedFix: 'Verifiera att rätt item_type_id är kopplad till produkten.',
          wmsMatches,
        }
      }
      return {
        status: 'PASS',
        reason: 'WMS bekräftar item_type_id.',
        suggestedFix: null,
        wmsMatches,
      }
    }
    if (byItemTypeId.length > 1) {
      return {
        status: 'BLOCKED',
        reason: 'WMS returnerade flera item_types för detta inventory_item_type_id.',
        suggestedFix: 'Rensa duplicerade item_types i WMS innan scanning.',
        wmsMatches,
      }
    }
    // No WMS match for the id we have on file
    return {
      status: 'BLOCKED',
      reason: 'inventory_item_type_id finns men matchar inget item_type i WMS.',
      suggestedFix: 'Ompara produkten mot rätt WMS item_type eller rensa felaktigt id.',
      wmsMatches,
    }
  }

  // 2. No inventory_item_type_id → fall back to sku
  if (sku) {
    if (bySku.length === 1) {
      return {
        status: 'WARNING',
        reason: 'inventory_item_type_id saknas men sku matchar exakt en WMS item_type.',
        suggestedFix: `Sätt inventory_item_type_id = ${bySku[0].id ?? '<wms-id>'} på booking_products-raden.`,
        wmsMatches,
      }
    }
    if (bySku.length > 1) {
      return {
        status: 'BLOCKED',
        reason: 'sku matchar flera WMS item_types — kan inte avgöra rätt produkt.',
        suggestedFix: 'Manuell mappning krävs: välj rätt WMS item_type och sätt inventory_item_type_id.',
        wmsMatches,
      }
    }
    // Sku didn't match — try name as last resort, but never PASS on name alone
    if (name && byName.length >= 1) {
      return {
        status: 'BLOCKED',
        reason: 'inventory_item_type_id och sku saknar match — endast namnmatch finns (otillförlitligt).',
        suggestedFix: 'Mappa produkten manuellt mot rätt WMS item_type.',
        wmsMatches,
      }
    }
    return {
      status: 'BLOCKED',
      reason: 'Ingen WMS item_type hittades för sku.',
      suggestedFix: 'Skapa/koppla rätt WMS item_type och sätt inventory_item_type_id.',
      wmsMatches,
    }
  }

  // 3. No id and no sku
  if (name && byName.length >= 1) {
    return {
      status: 'BLOCKED',
      reason: 'Saknar både inventory_item_type_id och sku — endast osäker namnmatch finns.',
      suggestedFix: 'Lägg in sku och inventory_item_type_id på produkten.',
      wmsMatches,
    }
  }
  return {
    status: 'BLOCKED',
    reason: 'Saknar både inventory_item_type_id och sku.',
    suggestedFix: 'Lägg till sku och inventory_item_type_id, eller koppla rätt WMS item_type.',
    wmsMatches,
  }
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
      booking_products (
        id,
        name,
        sku,
        inventory_item_type_id,
        quantity
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
  for (const it of items || []) {
    if (it.excluded) continue
    const bp = (it as any).booking_products || null
    const inventoryItemTypeId: string | null = bp?.inventory_item_type_id ?? null
    const sku: string | null = bp?.sku ?? null
    const name: string | null = bp?.name ?? it.manual_name ?? null

    const [byItemTypeId, bySku, byName] = await Promise.all([
      inventoryItemTypeId
        ? wmsLookupByItemTypeId(inventoryItemTypeId, PRICELIST_API_KEY, orgId)
        : Promise.resolve([] as WmsItemType[]),
      sku ? wmsLookupBySku(sku, PRICELIST_API_KEY, orgId) : Promise.resolve([] as WmsItemType[]),
      name ? wmsLookupByName(name, PRICELIST_API_KEY, orgId) : Promise.resolve([] as WmsItemType[]),
    ])

    const verdict = classifyRow({
      inventoryItemTypeId,
      sku,
      name,
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
    })
  }

  const summary = {
    total: rows.length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    warning: rows.filter((r) => r.status === 'WARNING').length,
    blocked: rows.filter((r) => r.status === 'BLOCKED').length,
  }

  return json({
    success: true,
    packingId,
    bookingNumber,
    summary,
    canStartScanning: summary.blocked === 0,
    items: rows,
  })
})
