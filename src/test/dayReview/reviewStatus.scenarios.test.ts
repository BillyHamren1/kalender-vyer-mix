// @vitest-environment node
/**
 * Scenario-tester för dagavstämningsmodellen via oracle.
 * Täcker de 10 kraven från review-prompten.
 */
import { describe, it, expect } from 'vitest';
import {
  computeReview,
  type OracleEvent,
  type OracleTravel,
  type OracleWorkday,
} from './reviewStatus.oracle';

const dayIso = (h: number, m = 0) =>
  new Date(Date.UTC(2026, 3, 22, h, m)).toISOString();

const baseWorkday = (overrides: Partial<OracleWorkday> = {}): OracleWorkday => ({
  id: 'wd-1',
  started_at: dayIso(7),
  ended_at: null,
  review_status: 'draft',
  ...overrides,
});

const NOW = new Date(Date.UTC(2026, 3, 23, 9, 0)); // dagen efter, kl 09

describe('Day-review oracle — 10 scenarios', () => {
  it('1. Missad arrival ger needs_review', () => {
    const ev: OracleEvent = {
      happened_at: dayIso(7, 30),
      resolution_status: 'pending',
      stale_for_prompt: false,
      still_relevant_for_review: true,
    };
    const r = computeReview({ workday: baseWorkday(), events: [ev], travels: [], now: NOW });
    expect(r.status).toBe('needs_review');
    expect(r.reasons).toContain('open_assistant_events');
  });

  it('2. Event blir stale men finns kvar i review', () => {
    const ev: OracleEvent = {
      happened_at: dayIso(7, 30),
      resolution_status: 'pending',
      stale_for_prompt: true,
      still_relevant_for_review: true,
    };
    const r = computeReview({ workday: baseWorkday(), events: [ev], travels: [], now: NOW });
    expect(r.reasons).toContain('stale_review_events');
    expect(r.reasons).not.toContain('open_assistant_events');
  });

  it('3. Gårdagen kan öppnas nästa dag (missing_end)', () => {
    const r = computeReview({
      workday: baseWorkday({ ended_at: null }),
      events: [],
      travels: [],
      now: NOW,
    });
    expect(r.reasons).toContain('missing_end');
  });

  it('4. Dagen blir ready när luckor lösts', () => {
    const r = computeReview({
      workday: baseWorkday({ ended_at: dayIso(17) }),
      events: [],
      travels: [],
      now: NOW,
    });
    expect(r.status).toBe('ready');
    expect(r.reasons).toEqual([]);
  });

  it('5. Approved är absorberande', () => {
    const ev: OracleEvent = {
      happened_at: dayIso(7),
      resolution_status: 'pending',
      stale_for_prompt: false,
      still_relevant_for_review: true,
    };
    const r = computeReview({
      workday: baseWorkday({ review_status: 'approved', ended_at: dayIso(17) }),
      events: [ev],
      travels: [],
      now: NOW,
    });
    expect(r.status).toBe('approved');
  });

  it('6. Flera missade events ger missed_prompts_all_day', () => {
    const evs: OracleEvent[] = [7, 9, 11].map((h) => ({
      happened_at: dayIso(h),
      resolution_status: 'pending',
      stale_for_prompt: true,
      still_relevant_for_review: true,
    }));
    const r = computeReview({ workday: baseWorkday(), events: evs, travels: [], now: NOW });
    expect(r.reasons).toContain('missed_prompts_all_day');
  });

  it('7. Home-arrival utan avslut → workday saknar ended_at → flag', () => {
    const r = computeReview({
      workday: baseWorkday({ ended_at: null }),
      events: [
        {
          happened_at: dayIso(18),
          resolution_status: 'pending',
          stale_for_prompt: false,
          still_relevant_for_review: true,
        },
      ],
      travels: [],
      now: NOW,
    });
    expect(r.status).toBe('needs_review');
    expect(r.reasons).toContain('missing_end');
    expect(r.reasons).toContain('open_assistant_events');
  });

  it('8. Oklara resor flaggas', () => {
    const tr: OracleTravel = { started_at: dayIso(8), ended_at: null };
    const r = computeReview({ workday: baseWorkday(), events: [], travels: [tr], now: NOW });
    expect(r.reasons).toContain('unresolved_travel');
  });

  it('9. Lösta events försvinner ur review', () => {
    const ev: OracleEvent = {
      happened_at: dayIso(7),
      resolution_status: 'resolved',
      stale_for_prompt: true,
      still_relevant_for_review: false,
    };
    const r = computeReview({
      workday: baseWorkday({ ended_at: dayIso(17) }),
      events: [ev],
      travels: [],
      now: NOW,
    });
    expect(r.status).toBe('ready');
  });

  it('10. Data tappas inte: stale-event veckor senare ger fortfarande review-flagga', () => {
    const old: OracleEvent = {
      happened_at: dayIso(7, 30),
      resolution_status: 'pending',
      stale_for_prompt: true,
      still_relevant_for_review: true,
    };
    const farFuture = new Date(Date.UTC(2026, 4, 15, 12, 0));
    const r = computeReview({ workday: baseWorkday(), events: [old], travels: [], now: farFuture });
    expect(r.reasons).toContain('stale_review_events');
  });
});
