// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_WORK_REFERENCE_V1 as schema, EQUIPMENT_RECEIPT_BINDING_V1 as receiptSchema, parseEquipmentWorkReferenceV1, matchesEquipmentReceiptBindingV1 } from '../../../supabase/functions/_shared/equipmentWorkReferenceV1';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const project = { schema, kind: 'project', source_system: 'operations', source_organization_id: id(1), source_version: 'owner-revision-7', project_id: id(2) };
const booking = { schema, kind: 'booking', source_system: 'booking', source_organization_id: id(1), source_version: 'owner-revision-7', booking_id: id(2) };
const outbound = { schema: receiptSchema, direction: 'outbound', work_reference: project, organization_id: id(3), actor_id: id(4), reservation_id: id(5), operation_id: id(6), command_fingerprint: 'canonical-envelope-fingerprint', session_id: id(7) };
const returned = { ...outbound, direction: 'return', return_order_id: id(8) };
describe('dormant versioned equipment work reference', () => {
  it('keeps source and mapped WMS tenants separate and preserves exact owner identity', () => {
    expect(parseEquipmentWorkReferenceV1(project)).toEqual(project);
    expect(parseEquipmentWorkReferenceV1(booking)).toEqual(booking);
    expect(matchesEquipmentReceiptBindingV1(outbound, outbound)).toBe(true);
    expect(matchesEquipmentReceiptBindingV1(returned, returned)).toBe(true);
  });
  it.each([
    { ...project, booking_id: id(2) }, { ...project, project_id: undefined },
    { ...project, source_system: 'booking' }, { ...booking, source_system: 'operations' },
    { ...project, schema: 'equipment_work_reference.v2' }, { ...project, source_version: '' },
    { ...project, source_organization_id: 'org-name' }, { ...project, project_id: ` ${id(2)}` },
  ])('rejects mixed, incomplete, unknown or guessed identity %#', value => {
    expect(() => parseEquipmentWorkReferenceV1(value)).toThrow();
  });
  it.each(['0000123', 'BK-2609-0007', 'external:order/0042', ' 0000123 '])('preserves accepted opaque Booking ID %s exactly', bookingId => {
    const ref = { ...booking, booking_id: bookingId };
    expect(parseEquipmentWorkReferenceV1(ref)).toEqual(ref);
    const receipt = { ...outbound, work_reference: ref };
    expect(matchesEquipmentReceiptBindingV1(receipt, receipt)).toBe(true);
    expect(matchesEquipmentReceiptBindingV1({ ...receipt, work_reference: { ...ref, booking_id: '123' } }, receipt)).toBe(false);
  });
  it.each(['', 'x'.repeat(201), 123, null])('rejects values outside the existing Booking ID string contract %#', bookingId => {
    expect(() => parseEquipmentWorkReferenceV1({ ...booking, booking_id: bookingId })).toThrow();
  });
  it('retains existing opaque Scanner receipt IDs and operation length bounds', () => {
    const receipt = { ...returned, work_reference: { ...booking, booking_id: '0000123' }, actor_id: 'actor-07', reservation_id: 'reservation-0042', operation_id: 'operation-0009', session_id: 'session-0005', return_order_id: 'return-0002' };
    expect(matchesEquipmentReceiptBindingV1(receipt, receipt)).toBe(true);
    expect(matchesEquipmentReceiptBindingV1({ ...receipt, operation_id: 'short' }, receipt)).toBe(false);
    expect(matchesEquipmentReceiptBindingV1({ ...receipt, reservation_id: 'reservation-42' }, receipt)).toBe(false);
  });
  it('rejects same UUID represented as a booking instead of a project', () => {
    expect(matchesEquipmentReceiptBindingV1({ ...outbound, work_reference: booking }, outbound)).toBe(false);
  });
  it.each(['organization_id', 'actor_id', 'reservation_id', 'operation_id', 'session_id'] as const)('rejects wrong %s in both outbound and return receipts', field => {
    for (const expected of [outbound, returned]) expect(matchesEquipmentReceiptBindingV1({ ...expected, [field]: id(99) }, expected)).toBe(false);
  });
  it.each(['source_organization_id', 'project_id', 'source_version'] as const)('rejects mismatched source provenance %s', field => {
    expect(matchesEquipmentReceiptBindingV1({ ...returned, work_reference: { ...project, [field]: field === 'source_version' ? 'revision-8' : id(99) } }, returned)).toBe(false);
  });
  it('binds return order, direction and exact command fingerprint', () => {
    expect(matchesEquipmentReceiptBindingV1({ ...returned, return_order_id: id(99) }, returned)).toBe(false);
    expect(matchesEquipmentReceiptBindingV1(outbound, returned)).toBe(false);
    expect(matchesEquipmentReceiptBindingV1({ ...outbound, command_fingerprint: 'other' }, outbound)).toBe(false);
    expect(matchesEquipmentReceiptBindingV1({ ...outbound, session_id: null }, outbound)).toBe(false);
  });
  it('does not silently upgrade legacy booking-only receipts or accept result flags as identity proof', () => {
    expect(matchesEquipmentReceiptBindingV1({ booking_id: id(2), reservation_id: id(5) }, outbound)).toBe(false);
    expect(matchesEquipmentReceiptBindingV1({ ...outbound, outcome: 'APPLIED' }, outbound)).toBe(false);
  });
  it('ignores JSON field order while retaining strict identity', () => {
    expect(matchesEquipmentReceiptBindingV1(Object.fromEntries(Object.entries(returned).reverse()), returned)).toBe(true);
  });
});
