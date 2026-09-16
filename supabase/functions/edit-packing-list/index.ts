// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildWarehousePackabilityRequest, parseWarehousePackabilityReceipt, WMS_PACKABILITY_BASE_URL } from '../_shared/warehousePackabilityWms.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const ERROR_MESSAGES: Record<string, string> = {
  packing_not_found: 'Packningen hittades inte i din organisation.',
  packing_not_in_planning: 'Packlistan kan bara redigeras när packningen är i planeringsläge.',
  packing_not_editable: 'Packningsstatus kan inte ändras i packningens nuvarande läge.',
  item_not_found: 'Raden finns inte i den här packlistan.',
  wms_line_id_missing: 'Raden saknar WMS-identitet och kan därför inte ändras säkert.',
  not_planning_excluded: 'Raden togs inte bort i planeringen och kan därför inte återställas härifrån.',
  row_touched: 'Raden är redan packad, kontrollerad eller lagd i kolli och kan inte ändras.',
  verification_failed: 'Ändringen kunde inte verifieras och rullades tillbaka.',
  invalid_mode: 'Ogiltig åtgärd.',
  operation_id_required: 'operation_id krävs för en säker, idempotent ändring.',
  invalid_expected_revision: 'En giltig förväntad revision krävs.',
  forbidden: 'Du saknar behörighet att ändra packningsstatus.',
  revision_conflict: 'Raden har ändrats av någon annan. Ladda om och försök igen.',
  idempotency_conflict: 'operation_id har redan använts för en annan ändring.',
  local_projection_conflict: 'WMS ändrades men den lokala projektionen kunde inte verifieras. Ladda om från WMS.',
}

const mapDbError = (message: string): { code: string; message: string; status: number } => {
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (!message.includes(code)) continue
    const status = code === 'item_not_found' || code === 'packing_not_found'
      ? 404
      : code === 'forbidden'
        ? 403
        : code === 'invalid_mode' || code === 'operation_id_required' || code === 'invalid_expected_revision'
          ? 400
          : 409
    return { code, message: ERROR_MESSAGES[code], status }
  }
  return { code: 'edit_failed', message: 'Kunde inte uppdatera packlistan.', status: 500 }
}

const isTouched = (item: Record<string, unknown>, hasAllocations: boolean) =>
  Number(item.quantity_packed || 0) > 0
  || Boolean(item.parcel_id)
  || Boolean(item.packed_at)
  || Boolean(item.verified_at)
  || hasAllocations

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'method_not_allowed' }, 405)

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '').trim()
    if (!jwt) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)

    const { data: userData, error: authError } = await supabase.auth.getUser(jwt)
    const user = userData?.user || null
    if (authError || !user) return json({ error: 'Unauthorized', code: 'unauthorized' }, 401)

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('organization_id, full_name').eq('user_id', user.id).maybeSingle()
    if (profileError || !profile?.organization_id) {
      return json({ error: 'Organization access required', code: 'no_organization' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const packingId: string | null = body?.packing_id || null
    const itemId: string | null = body?.item_id || null
    const mode: string = body?.mode || ''
    const operationId: string | null = body?.operation_id || null
    const expectedRevision = Number.isSafeInteger(body?.expected_revision) ? body.expected_revision : null
    if (!packingId || !itemId) return json({ error: 'packing_id och item_id krävs', code: 'bad_request' }, 400)

    const packabilityModes = new Set(['set_packable', 'set_non_packable', 'reset_packability'])
    if (mode !== 'exclude' && mode !== 'restore' && !packabilityModes.has(mode)) {
      return json({ error: ERROR_MESSAGES.invalid_mode, code: 'invalid_mode' }, 400)
    }

    if (packabilityModes.has(mode)) {
      if (!operationId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
        return json({ error: ERROR_MESSAGES.operation_id_required, code: 'operation_id_required' }, 400)
      }
      if (expectedRevision === null || expectedRevision < 1) {
        return json({ error: ERROR_MESSAGES.invalid_expected_revision, code: 'invalid_expected_revision' }, 400)
      }

      const { data: permittedRole, error: roleError } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', user.id).eq('organization_id', profile.organization_id)
        .in('role', ['admin', 'lager']).limit(1).maybeSingle()
      if (roleError || !permittedRole) return json({ error: ERROR_MESSAGES.forbidden, code: 'forbidden' }, 403)

      const warehouseOverride = mode === 'set_packable' ? true : mode === 'set_non_packable' ? false : null

      // Return the exact persisted receipt for a safe retry.
      const { data: existingEvent, error: eventReadError } = await supabase
        .from('packing_packability_events')
        .select('packing_id, packing_list_item_id, new_warehouse_override, receipt')
        .eq('organization_id', profile.organization_id).eq('operation_id', operationId).maybeSingle()
      if (eventReadError) return json({ error: 'Packningskvittot kunde inte verifieras.', code: 'local_receipt_unavailable' }, 500)
      if (existingEvent) {
        if (existingEvent.packing_id !== packingId || existingEvent.packing_list_item_id !== itemId || existingEvent.new_warehouse_override !== warehouseOverride) {
          return json({ error: ERROR_MESSAGES.idempotency_conflict, code: 'idempotency_conflict' }, 409)
        }
        return json(existingEvent.receipt)
      }

      const [{ data: packing, error: packingError }, { data: item, error: itemError }] = await Promise.all([
        supabase.from('packing_projects').select('id, status').eq('id', packingId).eq('organization_id', profile.organization_id).maybeSingle(),
        supabase.from('packing_list_items')
          .select('id, wms_line_id, quantity_packed, parcel_id, packed_at, verified_at, is_packable, product_packable_default, booking_packability_override, warehouse_packability_override, packability_revision')
          .eq('id', itemId).eq('packing_id', packingId).eq('organization_id', profile.organization_id).maybeSingle(),
      ])
      if (packingError || !packing) return json({ error: ERROR_MESSAGES.packing_not_found, code: 'packing_not_found' }, 404)
      if (!['planning', 'in_progress'].includes(String(packing.status).toLowerCase())) {
        return json({ error: ERROR_MESSAGES.packing_not_editable, code: 'packing_not_editable' }, 409)
      }
      if (itemError || !item) return json({ error: ERROR_MESSAGES.item_not_found, code: 'item_not_found' }, 404)
      if (!item.wms_line_id) return json({ error: ERROR_MESSAGES.wms_line_id_missing, code: 'wms_line_id_missing' }, 409)
      if (Number(item.packability_revision) !== expectedRevision) {
        return json({ error: ERROR_MESSAGES.revision_conflict, code: 'revision_conflict' }, 409)
      }

      const lowerPrecedence = item.booking_packability_override ?? item.product_packable_default ?? true
      const requestedEffective = warehouseOverride ?? lowerPrecedence
      if (item.is_packable !== false && requestedEffective === false) {
        const { count, error: allocationError } = await supabase.from('packing_list_item_allocations')
          .select('id', { count: 'exact', head: true })
          .eq('packing_list_item_id', itemId).eq('organization_id', profile.organization_id)
        if (allocationError) return json({ error: 'Packningsstatusen kunde inte säkerhetskontrolleras.', code: 'touch_check_failed' }, 500)
        if (isTouched(item, Number(count || 0) > 0)) return json({ error: ERROR_MESSAGES.row_touched, code: 'row_touched' }, 409)
      }

      const apiKey = Deno.env.get('WAREHOUSE_PACKABILITY_API_KEY') || ''
      if (!apiKey) return json({ error: 'WMS packability är inte konfigurerad.', code: 'wms_secret_missing' }, 503)
      const baseUrl = Deno.env.get('BUNDLE_SUPABASE_FUNCTIONS_URL') || WMS_PACKABILITY_BASE_URL
      if (baseUrl.replace(/\/$/, '') !== WMS_PACKABILITY_BASE_URL) {
        return json({ error: 'WMS-adressen matchar inte den kanoniska miljön.', code: 'wms_base_url_mismatch' }, 503)
      }
      const upstream = buildWarehousePackabilityRequest({
        baseUrl,
        apiKey,
        organizationId: profile.organization_id,
        operationId,
        lineId: item.wms_line_id,
        override: warehouseOverride,
        expectedRevision,
      })

      let response: Response
      try {
        response = await fetch(upstream.url, upstream.init)
      } catch (error) {
        console.error('[edit-packing-list] WMS network error', error)
        return json({ error: 'WMS kunde inte nås. Ingen lokal ändring har gjorts.', code: 'wms_unavailable' }, 503)
      }
      const responseBody = await response.json().catch(() => null)
      if (!response.ok) {
        const upstreamCode = String(responseBody?.code || responseBody?.error || '')
        const status = response.status === 409 ? 409 : response.status === 404 ? 404 : response.status === 403 ? 403 : 502
        const code = upstreamCode === 'revision_conflict' ? 'revision_conflict' : `wms_${upstreamCode || 'rejected'}`
        return json({ error: responseBody?.message || responseBody?.error || 'WMS avvisade ändringen.', code }, status)
      }

      let receipt
      try {
        receipt = parseWarehousePackabilityReceipt(responseBody, { operationId, lineId: item.wms_line_id, override: warehouseOverride })
      } catch {
        return json({ error: 'WMS returnerade ett ogiltigt kvitto. Ingen lokal ändring har gjorts.', code: 'wms_bad_receipt' }, 502)
      }

      const { data: projected, error: projectionError } = await supabase.rpc('apply_wms_packability_receipt', {
        _packing_id: packingId,
        _organization_id: profile.organization_id,
        _item_id: itemId,
        _wms_line_id: item.wms_line_id,
        _requested_override: warehouseOverride,
        _operation_id: operationId,
        _expected_local_revision: expectedRevision,
        _wms_receipt: receipt,
        _actor_name: profile.full_name || user.email || 'Lager',
        _actor_id: user.id,
      })
      if (projectionError) {
        const mapped = mapDbError(projectionError.message || '')
        console.error('[edit-packing-list] verified WMS receipt projection failed', mapped.code, projectionError.message)
        return json({ error: mapped.message, code: mapped.code }, mapped.status)
      }
      return json(projected)
    }

    // Legacy Planning exclusion is retained for old clients only.
    const { data, error } = await supabase.rpc('planning_edit_packing_list_item', {
      _packing_id: packingId,
      _organization_id: profile.organization_id,
      _item_id: itemId,
      _mode: mode,
      _actor_name: profile.full_name || user.email || 'Planning',
      _actor_id: user.id,
    })
    if (error) {
      const mapped = mapDbError(error.message || '')
      return json({ error: mapped.message, code: mapped.code }, mapped.status)
    }
    return json({ ...(data || {}), booking_unchanged: true })
  } catch (err) {
    console.error('[edit-packing-list] unexpected', err)
    return json({ error: 'Kunde inte uppdatera packlistan.', code: 'unexpected' }, 500)
  }
})
