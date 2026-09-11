/** Signed, tenant-scoped, read-only Bundle/WMS snapshot for EventFlow Scanner. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.4'
import { verifyScannerSignature } from '../_shared/eventflow-scanner-bundle-contract.ts'
import {
  buildEventFlowScannerProjection,
  parseEventFlowScannerProjectionRequest,
} from '../_shared/eventflow-scanner-projection-contract.ts'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
})

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const rawBody = await request.text()
  const authorized = await verifyScannerSignature({
    secret: Deno.env.get('EVENTFLOW_SCANNER_BUNDLE_SECRET') ?? '',
    rawBody,
    timestamp: request.headers.get('x-scanner-timestamp'),
    nonce: request.headers.get('x-scanner-nonce'),
    signature: request.headers.get('x-scanner-signature'),
  })
  if (!authorized) return json(401, { error: 'invalid_signature' })
  const body = (() => { try { return JSON.parse(rawBody || 'null') } catch { return null } })()
  const parsed = parseEventFlowScannerProjectionRequest(body)
  if (!parsed.ok) return json(400, { error: parsed.error })

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json(503, { error: 'service_not_configured' })
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const org = parsed.value.organizationId
  const bookingId = parsed.value.bookingId

  const reservationResult = await admin.from('reservations')
    .select('id, organization_id, source_booking_id, source_version, external_id, status, updated_at')
    .eq('source_booking_id', bookingId).eq('organization_id', org).maybeSingle()
  if (reservationResult.error) return json(503, { error: 'reservation_lookup_failed' })
  if (!reservationResult.data) return json(404, { error: 'reservation_not_found' })
  const reservationId = reservationResult.data.id

  const linesResult = await admin.from('reservation_lines')
    .select('id, organization_id, reservation_id, item_type_id, package_id, quantity, created_at')
    .eq('reservation_id', reservationId).eq('organization_id', org)
  if (linesResult.error) return json(503, { error: 'reservation_lines_lookup_failed' })
  const lines = linesResult.data ?? []
  const lineIds = lines.map((line) => line.id)
  const packageIds = [...new Set(lines.map((line) => line.package_id).filter(Boolean))]

  const [componentsResult, allocationsResult, movementsResult] = await Promise.all([
    packageIds.length === 0 ? Promise.resolve({ data: [], error: null }) : admin.from('package_components')
      .select('id, organization_id, package_id, item_type_id, quantity, created_at')
      .eq('organization_id', org).in('package_id', packageIds),
    lineIds.length === 0 ? Promise.resolve({ data: [], error: null }) : admin.from('allocations')
      .select('id, organization_id, reservation_line_id, item_instance_id, created_at')
      .eq('organization_id', org).in('reservation_line_id', lineIds),
    lineIds.length === 0 ? Promise.resolve({ data: [], error: null }) : admin.from('inventory_movements')
      .select('id, organization_id, source_id, source_module, action_type, item_type_id, quantity, created_at')
      .eq('organization_id', org).eq('source_module', 'manual-pack-scan')
      .eq('action_type', 'manual_pack').in('source_id', lineIds),
  ])
  if (componentsResult.error || allocationsResult.error || movementsResult.error) {
    return json(503, { error: 'physical_projection_lookup_failed' })
  }
  const instanceIds = [...new Set((allocationsResult.data ?? []).map((row) => row.item_instance_id))]
  const instancesResult = instanceIds.length === 0
    ? { data: [], error: null }
    : await admin.from('item_instances')
      .select('id, organization_id, item_type_id, status, updated_at')
      .eq('organization_id', org).in('id', instanceIds)
  if (instancesResult.error) return json(503, { error: 'item_instances_lookup_failed' })

  try {
    const projection = await buildEventFlowScannerProjection({
      request: parsed.value,
      generatedAt: new Date().toISOString(),
      rows: {
        reservation: reservationResult.data,
        lines,
        components: componentsResult.data ?? [],
        allocations: allocationsResult.data ?? [],
        instances: instancesResult.data ?? [],
        manualMovements: movementsResult.data ?? [],
      },
    })
    return json(200, projection)
  } catch (error) {
    console.error('[eventflow-scanner-projection-v1] invalid owner data', {
      reservationId,
      error: String(error),
    })
    return json(503, { error: 'canonical_projection_invalid' })
  }
}

if (import.meta.main) Deno.serve(handleRequest)
