export const TIME_BUNDLE_SCANNER_SCHEMA = 'time-bundle-scanner-command.v1' as const
export const BUNDLE_SCANNER_RECEIPT_SCHEMA = 'bundle-scanner-command-receipt.v1' as const

export const TIME_BUNDLE_SCANNER_COMMANDS = [
  'PACK_INSTANCE',
  'UNPACK_INSTANCE',
  'PACK_QUANTITY',
  'UNPACK_QUANTITY',
] as const

export type TimeBundleScannerCommand = (typeof TIME_BUNDLE_SCANNER_COMMANDS)[number]

/** Minsta gemensamma domänkuvert som Bundles gateway faktiskt använder. */
export interface BundleScannerGatewayRequest {
  readonly operationId: string
  readonly command: TimeBundleScannerCommand
  readonly organizationId: string
  readonly reservationId: string | null
  readonly bookingNumber: string
  readonly reservationLineId: string | null
  readonly itemTypeId: string | null
  readonly itemInstanceId: string | null
  readonly quantity: number
  readonly packingSessionId: string | null
  readonly performedBy: string | null
  readonly performedByLabel: string | null
  readonly deviceId: string | null
  readonly scanSource: 'time_app' | 'eventflow_scanner'
  readonly scanValue: string
  readonly occurredAt: string
}

export interface TimeBundleScannerRequest extends BundleScannerGatewayRequest {
  readonly schema: typeof TIME_BUNDLE_SCANNER_SCHEMA
  /** Stable Time idempotency key. Bundle derives its UUID ledger key from this value. */
  readonly operationId: string
  readonly command: TimeBundleScannerCommand
  readonly organizationId: string
  readonly reservationId: string | null
  readonly bookingNumber: string
  readonly reservationLineId: string | null
  readonly itemTypeId: string | null
  readonly itemInstanceId: string | null
  readonly quantity: number
  readonly packingSessionId: string | null
  readonly performedBy: string | null
  readonly performedByLabel: string | null
  readonly deviceId: string | null
  readonly scanSource: 'time_app'
  readonly scanValue: string
  readonly occurredAt: string
  readonly metadata: {
    readonly timeScanEventId: string
    readonly timeReceiptId: string
    readonly timeAssignmentId: string
    readonly timeSnapshotHash: string
  }
}

export interface BundleScannerReceipt {
  readonly schema: typeof BUNDLE_SCANNER_RECEIPT_SCHEMA
  readonly operationId: string
  readonly bundleOperationId: string
  readonly status: 'COMMITTED' | 'ALREADY_COMMITTED' | 'REJECTED'
  readonly command: TimeBundleScannerCommand
  readonly canonicalIdentity: {
    readonly organizationId: string | null
    readonly reservationId: string | null
    readonly bookingNumber: string | null
    readonly reservationLineId: string | null
    readonly itemTypeId: string | null
  }
  readonly authoritativePackedState: {
    readonly packedQuantity: number | null
    readonly requiredQuantity: number | null
    readonly remainingQuantity: number | null
  }
  readonly itemInstance: { readonly itemInstanceId: string; readonly status: string | null } | null
  readonly reason: string | null
  readonly reasonDetail: string | null
  readonly serverTimestamp: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_RE = /^[0-9a-f]{64}$/i
const OPERATION_RE = /^scan_[A-Za-z0-9-]{8,72}$/
const RECEIPT_RE = /^wcr_[A-Za-z0-9_-]{32,160}$/

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const string = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null

const nullableUuid = (value: unknown) => value === null || value === undefined
  ? null
  : typeof value === 'string' && UUID_RE.test(value) ? value.toLowerCase() : undefined

export type ParseTimeBundleScannerRequest =
  | { readonly ok: true; readonly value: TimeBundleScannerRequest }
  | { readonly ok: false; readonly error: string }

export function parseTimeBundleScannerRequest(input: unknown): ParseTimeBundleScannerRequest {
  if (!isObject(input)) return { ok: false, error: 'invalid_body' }
  const allowed = new Set([
    'schema', 'operationId', 'command', 'organizationId', 'reservationId', 'bookingNumber',
    'reservationLineId', 'itemTypeId', 'itemInstanceId', 'quantity', 'packingSessionId',
    'performedBy', 'performedByLabel', 'deviceId', 'scanSource', 'scanValue', 'occurredAt', 'metadata',
  ])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { ok: false, error: 'unexpected_field' }
  if (input.schema !== TIME_BUNDLE_SCANNER_SCHEMA) return { ok: false, error: 'unsupported_schema' }
  if (typeof input.operationId !== 'string' || !OPERATION_RE.test(input.operationId)) {
    return { ok: false, error: 'invalid_operation_id' }
  }
  if (!TIME_BUNDLE_SCANNER_COMMANDS.includes(input.command as TimeBundleScannerCommand)) {
    return { ok: false, error: 'invalid_command' }
  }
  if (input.scanSource !== 'time_app') return { ok: false, error: 'invalid_scan_source' }
  if (typeof input.organizationId !== 'string' || !UUID_RE.test(input.organizationId)) {
    return { ok: false, error: 'invalid_organization' }
  }
  const bookingNumber = string(input.bookingNumber, 128)
  const scanValue = string(input.scanValue, 512)
  if (!bookingNumber || !scanValue) return { ok: false, error: 'missing_booking_or_scan' }
  const occurredAt = string(input.occurredAt, 40)
  if (!occurredAt || Number.isNaN(Date.parse(occurredAt))) return { ok: false, error: 'invalid_occurred_at' }
  const reservationId = nullableUuid(input.reservationId)
  const reservationLineId = nullableUuid(input.reservationLineId)
  const itemTypeId = nullableUuid(input.itemTypeId)
  const itemInstanceId = nullableUuid(input.itemInstanceId)
  const packingSessionId = nullableUuid(input.packingSessionId)
  const performedBy = nullableUuid(input.performedBy)
  if ([reservationId, reservationLineId, itemTypeId, itemInstanceId, packingSessionId, performedBy].includes(undefined)) {
    return { ok: false, error: 'invalid_canonical_id' }
  }
  const quantity = input.quantity === undefined ? 1 : input.quantity
  if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    return { ok: false, error: 'invalid_quantity' }
  }
  if (!isObject(input.metadata)) return { ok: false, error: 'invalid_metadata' }
  const metadataAllowed = new Set(['timeScanEventId', 'timeReceiptId', 'timeAssignmentId', 'timeSnapshotHash'])
  if (Object.keys(input.metadata).some((key) => !metadataAllowed.has(key))) return { ok: false, error: 'unexpected_metadata' }
  const timeScanEventId = string(input.metadata.timeScanEventId, 128)
  const timeReceiptId = string(input.metadata.timeReceiptId, 192)
  const timeAssignmentId = string(input.metadata.timeAssignmentId, 192)
  const timeSnapshotHash = string(input.metadata.timeSnapshotHash, 64)
  if (!timeScanEventId || !timeReceiptId || !timeAssignmentId || !timeSnapshotHash ||
      !RECEIPT_RE.test(timeReceiptId) || !SHA256_RE.test(timeSnapshotHash)) {
    return { ok: false, error: 'invalid_time_lineage' }
  }
  const instanceCommand = input.command === 'PACK_INSTANCE' || input.command === 'UNPACK_INSTANCE'
  if (!instanceCommand && !itemTypeId) return { ok: false, error: 'quantity_requires_item_type' }

  return {
    ok: true,
    value: {
      schema: TIME_BUNDLE_SCANNER_SCHEMA,
      operationId: input.operationId,
      command: input.command as TimeBundleScannerCommand,
      organizationId: input.organizationId.toLowerCase(),
      reservationId: reservationId as string | null,
      bookingNumber,
      reservationLineId: reservationLineId as string | null,
      itemTypeId: itemTypeId as string | null,
      itemInstanceId: itemInstanceId as string | null,
      quantity,
      packingSessionId: packingSessionId as string | null,
      performedBy: performedBy as string | null,
      performedByLabel: typeof input.performedByLabel === 'string' ? input.performedByLabel.slice(0, 160) : null,
      deviceId: typeof input.deviceId === 'string' ? input.deviceId.slice(0, 160) : null,
      scanSource: 'time_app',
      scanValue,
      occurredAt: new Date(occurredAt).toISOString(),
      metadata: { timeScanEventId, timeReceiptId, timeAssignmentId, timeSnapshotHash: timeSnapshotHash.toLowerCase() },
    },
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(value: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

/** Deterministic, source-separated key: exact replay reaches the same Bundle ledger row. */
export async function bundleOperationId(
  operationId: string,
  source: BundleScannerGatewayRequest['scanSource'] = 'time_app',
): Promise<string> {
  const namespace = source === 'time_app' ? 'eventflow-time' : 'eventflow-scanner'
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${namespace}:${operationId}`)))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = hex(bytes.slice(0, 16))
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))))
}

export const TIME_SIGNATURE_MAX_SKEW_MS = 300_000
export const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/

/** Signed message: `${timestamp}.${nonce}.${rawBody}` — body bytes exactly as sent. */
export const timeSignatureMessage = (timestamp: string, nonce: string, rawBody: string) => `${timestamp}.${nonce}.${rawBody}`

export async function signTimeRequest(secret: string, timestamp: string, nonce: string, rawBody: string): Promise<string> {
  return `v1=${await hmacSha256Hex(secret, timeSignatureMessage(timestamp, nonce, rawBody))}`
}

export async function verifyTimeSignature(input: {
  readonly secret: string
  readonly rawBody: string
  readonly timestamp: string | null
  readonly nonce: string | null
  readonly signature: string | null
  readonly nowMs?: number
  readonly maximumSkewMs?: number
}): Promise<boolean> {
  if (!input.secret || !input.timestamp || !input.signature || !input.nonce) return false
  if (!/^\d{13}$/.test(input.timestamp) || !/^v1=[0-9a-f]{64}$/i.test(input.signature) || !NONCE_RE.test(input.nonce)) return false
  const sentAt = Number(input.timestamp)
  if (!Number.isSafeInteger(sentAt) || Math.abs((input.nowMs ?? Date.now()) - sentAt) > (input.maximumSkewMs ?? TIME_SIGNATURE_MAX_SKEW_MS)) return false
  const expected = await signTimeRequest(input.secret, input.timestamp, input.nonce, input.rawBody)
  if (expected.length !== input.signature.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ input.signature.charCodeAt(index)
  }
  return difference === 0
}

/** Stable JSON (sorted keys) so the same logical request always hashes identically. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Canonical payload hash for the idempotency ledger (whole parsed request). */
export async function canonicalPayloadHash(request: unknown): Promise<string> {
  return sha256Hex(canonicalJson(request))
}

/** Rejection reasons emitted by Bundle. Stable identifiers for the Time UI. */
export const BUNDLE_SCANNER_REJECTION_REASONS = [
  'unsupported_command',
  'idempotency_conflict',
  'wrong_booking',
  'reservation_mismatch',
  'instance_not_resolved',
  'instance_mismatch',
  'item_type_mismatch',
  'item_not_on_packlist',
  'quota_full',
  'already_packed',
  'not_packed',
  'instance_not_available',
  'bundle_rejected',
] as const
export type BundleScannerRejectionReason = (typeof BUNDLE_SCANNER_REJECTION_REASONS)[number]
