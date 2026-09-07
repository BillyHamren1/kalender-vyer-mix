import { describe, expect, it } from 'vitest';
import {
  BOOKING_SYNC_PRIORITY,
  bookingSyncPriority,
  normalizeBookingSyncEvent,
  shouldReplaceQueuedEvent,
} from '../../supabase/functions/_shared/bookingSyncPriority';

describe('Booking -> Planning queue priority', () => {
  it('normalizes legacy underscore event names', () => {
    expect(normalizeBookingSyncEvent('BOOKING_CONFIRMED')).toBe('booking.confirmed');
  });

  it('ranks status transitions above routine synchronization', () => {
    expect(bookingSyncPriority('booking.confirmed')).toBe(BOOKING_SYNC_PRIORITY.critical);
    expect(bookingSyncPriority('booking.cancelled')).toBe(BOOKING_SYNC_PRIORITY.critical);
    expect(bookingSyncPriority('booking.updated')).toBeGreaterThan(
      bookingSyncPriority('booking.incremental'),
    );
  });

  it('promotes an incremental job when confirmation arrives', () => {
    expect(shouldReplaceQueuedEvent('booking.incremental', 'booking.confirmed')).toBe(true);
    expect(shouldReplaceQueuedEvent('booking.confirmed', 'booking.incremental')).toBe(false);
  });

  it('keeps the latest event hint between equally critical transitions', () => {
    expect(shouldReplaceQueuedEvent('booking.confirmed', 'booking.cancelled')).toBe(true);
  });
});
