// Sales "linked addition booking" contract (booking_group).
//
// Sales exports `booking_group: { root_booking_id, is_addition, addition_number }`
// and may also send flat `parent_booking_id` / `addition_number`. An addition
// is its own booking (own ID, own rows, own invoice) that operationally belongs
// to the SAME Operations project as its root. This module is pure: it only
// parses and validates. Root resolution happens tenant-scoped in the database
// (`attach_booking_addition`), never via global lookups or client project IDs.

export type BookingGroup =
  | { kind: 'none' }
  | { kind: 'addition'; rootBookingId: string; additionNumber: number | null };

export type BookingGroupParse =
  | { ok: true; group: BookingGroup }
  | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function cleanId(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'invalid';
  const v = value.trim();
  if (v === '') return null;
  return ID_RE.test(v) ? v : 'invalid';
}

function cleanNumber(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null) return null;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return 'invalid';
  return n;
}

export function parseBookingGroup(external: any): BookingGroupParse {
  const bookingId = cleanId(external?.id);
  const raw = external?.booking_group;
  const flatParent = cleanId(external?.parent_booking_id);
  const flatNumber = cleanNumber(external?.addition_number);

  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    return { ok: false, error: 'booking_group_malformed' };
  }
  if (flatParent === 'invalid' || flatNumber === 'invalid') {
    return { ok: false, error: 'booking_group_malformed' };
  }

  let root: string | null = flatParent;
  let number: number | null = flatNumber;
  let isAddition = flatParent !== null;

  if (raw) {
    if (raw.is_addition !== undefined && typeof raw.is_addition !== 'boolean') {
      return { ok: false, error: 'booking_group_malformed' };
    }
    const groupRoot = cleanId(raw.root_booking_id);
    const groupNumber = cleanNumber(raw.addition_number);
    if (groupRoot === 'invalid' || groupNumber === 'invalid') {
      return { ok: false, error: 'booking_group_malformed' };
    }
    if (raw.is_addition === true) {
      if (!groupRoot) return { ok: false, error: 'booking_group_missing_root' };
      if (root && root !== groupRoot) return { ok: false, error: 'booking_group_root_mismatch' };
      root = groupRoot;
      number = groupNumber ?? number;
      isAddition = true;
    } else {
      // Not an addition: a self-referencing root (or none) is fine; a flat
      // parent pointing elsewhere contradicts the group and is rejected.
      if (flatParent) return { ok: false, error: 'booking_group_root_mismatch' };
      if (groupRoot && bookingId && groupRoot !== bookingId) {
        return { ok: false, error: 'booking_group_root_mismatch' };
      }
      return { ok: true, group: { kind: 'none' } };
    }
  }

  if (!isAddition) return { ok: true, group: { kind: 'none' } };
  if (!root) return { ok: false, error: 'booking_group_missing_root' };
  if (bookingId === 'invalid' || !bookingId) return { ok: false, error: 'booking_group_malformed' };
  if (root === bookingId) return { ok: false, error: 'booking_group_self_parent' };
  return { ok: true, group: { kind: 'addition', rootBookingId: root, additionNumber: number } };
}

export type AttachOutcome =
  | 'attached' | 'already_attached' | 'linked_not_confirmed'
  | 'root_unavailable' | 'root_unassigned' | 'child_missing'
  | 'invalid_group' | 'parent_conflict' | 'root_is_addition'
  | 'explicit_assignment_conflict';

/** Map RPC outcome to an import result: error text (null = success) + retry. */
export function classifyAttachOutcome(res: any): { error: string | null; retryable: boolean } {
  const outcome = String(res?.outcome ?? 'unknown') as AttachOutcome;
  if (res?.ok === true) return { error: null, retryable: false };
  // root_unassigned stays a retryable failure: the sync job must not complete
  // until the addition is attached (queue retries; root assignment re-enqueues).
  const retryable = res?.retryable === true;
  return { error: `booking_addition_${outcome}`, retryable };
}
