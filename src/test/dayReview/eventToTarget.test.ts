/**
 * Verklig unit-test av `eventToTarget` — den enskilda hetaste regressionsrisken
 * (review-flödet bröts tidigare för att target_kind bara fanns i metadata).
 */
import { describe, it, expect } from 'vitest';
import { eventToTarget } from '@/hooks/useDayReviewActions';

describe('eventToTarget', () => {
  it('läser primärt från top-level target_type/target_id', () => {
    const t = eventToTarget({
      event_type: 'arrival',
      target_label: 'Lager Stockholm',
      target_type: 'location',
      target_id: 'loc-1',
    });
    expect(t).toEqual({
      kind: 'location',
      locationId: 'loc-1',
      name: 'Lager Stockholm',
      createsTimeReport: true,
    });
  });

  it('faller tillbaka på metadata.target_kind/target_id', () => {
    const t = eventToTarget({
      event_type: 'arrival',
      target_label: 'Bygge X',
      metadata: { target_kind: 'project', target_id: 'lp-9' },
    } as any);
    expect(t).toEqual({ kind: 'project', largeProjectId: 'lp-9', name: 'Bygge X' });
  });

  it('mappar booking korrekt', () => {
    const t = eventToTarget({
      event_type: 'arrival',
      target_label: 'Acme AB',
      target_type: 'booking',
      target_id: 'bk-7',
    });
    expect(t).toEqual({ kind: 'booking', bookingId: 'bk-7', client: 'Acme AB' });
  });

  it('returnerar null om både kolumn och metadata saknas', () => {
    const t = eventToTarget({
      event_type: 'arrival',
      target_label: null,
    });
    expect(t).toBeNull();
  });

  it('returnerar null vid okänd target_type', () => {
    const t = eventToTarget({
      event_type: 'arrival',
      target_label: 'X',
      target_type: 'spaceship',
      target_id: 'x-1',
    });
    expect(t).toBeNull();
  });
});
