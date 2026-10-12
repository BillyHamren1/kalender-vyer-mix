/** Pure classification decision after session-scoped reads. No external calls. */
export function commercialCloseDecision(
  requestedBookingId: unknown,
  actorOrganizationId: unknown,
  booking: { id?: unknown; organization_id?: unknown; is_internal?: unknown; internal_type?: unknown } | null,
): { allowed: true } | { allowed: false; code: string; status: number } {
  if (typeof requestedBookingId !== 'string' || !requestedBookingId.length || requestedBookingId.length > 200) {
    return { allowed: false, code: 'invalid_booking_id', status: 400 };
  }
  if (typeof actorOrganizationId !== 'string' || !actorOrganizationId || !booking
    || booking.id !== requestedBookingId || booking.organization_id !== actorOrganizationId) {
    return { allowed: false, code: 'booking_not_available', status: 403 };
  }
  // Unknown classification is not evidence of a commercial booking.
  if (booking.is_internal !== false || booking.internal_type != null) {
    return { allowed: false, code: 'internal_booking_commercial_action_forbidden', status: 409 };
  }
  return { allowed: true };
}
