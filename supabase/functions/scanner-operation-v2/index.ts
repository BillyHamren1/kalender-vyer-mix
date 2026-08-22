// @ts-nocheck
// Scanner V2 Planning gateway: authenticated, tenant-scoped, WMS-first.
import { authenticateStaffRequest } from '../_shared/staff-auth.ts'
import { verifyScannerReadiness } from '../_shared/scanner-readiness.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

type CommandType =
  | 'PACK_QUANTITY'
  | 'UNPACK_QUANTITY'
  | 'PACK_INSTANCE'
  | 'UNPACK_INSTANCE'
  | 'RETURN_INSTANCE'
  | 'RETURN_QUANTITY'

const ALLOWED: CommandType[] = [
  'PACK_QUANTITY', 'UNPACK_QUANTITY', 'PACK_INSTANCE', 'UNPACK_INSTANCE',
  'RETURN_INSTANCE', 'RETURN_QUANTITY',
]

const SESSION_REQUIRED = new Set<CommandType>([
  'PACK_QUANTITY', 'UNPACK_QUANTITY', 'PACK_INSTANCE', 'UNPACK_INSTANCE',
  'RETURN_INSTANCE', 'RETURN_QUANTITY',
])

async function authenticateScanner(req: Request) {
  const authResult = await authenticateStaffRequest(req)
  if (!authResult.ok) {
    throw { status: authResult.err.status, code: 'AUTH_FAILED', message: authResult.err.error }
  }
  // Scanner mutations are intentionally mobile-session only. The shared auth
  // helper validates token expiry and active_mobile_session_id and resolves
  // organization server-side. Web/JWT callers must use a dedicated admin flow.
  if (authResult.auth.mode !== 'mobile') {
    throw { status: 403, code: 'MOBILE_SESSION_REQUIRED', message: 'Scanner mutation requires an active mobile staff session' }
  }
  const { staffId, organizationId, admin } = authResult.auth
  const { data: staff } = await admin
    .from('staff_members')
    .select('id, name, organization_id')
    .eq('id', staffId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!staff?.id) {
    throw { status: 401, code: 'AUTH_STAFF_NOT_FOUND', message: 'Staff member not found' }
  }
  return { staffId, staffName: staff.name || 'Unknown', organizationId, admin }
}

async function assertPlanningScope(
  admin: any,
  auth: any,
  command: any,
  config: { wmsBaseUrl: string | null; apiKey: string | null },
) {
  if (command.organizationId && command.organizationId !== auth.organizationId) {
    throw { status: 403, code: 'TENANT_MISMATCH', message: 'Operation belongs to another organization' }
  }
  if (SESSION_REQUIRED.has(command.type as CommandType) && !command.sessionId) {
    throw { status: 400, code: 'PACKING_SESSION_REQUIRED', message: 'Active packing session required' }
  }

  const readiness = await verifyScannerReadiness({
    admin,
    organizationId: auth.organizationId,
    staffId: auth.staffId,
    packingId: command.packingId,
    sessionId: command.sessionId,
    bookingNumber: command.bookingNumber,
    reservationId: command.reservationId,
    itemId: command.itemId ?? null,
    wmsBaseUrl: config.wmsBaseUrl,
    apiKey: config.apiKey,
  })
  if (!readiness.ok) {
    const unavailable = readiness.code === 'WMS_NOT_CONFIGURED' || readiness.code.includes('UNAVAILABLE')
    throw {
      status: unavailable ? 503 : 409,
      code: readiness.code,
      message: readiness.message,
    }
  }
  return readiness.packing
}

const transientWmsStatus = (status: number) => status === 408 || status === 425 || status === 429 || status >= 500

const mapWmsStatus = (httpStatus: number, body: any): string => {
  const explicit = String(body?.status || '').toLowerCase()
  if (['accepted', 'rejected', 'wrong_booking', 'over_capacity', 'not_found', 'duplicate', 'unknown'].includes(explicit)) {
    return explicit
  }
  if (transientWmsStatus(httpStatus)) return 'unknown'
  if (httpStatus === 200 || httpStatus === 201) return 'accepted'
  if (httpStatus === 404) return 'not_found'
  if (httpStatus === 409) {
    if (body?.code === 'WRONG_BOOKING') return 'wrong_booking'
    if (body?.code === 'OVER_CAPACITY') return 'over_capacity'
    return 'rejected'
  }
  if (httpStatus === 422) return body?.code === 'OVER_CAPACITY' ? 'over_capacity' : 'rejected'
  return 'rejected'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ status: 'rejected', error: 'Method not allowed', debugCode: 'METHOD_NOT_ALLOWED' }, 405)

  let operationId: string | null = null
  try {
    const { command } = await req.json()
    operationId = command?.operationId ?? null
    if (!command?.operationId || !command?.type || !command?.packingId) {
      return json({ status: 'rejected', operationId, error: 'Invalid command', debugCode: 'BAD_COMMAND' }, 400)
    }
    if (!ALLOWED.includes(command.type)) {
      return json({ status: 'rejected', operationId, error: `Unknown command ${command.type}`, debugCode: 'BAD_COMMAND_TYPE' }, 400)
    }

    const auth = await authenticateScanner(req)
    const admin = auth.admin

    const gatewayUrl = Deno.env.get('WMS_COMMAND_GATEWAY_URL')
    const apiKey = Deno.env.get('PRICELIST_API_KEY')
    const wmsBaseUrl = Deno.env.get('WMS_READINESS_BASE_URL')
    if (!gatewayUrl || !apiKey || !wmsBaseUrl) {
      return json({
        status: 'unknown', operationId: command.operationId, itemId: command.itemId ?? null,
        error: 'WMS gateway/readiness is not configured', debugCode: 'WMS_NOT_CONFIGURED',
      }, 503)
    }
    await assertPlanningScope(admin, auth, command, { wmsBaseUrl, apiKey })

    let wmsBody: any = null
    let wmsStatus = 0
    try {
      const resp = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'x-idempotency-key': command.operationId,
        },
        body: JSON.stringify({
          operation_id: command.operationId,
          command_type: command.type,
          organization_id: auth.organizationId,
          packing_id: command.packingId,
          reservation_id: command.reservationId ?? null,
          item_id: command.itemId ?? null,
          serial_number: command.serialNumber ?? null,
          sku: command.sku ?? null,
          quantity_delta: command.quantityDelta ?? null,
          booking_number: command.bookingNumber ?? null,
          parcel_id: command.parcelId ?? null,
          session_id: command.sessionId ?? null,
          performed_by: auth.staffId,
          performed_by_name: auth.staffName,
          device_id: command.deviceId ?? null,
          scan_source: command.scanSource ?? command.scanEvent?.source ?? null,
          scan_event: command.scanEvent ?? null,
        }),
      })
      wmsStatus = resp.status
      const text = await resp.text()
      try { wmsBody = JSON.parse(text) } catch { wmsBody = { raw: text } }
    } catch (e) {
      // Fetch failure is ambiguous: WMS may have committed before transport died.
      return json({
        status: 'unknown', operationId: command.operationId, itemId: command.itemId ?? null,
        message: 'WMS outcome is unknown; operation will be retried with the same id',
        debugCode: 'WMS_OUTCOME_UNKNOWN', error: String(e),
      }, 503)
    }

    const status = mapWmsStatus(wmsStatus, wmsBody)
    if (status === 'unknown') {
      return json({
        status: 'unknown', operationId: command.operationId,
        itemId: wmsBody?.item_id ?? command.itemId ?? null,
        message: wmsBody?.message ?? wmsBody?.error ?? 'WMS outcome unknown',
        debugCode: wmsBody?.code ?? `WMS_${wmsStatus}`,
      }, 503)
    }

    const replayed = Boolean(wmsBody?.replayed === true || wmsBody?.already_committed === true || wmsBody?.same_operation === true)
    if (status === 'duplicate' && !replayed) {
      // "Already packed" for a NEW operation is not idempotent replay. Fail closed
      // so the client never gives green feedback for an unrelated prior scan.
      return json({
        status: 'rejected', operationId: command.operationId,
        itemId: wmsBody?.item_id ?? command.itemId ?? null,
        message: wmsBody?.message ?? 'Duplicate state could not be proven as replay of this operation',
        debugCode: 'DUPLICATE_WITHOUT_REPLAY_PROOF', replayed: false,
      }, 409)
    }

    const itemId = wmsBody?.item_id ?? command.itemId ?? null
    const packedQuantity = typeof wmsBody?.packed_quantity === 'number' ? wmsBody.packed_quantity : null
    const requiredQuantity = typeof wmsBody?.required_quantity === 'number' ? wmsBody.required_quantity : null
    const returnedQuantity = typeof wmsBody?.returned_quantity === 'number' ? wmsBody.returned_quantity : null

    // A successful mutation without an authoritative state is not safe to show
    // as green. The mutation may already be committed, so mark the transport
    // outcome UNKNOWN and retry the SAME operation_id until WMS can replay the
    // canonical result. Never invent local arithmetic as a fallback.
    if (status === 'accepted' || status === 'duplicate') {
      const isReturn = command.type === 'RETURN_INSTANCE' || command.type === 'RETURN_QUANTITY'
      const missingAuthoritativeState = !itemId || (isReturn ? returnedQuantity === null : packedQuantity === null)
      if (missingAuthoritativeState) {
        return json({
          status: 'unknown', operationId: command.operationId, itemId,
          message: 'WMS committed/accepted but authoritative state is incomplete; retrying same operation id',
          debugCode: 'AUTHORITATIVE_STATE_MISSING',
        }, 503)
      }
    }

    // Projection is a cache/read model only. Scope every service-role write to
    // verified organization + packing + item. WMS result remains authoritative.
    let projectionWarning: string | null = null
    if ((status === 'accepted' || status === 'duplicate') && itemId) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (packedQuantity !== null) patch.quantity_packed = packedQuantity
      if (returnedQuantity !== null) patch.quantity_returned = returnedQuantity
      const { data, error } = await admin
        .from('packing_list_items')
        .update(patch)
        .eq('id', itemId)
        .eq('packing_id', command.packingId)
        .eq('organization_id', auth.organizationId)
        .select('id')
      if (error || !data?.length) {
        projectionWarning = error?.message || 'Projection row missing in verified scope'
        console.warn('[scanner-operation-v2] projection_write_failed', {
          operationId: command.operationId, organizationId: auth.organizationId,
          packingId: command.packingId, itemId, error: projectionWarning,
        })
      }
    }

    return json({
      status,
      operationId: command.operationId,
      itemId,
      productName: wmsBody?.product_name ?? null,
      packedQuantity,
      requiredQuantity,
      returnedQuantity,
      message: wmsBody?.message ?? wmsBody?.error ?? null,
      debugCode: wmsBody?.code ?? (status === 'accepted' ? null : `WMS_${wmsStatus}`),
      replayed,
      projectionWarning,
    })
  } catch (e: any) {
    const status = Number(e?.status) || 500
    const code = e?.code || 'GATEWAY_EXCEPTION'
    if (status >= 500) {
      return json({ status: 'unknown', operationId, error: e?.message || String(e), debugCode: code }, status)
    }
    const mappedStatus = code === 'WRONG_BOOKING' ? 'wrong_booking' : 'rejected'
    return json({ status: mappedStatus, operationId, error: e?.message || String(e), debugCode: code }, status)
  }
})
