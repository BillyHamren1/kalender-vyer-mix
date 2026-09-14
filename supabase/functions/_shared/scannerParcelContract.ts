export const SCANNER_PARCEL_SCHEMA = 'eventflow-scanner-parcel.v1' as const

export const SCANNER_PARCEL_COMMANDS = [
  'CREATE_PARCEL',
  'ASSIGN_ITEM',
  'UNASSIGN_ITEM',
  'SEAL_PARCEL',
  'REOPEN_PARCEL',
] as const

export type ScannerParcelCommand = (typeof SCANNER_PARCEL_COMMANDS)[number]

export type ScannerParcelQuery = {
  schema: typeof SCANNER_PARCEL_SCHEMA
  action: 'GET_PROJECTION'
  packingId: string
  bookingId: string
  reservationId: string
}

export type ScannerParcelRequest = {
  schema: typeof SCANNER_PARCEL_SCHEMA
  operationId: string
  command: ScannerParcelCommand
  packingId: string
  bookingId: string
  reservationId: string
  deviceId: string
  occurredAt: string
  parcelId: string | null
  packingListItemId: string | null
  quantity: number | null
  reason: string | null
}

export type ScannerParcelItemBinding = {
  packingListItemId: string
  parentReservationLineId: string
  itemTypeId: string
  quantityPicked: number
}

export type ScannerParcelProjection = {
  packingId: string
  bookingId: string
  reservationId: string
  parcels: Array<{
    parcelId: string
    parcelNumber: number
    label: string
    state: 'OPEN' | 'SEALED'
    sealedAt: string | null
    allocations: Array<{
      packingListItemId: string
      quantity: number
    }>
  }>
  itemBindings: ScannerParcelItemBinding[]
}

export type ScannerParcelReceipt = {
  schema: typeof SCANNER_PARCEL_SCHEMA
  operationId: string
  outcome: 'APPLIED' | 'REJECTED' | 'UNKNOWN'
  message: string | null
  projection: ScannerParcelProjection | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OPERATION_RE = /^op-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const uuid = (value: unknown) => typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
const nullableUuid = (value: unknown) => value === null ? null : uuid(value)
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max ? value : null

export type ParseScannerParcelQuery =
  | { ok: true; value: ScannerParcelQuery }
  | { ok: false; error: string }

export function parseScannerParcelQuery(input: unknown): ParseScannerParcelQuery {
  if (!isRecord(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set(['schema', 'action', 'packingId', 'bookingId', 'reservationId'])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== SCANNER_PARCEL_SCHEMA || input.action !== 'GET_PROJECTION') {
    return { ok: false, error: 'unsupported_query' }
  }
  const packingId = uuid(input.packingId)
  const bookingId = uuid(input.bookingId)
  const reservationId = uuid(input.reservationId)
  if (!packingId || !bookingId || !reservationId) return { ok: false, error: 'invalid_identity' }
  return {
    ok: true,
    value: { schema: SCANNER_PARCEL_SCHEMA, action: 'GET_PROJECTION', packingId, bookingId, reservationId },
  }
}

export type ParseScannerParcelRequest =
  | { ok: true; value: ScannerParcelRequest }
  | { ok: false; error: string }

export function parseScannerParcelRequest(input: unknown): ParseScannerParcelRequest {
  if (!isRecord(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set([
    'schema', 'operationId', 'command', 'packingId', 'bookingId', 'reservationId',
    'deviceId', 'occurredAt', 'parcelId', 'packingListItemId', 'quantity', 'reason',
  ])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== SCANNER_PARCEL_SCHEMA) return { ok: false, error: 'unsupported_schema' }
  if (typeof input.operationId !== 'string' || !OPERATION_RE.test(input.operationId)) {
    return { ok: false, error: 'invalid_operation_id' }
  }
  if (!SCANNER_PARCEL_COMMANDS.includes(input.command as ScannerParcelCommand)) {
    return { ok: false, error: 'invalid_command' }
  }
  const packingId = uuid(input.packingId)
  const bookingId = uuid(input.bookingId)
  const reservationId = uuid(input.reservationId)
  const parcelId = nullableUuid(input.parcelId)
  const packingListItemId = nullableUuid(input.packingListItemId)
  const deviceId = text(input.deviceId, 160)
  const occurredAt = text(input.occurredAt, 40)
  if (!packingId || !bookingId || !reservationId || !deviceId) return { ok: false, error: 'invalid_identity' }
  if (parcelId === null && input.parcelId !== null) return { ok: false, error: 'invalid_parcel_id' }
  if (packingListItemId === null && input.packingListItemId !== null) return { ok: false, error: 'invalid_item_id' }
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return { ok: false, error: 'invalid_occurred_at' }

  const command = input.command as ScannerParcelCommand
  const quantity = input.quantity === null ? null : input.quantity
  const reason = input.reason === null ? null : text(input.reason, 500)
  if (quantity !== null && (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 100_000)) {
    return { ok: false, error: 'invalid_quantity' }
  }
  if (input.reason !== null && (reason === null || reason.length < 3)) return { ok: false, error: 'invalid_reason' }

  if (command === 'CREATE_PARCEL') {
    if (parcelId !== null || packingListItemId !== null || quantity !== null || reason !== null) {
      return { ok: false, error: 'unexpected_command_value' }
    }
  } else if (command === 'ASSIGN_ITEM' || command === 'UNASSIGN_ITEM') {
    if (!parcelId || !packingListItemId || quantity === null || reason !== null) {
      return { ok: false, error: 'missing_command_value' }
    }
  } else if (command === 'SEAL_PARCEL') {
    if (!parcelId || packingListItemId !== null || quantity !== null || reason !== null) {
      return { ok: false, error: 'missing_command_value' }
    }
  } else if (command === 'REOPEN_PARCEL') {
    if (!parcelId || packingListItemId !== null || quantity !== null || !reason) {
      return { ok: false, error: 'missing_command_value' }
    }
  }

  return {
    ok: true,
    value: {
      schema: SCANNER_PARCEL_SCHEMA,
      operationId: input.operationId.toLowerCase(),
      command,
      packingId,
      bookingId,
      reservationId,
      deviceId,
      occurredAt: new Date(occurredAt).toISOString(),
      parcelId,
      packingListItemId,
      quantity: quantity as number | null,
      reason,
    },
  }
}

export async function scannerParcelFingerprint(request: ScannerParcelRequest): Promise<string> {
  const canonical = JSON.stringify([
    request.schema,
    request.operationId,
    request.command,
    request.packingId,
    request.bookingId,
    request.reservationId,
    request.deviceId,
    request.occurredAt,
    request.parcelId,
    request.packingListItemId,
    request.quantity,
    request.reason,
  ])
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
