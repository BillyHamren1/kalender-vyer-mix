import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLiveBookingById, fetchLiveBookingRead } from './liveBookingService';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('@/lib/booking/canonicalBooking', () => ({
  mapCanonicalBookingToPlanning: (value: unknown) => value,
  applyPlanningLocalFields: (value: unknown) => value,
  toCanonicalBookingFields: (value: unknown) => value,
}));
vi.mock('@/services/time/timeWorkerSync', () => ({ notifyTimeWorkerAssignments: vi.fn() }));

describe('live Booking service cancellation result', () => {
  afterEach(() => vi.clearAllMocks());
  it('returns a matched typed cancellation but preserves legacy Booking caller errors', async () => {
    mocks.invoke.mockResolvedValue({ data: { outcome: 'cancelled', booking_id: 'booking' }, error: null });
    expect(await fetchLiveBookingRead('booking')).toEqual({ outcome: 'cancelled', booking_id: 'booking' });
    await expect(fetchLiveBookingById('booking')).rejects.toThrow('booking_cancelled_in_source');
  });
  it('rejects a cancellation result for a different booking', async () => {
    mocks.invoke.mockResolvedValue({ data: { outcome: 'cancelled', booking_id: 'other' }, error: null });
    await expect(fetchLiveBookingRead('booking')).rejects.toThrow('booking_source_invalid_response');
  });
  it('keeps source and invocation errors as failures', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Unauthorized' } });
    await expect(fetchLiveBookingRead('booking')).rejects.toThrow('Unauthorized');
    mocks.invoke.mockResolvedValueOnce({ data: { error: 'booking_not_found_in_source' }, error: null });
    await expect(fetchLiveBookingRead('booking')).rejects.toThrow('booking_not_found_in_source');
  });
  it('preserves available Booking reads', async () => {
    mocks.invoke.mockResolvedValue({ data: { booking: { id: 'booking', products: [] }, planning_local: null }, error: null });
    expect(await fetchLiveBookingById('booking')).toEqual({ id: 'booking', products: [] });
  });
});
