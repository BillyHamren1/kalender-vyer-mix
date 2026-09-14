import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import { fetchScannerBundleProjection } from '../_shared/scannerBundleProjection.ts'
import {
  parseScannerParcelQuery,
  parseScannerParcelRequest,
  scannerParcelFingerprint,
  SCANNER_PARCEL_SCHEMA,
  type ScannerParcelItemBinding,
  type ScannerParcelRequest,
} from '../_shared/scannerParcelContract.ts'
import { activeScannerSessionMatches, resolveScannerTokenTransport } from '../_shared/scannerLegacyAuth.ts'
import {
  SCANNER_SIGNED_TOKEN_PREFIX,
  scannerReleaseMatches,
  scannerReleaseShaReady,
  scannerSigningSecretReady,
  verifyScannerSignedToken,
} from '../_shared/scannerSignedAuth.ts'
import {
  preflightsScannerContract,
  requestsScannerContract,
  scannerContractResponseHeaders,
  scannerCorsHeaders,
} from '../_shared/scannerCors.ts'

const canonicalBundleUrl = 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1'

type BundleProjection = Extract<Awaited<ReturnType<typeof fetchScannerBundleProjection>>, { ok: true }>

const json = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

async function authenticateScanner(req: Request, admin: ReturnType<typeof createClient>) {
  const transport = resolveScannerTokenTransport(req.headers.get('Authorization'), null)
  if (!transport.valid || !transport.token.startsWith(`${SCANNER_SIGNED_TOKEN_PREFIX}.`)) {
    return { ok: false as const, status: 401, error: 'signed_scanner_token_required' }
  }
  const signingSecret = Deno.env.get('SCANNER_TOKEN_SIGNING_SECRET')
  const releaseSha = Deno.env.get('SCANNER_RELEASE_SHA')
  if (!scannerSigningSecretReady(signingSecret) || !scannerReleaseShaReady(releaseSha)) {
    return { ok: false as const, status: 503, error: 'scanner_authentication_unavailable' }
  }
  const verified = await verifyScannerSignedToken(transport.token, signingSecret)
  if (!verified.valid || !scannerReleaseMatches(verified.claims, releaseSha)) {
    return { ok: false as const, status: 401, error: 'invalid_scanner_token' }
  }
  const { data: staff, error } = await admin
    .from('staff_members')
    .select('id, organization_id, active_mobile_session_id')
    .eq('id', verified.claims.staffId)
    .eq('organization_id', verified.claims.organizationId)
    .maybeSingle()
  if (error || !staff || !activeScannerSessionMatches(staff.active_mobile_session_id, verified.claims.sessionId)) {
    return { ok: false as const, status: 401, error: 'scanner_session_revoked' }
  }
  return {
    ok: true as const,
    staffId: String(staff.id),
    organizationId: String(staff.organization_id),
  }
}

async function verifyPackingIdentity(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  packingId: string,
  bookingId: string,
) {
  const { data, error } = await admin
    .from('packing_projects')
    .select('id, booking_id, organization_id')
    .eq('id', packingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return !error && data != null && String(data.booking_id ?? '') === bookingId
}

function bundleEvidenceBase(input: {
  bookingId: string
  reservationId: string
  snapshotFingerprint: string
}) {
  return {
    verified: true,
    booking_id: input.bookingId,
    reservation_id: input.reservationId,
    snapshot_fingerprint: input.snapshotFingerprint,
  }
}

function matchBundleLine(
  wmsLineId: string,
  itemTypeId: string,
  bundle: BundleProjection,
) {
  const ownerLineId = wmsLineId.split('::')[0]
  const matches = bundle.lines.filter((line) =>
    line.parentReservationLineId === ownerLineId && line.inventoryTypeId === itemTypeId,
  )
  return matches.length === 1 ? matches[0]! : null
}

async function loadParcelItemBindings(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  packingId: string,
  bundle: BundleProjection,
): Promise<ScannerParcelItemBinding[] | null> {
  const { data: items, error } = await admin
    .from('packing_list_items')
    .select('id, wms_line_id, wms_item_type_id, excluded')
    .eq('packing_id', packingId)
    .eq('organization_id', organizationId)
    .eq('excluded', false)
  if (error || !items) return null

  const bindings: ScannerParcelItemBinding[] = []
  for (const item of items) {
    const wmsLineId = typeof item.wms_line_id === 'string' ? item.wms_line_id : ''
    const itemTypeId = typeof item.wms_item_type_id === 'string' ? item.wms_item_type_id : ''
    if (!wmsLineId || !itemTypeId) continue
    const line = matchBundleLine(wmsLineId, itemTypeId, bundle)
    if (!line) continue
    bindings.push({
      packingListItemId: String(item.id),
      parentReservationLineId: line.parentReservationLineId,
      itemTypeId,
      quantityPicked: line.quantityPicked,
    })
  }
  return bindings
}

async function buildBundleEvidence(
  admin: ReturnType<typeof createClient>,
  organizationId: string,
  request: ScannerParcelRequest,
  bundle: BundleProjection,
) {
  const base = bundleEvidenceBase({
    bookingId: request.bookingId,
    reservationId: request.reservationId,
    snapshotFingerprint: bundle.snapshotFingerprint,
  })
  if (request.command !== 'ASSIGN_ITEM' && request.command !== 'UNASSIGN_ITEM') return base
  if (!request.packingListItemId) return null

  const { data: item, error } = await admin
    .from('packing_list_items')
    .select('id, packing_id, organization_id, wms_line_id, wms_item_type_id, excluded')
    .eq('id', request.packingListItemId)
    .eq('packing_id', request.packingId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error || !item || item.excluded === true || !item.wms_line_id || !item.wms_item_type_id) return null

  const line = matchBundleLine(String(item.wms_line_id), String(item.wms_item_type_id), bundle)
  if (!line) return null
  return {
    ...base,
    packing_list_item_id: String(item.id),
    wms_line_id: String(item.wms_line_id),
    item_type_id: String(item.wms_item_type_id),
    quantity_picked: line.quantityPicked,
  }
}

function decorateProjection(
  projection: Record<string, unknown>,
  itemBindings: ScannerParcelItemBinding[],
) {
  return { ...projection, itemBindings }
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    const cors = scannerCorsHeaders(
      req.headers.get('Origin'),
      Deno.env.get('SCANNER_ALLOWED_ORIGINS'),
      !preflightsScannerContract(req),
    )
    return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers })
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, {})

  const scannerRequest = requestsScannerContract(req)
  const releaseSha = Deno.env.get('SCANNER_RELEASE_SHA')
  const cors = scannerCorsHeaders(req.headers.get('Origin'), Deno.env.get('SCANNER_ALLOWED_ORIGINS'), false)
  const headers = scannerContractResponseHeaders(
    cors.headers,
    scannerReleaseShaReady(releaseSha) ? releaseSha : undefined,
  )
  if (!scannerRequest) return json(400, { error: 'scanner_contract_required' }, headers)
  if (!cors.allowed) return json(403, { error: 'scanner_origin_denied' }, headers)

  let body: unknown
  try { body = await req.json() } catch { return json(400, { error: 'invalid_json' }, headers) }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(503, { error: 'service_not_configured' }, headers)
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const auth = await authenticateScanner(req, admin)
  if (!auth.ok) return json(auth.status, { error: auth.error }, headers)

  const query = parseScannerParcelQuery(body)
  let request: ScannerParcelRequest | null = null
  let identity: { packingId: string; bookingId: string; reservationId: string }
  if (query.ok) {
    identity = query.value
  } else {
    const parsed = parseScannerParcelRequest(body)
    if (!parsed.ok) return json(400, { error: parsed.error }, headers)
    request = parsed.value
    identity = parsed.value
  }

  const identityOk = await verifyPackingIdentity(
    admin,
    auth.organizationId,
    identity.packingId,
    identity.bookingId,
  )
  if (!identityOk) return json(404, { error: 'packing_not_found' }, headers)

  const bundleSecret = Deno.env.get('EVENTFLOW_SCANNER_BUNDLE_SECRET') ?? ''
  const bundleUrl = Deno.env.get('EVENTFLOW_BUNDLE_FUNCTIONS_URL') ?? canonicalBundleUrl
  const bundle = await fetchScannerBundleProjection(identity.bookingId, {
    baseUrl: bundleUrl,
    secret: bundleSecret,
    organizationId: auth.organizationId,
  })
  if (!bundle.ok) return json(503, { error: bundle.code }, headers)
  if (bundle.reservationId !== identity.reservationId) {
    return json(409, { error: 'wms_reservation_mismatch' }, headers)
  }

  const itemBindings = await loadParcelItemBindings(admin, auth.organizationId, identity.packingId, bundle)
  if (!itemBindings) return json(503, { error: 'parcel_item_bindings_unavailable' }, headers)

  if (query.ok) {
    const { data, error } = await admin.rpc('scanner_parcel_projection_v1', {
      p_organization_id: auth.organizationId,
      p_packing_id: query.value.packingId,
      p_booking_id: query.value.bookingId,
      p_reservation_id: query.value.reservationId,
    })
    if (error || !isRecord(data)) return json(503, { error: 'parcel_projection_unavailable' }, headers)
    return json(200, {
      schema: SCANNER_PARCEL_SCHEMA,
      projection: decorateProjection(data, itemBindings),
    }, headers)
  }

  if (!request) return json(400, { error: 'invalid_command' }, headers)
  if (bundle.blockers.length > 0) {
    return json(409, { error: 'wms_blocked', blockers: bundle.blockers }, headers)
  }
  const evidence = await buildBundleEvidence(admin, auth.organizationId, request, bundle)
  if (!evidence) return json(409, { error: 'wms_item_evidence_missing' }, headers)

  const fingerprint = await scannerParcelFingerprint(request)
  const { data, error } = await admin.rpc('scanner_parcel_command_v1', {
    p_organization_id: auth.organizationId,
    p_operation_id: request.operationId,
    p_request_fingerprint: fingerprint,
    p_command: request.command,
    p_packing_id: request.packingId,
    p_booking_id: request.bookingId,
    p_reservation_id: request.reservationId,
    p_actor_id: auth.staffId,
    p_device_id: request.deviceId,
    p_occurred_at: request.occurredAt,
    p_parcel_id: request.parcelId,
    p_packing_list_item_id: request.packingListItemId,
    p_quantity: request.quantity,
    p_reason: request.reason,
    p_bundle_evidence: evidence,
  })
  if (error || !isRecord(data)) {
    console.error('[scanner-parcel-api] rpc unavailable', {
      operationId: request.operationId,
      error: error?.message ?? 'invalid_rpc_response',
    })
    return json(503, {
      schema: SCANNER_PARCEL_SCHEMA,
      operationId: request.operationId,
      outcome: 'UNKNOWN',
      message: 'parcel_command_unavailable',
      projection: null,
    }, headers)
  }

  const outcome = data.outcome === 'APPLIED' || data.outcome === 'REJECTED' || data.outcome === 'UNKNOWN'
    ? data.outcome
    : 'UNKNOWN'
  const projection = isRecord(data.projection)
    ? decorateProjection(data.projection, itemBindings)
    : null
  return json(outcome === 'REJECTED' ? 409 : 200, {
    schema: SCANNER_PARCEL_SCHEMA,
    operationId: request.operationId,
    outcome,
    message: typeof data.message === 'string' ? data.message : null,
    projection,
    replay: data.replay === true,
  }, headers)
}

if (import.meta.main) Deno.serve(handleRequest)
