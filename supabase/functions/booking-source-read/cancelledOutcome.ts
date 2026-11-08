export interface CancelledBookingOutcome {
  outcome: 'cancelled';
  booking_id: string;
}

/** Only a tenant-matched, revision-bearing Booking tombstone proves cancellation. */
export function readCancelledOutcome(
  payload: unknown,
  bookingId: string,
  organizationId: string,
): CancelledBookingOutcome | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const tombstone = value.tombstone as Record<string, unknown> | null;
  if (value.success !== true || value.found !== false || value.reason !== 'cancelled'
    || value.destructive_safe !== true
    || value.booking_id !== bookingId || value.organization_id !== organizationId
    || !tombstone || typeof tombstone !== 'object'
    || tombstone.booking_id !== bookingId || tombstone.organization_id !== organizationId
    || tombstone.source_status !== 'CANCELLED'
    || typeof tombstone.source_updated_at !== 'string'
    || !tombstone.source_updated_at.trim()
    || !Number.isFinite(Date.parse(tombstone.source_updated_at))) return null;
  return { outcome: 'cancelled', booking_id: bookingId };
}
