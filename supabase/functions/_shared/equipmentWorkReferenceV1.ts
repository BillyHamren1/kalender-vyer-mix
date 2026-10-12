/**
 * DORMANT contract proposal. No endpoint imports this module.
 * Identity binding only: never authorizes a request or proves a stock mutation.
 * Existing Booking/scanner contracts remain unchanged until all owners negotiate v1.
 */
export const EQUIPMENT_WORK_REFERENCE_V1 = 'equipment_work_reference.v1' as const;
export const EQUIPMENT_RECEIPT_BINDING_V1 = 'equipment_receipt_binding.v1' as const;

type WorkReferenceBase = {
  schema: typeof EQUIPMENT_WORK_REFERENCE_V1;
  /** Source tenant, resolved server-side. May differ from the mapped WMS tenant. */
  source_organization_id: string;
  /** Owner-issued version, preserved exactly; never derived from local timestamps. */
  source_version: string;
};
export type EquipmentWorkReferenceV1 = WorkReferenceBase & (
  | { kind: 'booking'; source_system: 'booking'; booking_id: string }
  | { kind: 'project'; source_system: 'operations'; project_id: string }
);

export type EquipmentReceiptBindingV1 = {
  schema: typeof EQUIPMENT_RECEIPT_BINDING_V1;
  work_reference: EquipmentWorkReferenceV1;
  /** WMS tenant from an explicit authenticated source-to-WMS mapping. */
  organization_id: string;
  actor_id: string;
  reservation_id: string;
  operation_id: string;
  /** Envelope identity, not an authentication signature. */
  command_fingerprint: string;
  session_id: string | null;
} & (
  | { direction: 'outbound' }
  | { direction: 'return'; return_order_id: string }
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid equipment identity object');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new Error('Unexpected or missing equipment identity fields');
  }
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Invalid equipment identity UUID');
  return value;
}
/** Existing Scanner idSchema: exact string 1..200; operation ids 8..200.
 * Do not trim, parse numbers, remove leading zeros or impose UUIDs on owner IDs.
 */
function ownerId(value: unknown, minimumLength = 1): string {
  if (typeof value !== 'string' || value.length < minimumLength || value.length > 200) {
    throw new Error('Invalid equipment owner identity');
  }
  return value;
}
function opaque(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 512 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Invalid equipment identity version/fingerprint');
  }
  return value;
}
export function parseEquipmentWorkReferenceV1(value: unknown): EquipmentWorkReferenceV1 {
  const row = record(value);
  if (row.schema !== EQUIPMENT_WORK_REFERENCE_V1) throw new Error('Unsupported equipment work reference version');
  if (row.kind !== 'booking' && row.kind !== 'project') throw new Error('Unknown equipment work reference kind');
  const field = row.kind === 'booking' ? 'booking_id' : 'project_id';
  exactKeys(row, ['schema', 'kind', 'source_system', 'source_organization_id', 'source_version', field]);
  if (row.source_system !== (row.kind === 'booking' ? 'booking' : 'operations')) throw new Error('Equipment work reference owner mismatch');
  const base: WorkReferenceBase = { schema: EQUIPMENT_WORK_REFERENCE_V1, source_organization_id: id(row.source_organization_id), source_version: opaque(row.source_version) };
  return row.kind === 'booking'
    ? { ...base, kind: 'booking', source_system: 'booking', booking_id: ownerId(row.booking_id) }
    : { ...base, kind: 'project', source_system: 'operations', project_id: id(row.project_id) };
}
export function parseEquipmentReceiptBindingV1(value: unknown): EquipmentReceiptBindingV1 {
  const row = record(value);
  if (row.schema !== EQUIPMENT_RECEIPT_BINDING_V1) throw new Error('Unsupported equipment receipt binding version');
  if (row.direction !== 'outbound' && row.direction !== 'return') throw new Error('Unknown equipment direction');
  exactKeys(row, ['schema', 'direction', 'work_reference', 'organization_id', 'actor_id', 'reservation_id', 'operation_id', 'command_fingerprint', 'session_id', ...(row.direction === 'return' ? ['return_order_id'] : [])]);
  const base = { schema: EQUIPMENT_RECEIPT_BINDING_V1, work_reference: parseEquipmentWorkReferenceV1(row.work_reference),
    organization_id: id(row.organization_id), actor_id: ownerId(row.actor_id), reservation_id: ownerId(row.reservation_id),
    operation_id: ownerId(row.operation_id, 8), command_fingerprint: opaque(row.command_fingerprint),
    session_id: row.session_id === null ? null : ownerId(row.session_id) };
  return row.direction === 'return' ? { ...base, direction: 'return', return_order_id: ownerId(row.return_order_id) } : { ...base, direction: 'outbound' };
}
/**
 * Compare with a trusted server envelope. A true result says ONLY that identity
 * bindings match. Caller must still verify authentication, HTTP result, WMS
 * projection/revision progression, lifecycle, quantities and operation receipt.
 * Never use this predicate alone to emit APPLIED or REJECTED.
 */
export function matchesEquipmentReceiptBindingV1(receipt: unknown, expectedServerEnvelope: unknown): boolean {
  try {
    // Parsers construct a fixed key order; raw JSON ordering has no significance.
    return JSON.stringify(parseEquipmentReceiptBindingV1(receipt)) === JSON.stringify(parseEquipmentReceiptBindingV1(expectedServerEnvelope));
  } catch { return false; }
}
