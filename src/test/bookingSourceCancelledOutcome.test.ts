import { describe, expect, it } from 'vitest';
import { readCancelledOutcome } from '../../supabase/functions/booking-source-read/cancelledOutcome';

const fixture = () => ({ success: true, found: false, reason: 'cancelled', destructive_safe: true, booking_id: 'booking', organization_id: 'org',
  tombstone: { booking_id: 'booking', organization_id: 'org', source_status: 'CANCELLED', source_updated_at: '2026-11-08T17:03:56Z' } });

describe('canonical cancellation read outcome', () => {
  it('returns only the bounded outcome from a matched canonical tombstone', () => {
    expect(readCancelledOutcome({ ...fixture(), private_payload: 'not returned' }, 'booking', 'org'))
      .toEqual({ outcome: 'cancelled', booking_id: 'booking' });
  });
  it.each(['booking_id', 'organization_id', 'source_status', 'source_updated_at'])(
    'rejects a mismatched or invalid tombstone %s', (field) => {
      const input = fixture();
      (input.tombstone as Record<string, string>)[field] = 'wrong';
      expect(readCancelledOutcome(input, 'booking', 'org')).toBeNull();
    });
  it.each([
    { ...fixture(), booking_id: 'other' }, { ...fixture(), organization_id: 'other' },
    { ...fixture(), found: true }, { ...fixture(), success: false },
    { ...fixture(), destructive_safe: false },
    { ...fixture(), reason: 'not_found' }, { ...fixture(), reason: 'organization_mismatch' },
    { ...fixture(), tombstone: null }, null,
  ])('does not reinterpret other failures as cancellation', (input) => {
    expect(readCancelledOutcome(input, 'booking', 'org')).toBeNull();
  });
});
