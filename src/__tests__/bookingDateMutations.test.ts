import { describe, it, expect } from 'vitest';
import {
  buildAddDatePayload,
  buildRemoveDatePayload,
  buildEditDatePayload,
} from '@/lib/booking/bookingDateMutations';
import {
  toCanonicalBookingFields,
  EVENT_TIME_UNSUPPORTED_MESSAGE,
} from '@/lib/booking/canonicalBooking';

describe('booking date mutations (single source)', () => {
  it('add bevarar befintliga datum och skickar hela arrayen', () => {
    const { dates, payload } = buildAddDatePayload('rig', ['2026-09-01', '2026-09-02'], '2026-09-03');
    expect(dates).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
    expect(payload).toEqual({ rig_up_dates: ['2026-09-01', '2026-09-02', '2026-09-03'] });
    expect(toCanonicalBookingFields(payload)).toEqual({
      rig_up_dates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    });
  });

  it('remove skickar hela den kvarvarande listan', () => {
    const { dates, payload } = buildRemoveDatePayload('event', ['2026-09-01', '2026-09-02'], '2026-09-01');
    expect(dates).toEqual(['2026-09-02']);
    expect(toCanonicalBookingFields(payload)).toEqual({ event_dates: ['2026-09-02'] });
  });

  it('riggtid mappas till "HH:mm - HH:mm"', () => {
    const { payload } = buildEditDatePayload('rig', ['2026-09-01'], '2026-09-01', '2026-09-04', '08:00', '12:00');
    expect(payload.rig_start_time).toBe('08:00');
    expect(payload.rig_end_time).toBe('12:00');
    const canonical = toCanonicalBookingFields(payload);
    expect(canonical.rig_up_time).toBe('08:00 - 12:00');
    expect(canonical.rig_up_dates).toEqual(['2026-09-04']);
    expect(JSON.stringify(canonical)).not.toContain('T08:00:00Z');
  });

  it('rivtid mappas till rig_down_time', () => {
    const { payload } = buildEditDatePayload('rigDown', ['2026-09-05'], '2026-09-05', '2026-09-05', '16:00', '18:30');
    expect(toCanonicalBookingFields(payload).rig_down_time).toBe('16:00 - 18:30');
  });

  it('eventtid avvisas innan någon skrivning eller state-ändring', () => {
    expect(() =>
      buildEditDatePayload('event', ['2026-09-03'], '2026-09-03', '2026-09-04', '10:00', '14:00'),
    ).toThrowError(EVENT_TIME_UNSUPPORTED_MESSAGE);
  });

  it('eventdatum får ändras utan tid', () => {
    const { payload } = buildEditDatePayload('event', ['2026-09-03'], '2026-09-03', '2026-09-04', '', '');
    expect(payload).toEqual({ event_dates: ['2026-09-04'] });
  });
});
