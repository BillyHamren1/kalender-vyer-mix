import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBookingUpdatesBaseline,
  __resetBookingUpdatesBaselineForTests,
} from '@/lib/bookingUpdatesBaseline';

describe('bookingUpdatesBaseline', () => {
  beforeEach(() => {
    __resetBookingUpdatesBaselineForTests();
  });

  it('sätter baseline till nu vid första anropet', () => {
    const before = Date.now();
    const baseline = getBookingUpdatesBaseline();
    const after = Date.now();
    expect(baseline).toBeGreaterThanOrEqual(before);
    expect(baseline).toBeLessThanOrEqual(after);
  });

  it('returnerar samma baseline vid efterföljande anrop', () => {
    const first = getBookingUpdatesBaseline();
    const second = getBookingUpdatesBaseline();
    const third = getBookingUpdatesBaseline();
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('filtrerar bort uppdateringar som skedde innan baseline', () => {
    const baseline = getBookingUpdatesBaseline();
    const updates = [
      { booking_id: 'a', last_change_at: new Date(baseline - 60_000).toISOString() }, // 1 min före baseline
      { booking_id: 'b', last_change_at: new Date(baseline - 1).toISOString() },       // precis före
      { booking_id: 'c', last_change_at: new Date(baseline + 1000).toISOString() },    // efter baseline
      { booking_id: 'd', last_change_at: new Date(baseline + 3600_000).toISOString() },// 1h efter
    ];

    const visible = updates.filter((u) => {
      const t = new Date(u.last_change_at).getTime();
      return t > baseline;
    });

    expect(visible.map((u) => u.booking_id)).toEqual(['c', 'd']);
  });

  it('släpper igenom uppdateringar som sker EFTER baseline', () => {
    const baseline = getBookingUpdatesBaseline();
    const futureChange = new Date(baseline + 10_000).toISOString();
    expect(new Date(futureChange).getTime() > baseline).toBe(true);
  });
});
