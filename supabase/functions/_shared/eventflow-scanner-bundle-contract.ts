import {
  BUNDLE_SCANNER_RECEIPT_SCHEMA,
  hmacSha256Hex,
  NONCE_RE,
  TIME_SIGNATURE_MAX_SKEW_MS,
  type BundleScannerReceipt,
  type BundleScannerGatewayRequest,
} from './time-bundle-scanner-contract.ts'

export const EVENTFLOW_SCANNER_BUNDLE_SCHEMA = 'eventflow-scanner-bundle-command.v1' as const
export const EVENTFLOW_SCANNER_OPERATION_STATUS_SCHEMA = 'eventflow-scanner-bundle-operation-status.v1' as const
export const EVENTFLOW_SCANNER_COMMANDS = ['PACK_INSTANCE', 'UNPACK_INSTANCE'] as const

export interface EventFlowScannerBundleRequest extends BundleScannerGatewayRequest {
  readonly schema: typeof EVENTFLOW_SCANNER_BUNDLE_SCHEMA
  readonly command: (typeof EVENTFLOW_SCANNER_COMMANDS)[number]
  readonly organizationId: string
  readonly reservationId: string
  /** Stabilt Booking-id som Bundle lagrar i reservations.external_id. Aldrig kundnamn. */
  readonly bookingNumber: string
  readonly reservationLineId: string
  readonly itemTypeId: string
  readonly performedBy: string
  readonly deviceId: string
  readonly scanSource: 'eventflow_scanner'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OPERATION_RE = /^op-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_RE = /^[0-9a-f]{64}$/i
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null
const uuid = (value: unknown) => typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : null
const nullableUuid = (value: unknown) => value === null ? null : uuid(value)

export type ParseEventFlowScannerBundleRequest =
  | { readonly ok: true; readonly value: EventFlowScannerBundleRequest }
  | { readonly ok: false; readonly error: string }

export function parseEventFlowScannerBundleRequest(input: unknown): ParseEventFlowScannerBundleRequest {
  if (!isObject(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set([
    'schema', 'operationId', 'command', 'organizationId', 'reservationId', 'bookingNumber',
    'reservationLineId', 'itemTypeId', 'itemInstanceId', 'quantity', 'packingSessionId',
    'performedBy', 'performedByLabel', 'deviceId', 'scanSource', 'scanValue', 'occurredAt',
  ])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== EVENTFLOW_SCANNER_BUNDLE_SCHEMA) return { ok: false, error: 'unsupported_schema' }
  if (typeof input.operationId !== 'string' || !OPERATION_RE.test(input.operationId)) {
    return { ok: false, error: 'invalid_operation_id' }
  }
  if (!EVENTFLOW_SCANNER_COMMANDS.includes(input.command as EventFlowScannerBundleRequest['command'])) {
    return { ok: false, error: 'invalid_command' }
  }
  if (input.scanSource !== 'eventflow_scanner') return { ok: false, error: 'invalid_scan_source' }

  const organizationId = uuid(input.organizationId)
  const reservationId = uuid(input.reservationId)
  const reservationLineId = uuid(input.reservationLineId)
  const itemTypeId = uuid(input.itemTypeId)
  const itemInstanceId = nullableUuid(input.itemInstanceId)
  const packingSessionId = nullableUuid(input.packingSessionId)
  const performedBy = uuid(input.performedBy)
  if (!organizationId || !reservationId || !reservationLineId || !itemTypeId || !performedBy ||
      itemInstanceId === null && input.itemInstanceId !== null ||
      packingSessionId === null && input.packingSessionId !== null) {
    return { ok: false, error: 'invalid_canonical_id' }
  }
  const bookingNumber = text(input.bookingNumber, 128)
  const deviceId = text(input.deviceId, 160)
  const scanValue = text(input.scanValue, 512)
  const occurredAt = text(input.occurredAt, 40)
  if (!bookingNumber || !deviceId || !scanValue) return { ok: false, error: 'missing_required_value' }
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return { ok: false, error: 'invalid_occurred_at' }
  if (input.quantity !== 1) return { ok: false, error: 'instance_quantity_must_be_one' }

  return { ok: true, value: {
    schema: EVENTFLOW_SCANNER_BUNDLE_SCHEMA,
    operationId: input.operationId.toLowerCase(),
    command: input.command as EventFlowScannerBundleRequest['command'],
    organizationId,
    reservationId,
    bookingNumber,
    reservationLineId,
    itemTypeId,
    itemInstanceId,
    quantity: 1,
    packingSessionId,
    performedBy,
    performedByLabel: typeof input.performedByLabel === 'string' ? input.performedByLabel.slice(0, 160) : null,
    deviceId,
    scanSource: 'eventflow_scanner',
    scanValue,
    occurredAt: new Date(occurredAt).toISOString(),
  } }
}

export interface EventFlowScannerOperationStatusRequest {
  readonly schema: typeof EVENTFLOW_SCANNER_OPERATION_STATUS_SCHEMA
  readonly operationId: string
  readonly organizationId: string
  /** Hash of the exact parsed command payload. Prevents a caller from confusing two payloads. */
  readonly payloadFingerprint: string
}

export type ParseEventFlowScannerOperationStatusRequest =
  | { readonly ok: true; readonly value: EventFlowScannerOperationStatusRequest }
  | { readonly ok: false; readonly error: string }

export function parseEventFlowScannerOperationStatusRequest(
  input: unknown,
): ParseEventFlowScannerOperationStatusRequest {
  if (!isObject(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set(['schema', 'operationId', 'organizationId', 'payloadFingerprint'])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== EVENTFLOW_SCANNER_OPERATION_STATUS_SCHEMA) {
    return { ok: false, error: 'unsupported_schema' }
  }
  if (typeof input.operationId !== 'string' || !OPERATION_RE.test(input.operationId)) {
    return { ok: false, error: 'invalid_operation_id' }
  }
  const organizationId = uuid(input.organizationId)
  if (!organizationId) return { ok: false, error: 'invalid_organization_id' }
  if (typeof input.payloadFingerprint !== 'string' || !SHA256_RE.test(input.payloadFingerprint)) {
    return { ok: false, error: 'invalid_payload_fingerprint' }
  }
  return {
    ok: true,
    value: {
      schema: EVENTFLOW_SCANNER_OPERATION_STATUS_SCHEMA,
      operationId: input.operationId.toLowerCase(),
      organizationId,
      payloadFingerprint: input.payloadFingerprint.toLowerCase(),
    },
  }
}

export interface ScannerOperationLedgerRow {
  readonly payload_fingerprint: unknown
  readonly response: unknown
}

export type EventFlowScannerOperationStatus =
  | { readonly status: 'NOT_FOUND'; readonly receipt: null }
  | { readonly status: 'PENDING'; readonly receipt: null }
  | { readonly status: 'CONFLICT'; readonly receipt: null }
  | { readonly status: 'FINAL'; readonly receipt: BundleScannerReceipt }
  | { readonly status: 'INVALID_LEDGER'; readonly receipt: null }

function nonNegativeIntegerOrNull(value: unknown): boolean {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

/**
 * Validates the stored receipt before it can become recovery truth. A malformed,
 * cross-tenant or differently namespaced ledger row is never reported as final.
 */
export function resolveEventFlowScannerOperationStatus(input: {
  readonly request: EventFlowScannerOperationStatusRequest
  readonly bundleOperationId: string
  readonly ledgerRow: ScannerOperationLedgerRow | null
}): EventFlowScannerOperationStatus {
  const row = input.ledgerRow
  if (!row) return { status: 'NOT_FOUND', receipt: null }
  if (row.payload_fingerprint !== input.request.payloadFingerprint) {
    return { status: 'CONFLICT', receipt: null }
  }
  const receipt = isObject(row.response) ? row.response : null
  if (!receipt || Object.keys(receipt).length === 0) return { status: 'PENDING', receipt: null }
  const identity = isObject(receipt.canonicalIdentity) ? receipt.canonicalIdentity : null
  const packedState = isObject(receipt.authoritativePackedState) ? receipt.authoritativePackedState : null
  const itemInstance = receipt.itemInstance === null
    ? null
    : isObject(receipt.itemInstance) ? receipt.itemInstance : undefined
  const valid =
    receipt.schema === BUNDLE_SCANNER_RECEIPT_SCHEMA &&
    receipt.operationId === input.request.operationId &&
    receipt.bundleOperationId === input.bundleOperationId &&
    (receipt.status === 'COMMITTED' || receipt.status === 'REJECTED') &&
    EVENTFLOW_SCANNER_COMMANDS.includes(receipt.command as (typeof EVENTFLOW_SCANNER_COMMANDS)[number]) &&
    identity?.organizationId === input.request.organizationId &&
    typeof identity?.reservationId === 'string' && uuid(identity.reservationId) !== null &&
    typeof identity?.reservationLineId === 'string' && uuid(identity.reservationLineId) !== null &&
    typeof identity?.itemTypeId === 'string' && uuid(identity.itemTypeId) !== null &&
    typeof identity?.bookingNumber === 'string' && identity.bookingNumber.length > 0 &&
    packedState !== null &&
    nonNegativeIntegerOrNull(packedState.packedQuantity) &&
    nonNegativeIntegerOrNull(packedState.requiredQuantity) &&
    nonNegativeIntegerOrNull(packedState.remainingQuantity) &&
    itemInstance !== undefined &&
    (itemInstance === null ||
      (typeof itemInstance.itemInstanceId === 'string' && uuid(itemInstance.itemInstanceId) !== null)) &&
    (receipt.reason === null || typeof receipt.reason === 'string') &&
    (receipt.reasonDetail === null || typeof receipt.reasonDetail === 'string') &&
    typeof receipt.serverTimestamp === 'string' &&
    !Number.isNaN(Date.parse(receipt.serverTimestamp))
  if (!valid) return { status: 'INVALID_LEDGER', receipt: null }
  return { status: 'FINAL', receipt: receipt as unknown as BundleScannerReceipt }
}

export const scannerSignatureMessage = (timestamp: string, nonce: string, rawBody: string) =>
  `${timestamp}.${nonce}.${rawBody}`

export async function signScannerRequest(secret: string, timestamp: string, nonce: string, rawBody: string) {
  return `v1=${await hmacSha256Hex(secret, scannerSignatureMessage(timestamp, nonce, rawBody))}`
}

export async function verifyScannerSignature(input: {
  readonly secret: string
  readonly rawBody: string
  readonly timestamp: string | null
  readonly nonce: string | null
  readonly signature: string | null
  readonly nowMs?: number
}): Promise<boolean> {
  if (!input.secret || !input.timestamp || !input.signature || !input.nonce) return false
  if (!/^\d{13}$/.test(input.timestamp) || !/^v1=[0-9a-f]{64}$/i.test(input.signature) || !NONCE_RE.test(input.nonce)) return false
  const sentAt = Number(input.timestamp)
  if (!Number.isSafeInteger(sentAt) || Math.abs((input.nowMs ?? Date.now()) - sentAt) > TIME_SIGNATURE_MAX_SKEW_MS) return false
  const expected = await signScannerRequest(input.secret, input.timestamp, input.nonce, input.rawBody)
  if (expected.length !== input.signature.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index)
  }
  return difference === 0
}
