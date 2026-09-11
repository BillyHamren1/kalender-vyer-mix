import { canonicalPayloadHash } from './time-bundle-scanner-contract.ts'

export const EVENTFLOW_SCANNER_PROJECTION_REQUEST_SCHEMA =
  'eventflow-scanner-bundle-projection-request.v1' as const
export const EVENTFLOW_SCANNER_PROJECTION_SCHEMA =
  'eventflow-scanner-bundle-projection.v1' as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = (value: unknown) =>
  typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null

export interface EventFlowScannerProjectionRequest {
  readonly schema: typeof EVENTFLOW_SCANNER_PROJECTION_REQUEST_SCHEMA
  readonly organizationId: string
  readonly bookingId: string
}

export function parseEventFlowScannerProjectionRequest(input: unknown):
  | { readonly ok: true; readonly value: EventFlowScannerProjectionRequest }
  | { readonly ok: false; readonly error: string } {
  if (!isObject(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set(['schema', 'organizationId', 'bookingId'])
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    return { ok: false, error: 'unexpected_field' }
  }
  if (input.schema !== EVENTFLOW_SCANNER_PROJECTION_REQUEST_SCHEMA) {
    return { ok: false, error: 'unsupported_schema' }
  }
  const organizationId = uuid(input.organizationId)
  const bookingId = uuid(input.bookingId)
  if (!organizationId || !bookingId) return { ok: false, error: 'invalid_canonical_id' }
  return {
    ok: true,
    value: { schema: EVENTFLOW_SCANNER_PROJECTION_REQUEST_SCHEMA, organizationId, bookingId },
  }
}

export interface ProjectionSourceRows {
  readonly reservation: Record<string, unknown>
  readonly lines: readonly Record<string, unknown>[]
  readonly components: readonly Record<string, unknown>[]
  readonly allocations: readonly Record<string, unknown>[]
  readonly instances: readonly Record<string, unknown>[]
  readonly manualMovements: readonly Record<string, unknown>[]
}

type Blocker = { readonly code: string; readonly entityId: string | null }

const sortById = (rows: readonly Record<string, unknown>[]) =>
  [...rows].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))

/**
 * Builds a read-only snapshot exclusively from canonical Bundle rows. The
 * fingerprint is a content hash, not a monotonic WMS revision. Unsupported
 * active/released and return semantics stay explicit nulls and blockers.
 */
export async function buildEventFlowScannerProjection(input: {
  readonly request: EventFlowScannerProjectionRequest
  readonly rows: ProjectionSourceRows
  readonly generatedAt: string
}) {
  const { request, rows } = input
  const blockers: Blocker[] = []
  const reservationId = uuid(rows.reservation.id)
  const reservationOrg = uuid(rows.reservation.organization_id)
  if (!reservationId || reservationOrg !== request.organizationId) {
    throw new Error('reservation_identity_mismatch')
  }
  const bookingId = uuid(rows.reservation.source_booking_id)
  if (!bookingId || bookingId !== request.bookingId) throw new Error('booking_identity_mismatch')

  const lines = sortById(rows.lines).map((line) => {
    const lineId = uuid(line.id)
    if (!lineId || uuid(line.organization_id) !== request.organizationId ||
        uuid(line.reservation_id) !== reservationId) {
      throw new Error('reservation_line_identity_mismatch')
    }
    const itemTypeId = uuid(line.item_type_id)
    const packageId = uuid(line.package_id)
    const quantity = integer(line.quantity)
    if ((itemTypeId === null) === (packageId === null) || quantity === null) {
      blockers.push({ code: 'INVALID_RESERVATION_LINE', entityId: lineId })
    }
    const allocations = sortById(rows.allocations.filter((row) => row.reservation_line_id === lineId))
    const manual = sortById(rows.manualMovements.filter((row) => row.source_id === lineId))
    const instanceById = new Map(rows.instances.map((row) => [row.id, row]))

    const physical = (canonicalItemTypeId: string, requiredQuantity: number,
      packageComponentId: string | null, allowedItemTypeIds: ReadonlySet<string>) => {
      const allocatedInstanceIds: string[] = []
      let invalidPhysicalEvidence = false
      for (const allocation of allocations) {
        const allocationId = uuid(allocation.id)
        const instanceId = uuid(allocation.item_instance_id)
        const instance = instanceById.get(instanceId ?? '')
        const instanceTypeId = instance ? uuid(instance.item_type_id) : null
        if (!allocationId || uuid(allocation.organization_id) !== request.organizationId || !instanceId ||
            !instance || uuid(instance.organization_id) !== request.organizationId ||
            !instanceTypeId || !allowedItemTypeIds.has(instanceTypeId)) {
          invalidPhysicalEvidence = true
          continue
        }
        if (instanceTypeId === canonicalItemTypeId) allocatedInstanceIds.push(instanceId)
      }
      const manualPacked = manual.reduce((sum, movement) => {
        const valid = uuid(movement.id) && uuid(movement.organization_id) === request.organizationId &&
          movement.source_module === 'manual-pack-scan' && movement.action_type === 'manual_pack' &&
          allowedItemTypeIds.has(uuid(movement.item_type_id) ?? '') && integer(movement.quantity) !== null
        if (!valid) {
          invalidPhysicalEvidence = true
          return sum
        }
        return uuid(movement.item_type_id) === canonicalItemTypeId
          ? sum + (integer(movement.quantity) ?? 0)
          : sum
      }, 0)
      if (invalidPhysicalEvidence) {
        blockers.push({ code: 'INVALID_PHYSICAL_EVIDENCE', entityId: packageComponentId ?? lineId })
      }
      const packedQuantity = allocatedInstanceIds.length + manualPacked
      return {
        packageComponentId,
        inventoryTypeId: canonicalItemTypeId,
        requiredQuantity,
        packedQuantity,
        returnedQuantity: null,
        allocatedInstanceIds: [...new Set(allocatedInstanceIds)].sort(),
      }
    }

    if (itemTypeId && quantity !== null) {
      return {
        reservationLineId: lineId,
        packageId: null,
        physicalLines: [physical(itemTypeId, quantity, null, new Set([itemTypeId]))],
      }
    }

    const componentRows = sortById(rows.components.filter((row) => row.package_id === packageId))
    const packageItemTypeIds = new Set(componentRows.map((component) => uuid(component.item_type_id)).filter(Boolean) as string[])
    const physicalLines = componentRows.flatMap((component) => {
      const componentId = uuid(component.id)
      const componentOrg = uuid(component.organization_id)
      const componentTypeId = uuid(component.item_type_id)
      const perPackage = integer(component.quantity)
      if (!componentId || componentOrg !== request.organizationId || !componentTypeId ||
          perPackage === null || quantity === null) {
        blockers.push({ code: 'INVALID_PACKAGE_COMPONENT', entityId: componentId ?? packageId })
        return []
      }
      blockers.push({ code: 'PACKAGE_COMPONENT_HAS_NO_RESERVATION_LINE_ID', entityId: componentId })
      return [physical(componentTypeId, perPackage * quantity, componentId, packageItemTypeIds)]
    })
    if (componentRows.length === 0) blockers.push({ code: 'PACKAGE_COMPONENTS_UNAVAILABLE', entityId: packageId })
    return { reservationLineId: lineId, packageId, physicalLines }
  })

  blockers.push({ code: 'WMS_OPERATIONAL_STATUS_UNAVAILABLE', entityId: reservationId })
  blockers.push({ code: 'AUTHORITATIVE_RETURN_QUANTITY_UNAVAILABLE', entityId: reservationId })

  const evidence = {
    reservation: rows.reservation,
    lines: sortById(rows.lines),
    components: sortById(rows.components),
    allocations: sortById(rows.allocations),
    instances: sortById(rows.instances),
    manualMovements: sortById(rows.manualMovements),
  }
  const snapshotFingerprint = await canonicalPayloadHash(evidence)

  return {
    schema: EVENTFLOW_SCANNER_PROJECTION_SCHEMA,
    generatedAt: new Date(input.generatedAt).toISOString(),
    canonicalIdentity: {
      organizationId: request.organizationId,
      reservationId,
      bookingId,
    },
    bookingSourceVersion: typeof rows.reservation.source_version === 'string'
      ? rows.reservation.source_version : null,
    snapshot: { kind: 'CONTENT_SHA256', fingerprint: snapshotFingerprint, monotonic: false },
    operationalStatus: {
      rawReservationStatus: typeof rows.reservation.status === 'string' ? rows.reservation.status : null,
      active: null,
      released: null,
    },
    returnState: { authoritative: false, returnedQuantity: null },
    lines,
    blockers: blockers
      .filter((value, index, all) => all.findIndex((other) =>
        other.code === value.code && other.entityId === value.entityId) === index)
      .sort((a, b) => `${a.code}:${a.entityId}`.localeCompare(`${b.code}:${b.entityId}`)),
  }
}
