import { buildSingleBookingEnvelope } from './singleBookingResult.ts';

/** Caller must provide a tenant-validated canonical row or cancellation tombstone. */
export async function recordCancellationNotice(supabase: any, input: {
  bookingId: string; organizationId: string; sourceUpdatedAt: string | null;
  sourceVersion: number | null; reservationToken?: string | null;
}) {
  const { data, error } = await supabase.rpc('record_booking_cancellation_notice_atomic', {
    p_booking_id: input.bookingId, p_organization_id: input.organizationId,
    p_source_status: 'CANCELLED', p_source_updated_at: input.sourceUpdatedAt,
    p_source_version: input.sourceVersion, p_reservation_token: input.reservationToken ?? null,
    p_reason: 'verified_canonical_cancellation_notice',
  });
  const applied = !error && data?.success === true && ['cancelled', 'already_cancelled'].includes(data?.outcome);
  return buildSingleBookingEnvelope({
    bookingId: input.bookingId, organizationId: input.organizationId,
    outcome: applied ? (data.outcome === 'already_cancelled' ? 'already_current' : 'applied') : 'failed',
    error: applied ? null : error?.message ?? data?.outcome ?? 'cancellation_notice_failed',
    results: { commercial_status: applied ? 'CANCELLED' : null,
      operational_cleanup_applied: false, action_required: applied,
      packing_preserved: data?.mutations?.packing_preserved ?? null },
  });
}
