/** Actual warehouse activities, shared by calendar filters and personnel planning.
 * Booking phases and legacy `other` projections are context, not open warehouse jobs.
 * This policy must never filter concrete warehouse_assignments: those retain their
 * own identity and remain visible even when linked to an older event type.
 */
export const WAREHOUSE_WORK_EVENT_TYPES = [
  'packing', 'delivery', 'return', 'inventory', 'unpacking', 'internal_task',
] as const;

export type WarehouseWorkEventType = typeof WAREHOUSE_WORK_EVENT_TYPES[number];

export function isWarehouseWorkEvent(event: { event_type?: string | null }): boolean {
  return WAREHOUSE_WORK_EVENT_TYPES.some(type => type === event.event_type);
}
