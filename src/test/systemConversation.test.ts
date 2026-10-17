// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { evaluateShortNotice as server } from '../../supabase/functions/_shared/shortNoticeBooking';
import { evaluateShortNotice as client } from '../lib/notifications/shortNoticeBooking';
import { notificationPartner, isSystemNotificationPartner, shortNoticeDedupeFilter } from '../../supabase/functions/_shared/systemConversation';

describe('Kortvarselregler', () => {
  const now = new Date('2026-10-17T12:10:00Z');
  for (const evaluate of [server, client]) {
    it('accepterar CONFIRMED idag och om sju dagar men inte igår eller dag åtta', () => {
      for (const [date, expected] of [['2026-10-16', false], ['2026-10-17', true], ['2026-10-24', true], ['2026-10-25', false]] as const) {
        expect(evaluate({ status: 'CONFIRMED', rigdaydate: date, now }).isShortNotice).toBe(expected);
      }
    });
    it.each(['OFFER', 'CANCELLED', 'COMPLETED', 'DRAFT', '', null, undefined])('nekar status %s', status => {
      expect(evaluate({ status, rigdaydate: '2026-10-17', now }).isShortNotice).toBe(false);
    });
  }
});
describe('Systemets samlade historik', () => {
  it('samlar olika bokningsavsändare men inte mänskliga avsändare', () => {
    expect(notificationPartner({ sender_id: 'short-notice:booking-a', sender_type: 'system' }, 'old-a')).toBe('system-short-notice');
    expect(notificationPartner({ sender_id: 'short-notice:booking-b', sender_type: 'system' }, 'old-b')).toBe('system-short-notice');
    expect(notificationPartner({ sender_id: 'short-notice:booking-a', sender_type: 'staff' }, 'staff-a')).toBe('staff-a');
  });
  it('behåller bokningsspecifik deduplicering trots stabil tråd', () => {
    expect(shortNoticeDedupeFilter('booking-a')).toContain('booking_id.eq.booking-a');
    expect(shortNoticeDedupeFilter('booking-a')).not.toBe(shortNoticeDedupeFilter('booking-b'));
    expect(() => shortNoticeDedupeFilter('bad,filter')).toThrow('invalid_booking_id');
    expect(isSystemNotificationPartner('system-short-notice')).toBe(true);
  });
});