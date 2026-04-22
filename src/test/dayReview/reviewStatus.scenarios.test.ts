/**
 * reviewStatus.scenarios.test.ts
 * ──────────────────────────────
 * Driver de 10 scenarier som listades för dagavstämningsmodellen genom
 * `computeReview`-oracle (TS-port av compute_workday_review_status).
 *
 * Täcker:
 *   1. Missad arrival → needs_review
 *   2. Event stale_for_prompt men kvar i review
 *   3. Gårdagen kan öppnas nästa dag (missing_end + still i listan)
 *   4. Dagen blir ready när luckor lösts
 *   5. Dagen blir approved och låses
 *   6. Flera missade events → needs_review (rättning ändrar status)
 *   7. home_arrival utan workday-end → missing_end
 *   8. Oklara resor → unresolved_travel
 *   9. Påminnelse: gårdagen ligger kvar tills approved (data-villkoret bakom toasten)
 *  10. Ingen data tappas — stale events försvinner inte ur review
 */
import { describe, it, expect } from 'vitest';
import {
  computeReview,
  type OracleEvent,
  type OracleTravel,
  type OracleWorkday,
} from './reviewStatus.oracle';

const T = (iso: string) => new Date(iso);

const baseDay = '2026-04-21'; // an arbitrary test day
const dayIso = (hhmm: string) => `${baseDay}T${hhmm}:00.000Z`;
const NEXT_DAY_NOON = T('2026-04-22T12:00:00.000Z');

function wd(overrides: Partial<OracleWorkday> = {}): OracleWorkday {
  return {
    id: 'wd-1',
    started_at: dayIso('07:00'),
    ended_at: null,
    review_status: 'draft',
    ...overrides,
  };
}
function ev(overrides: Partial<OracleEvent> = {}): OracleEvent {
  return {
    happened_at: dayIso('08:00'),
    resolution_status: 'pending',
    stale_for_prompt: false,
    still_relevant_for_review: true,
    ...overrides,
  };
}
function travel(overrides: Partial<OracleTravel> = {}): OracleTravel {
  return { started_at: dayIso('07:30'), ended_at: dayIso('08:00'), ...overrides };
}

describe('Day-review status oracle — 10 official scenarios', () => {
  it('1. Missad arrival ger needs_review', () => {
    const res = computeReview({
      workday: wd(),
      events: [ev({ happened_at: dayIso('08:30') })], // pending arrival
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(res.status).toBe('needs_review');
    expect(res.reasons).toContain('open_assistant_events');
  });

  it('2. Event blir stale för prompt men finns kvar i review', () => {
    const res = computeReview({
      workday: wd(),
      events: [ev({ stale_for_prompt: true, still_relevant_for_review: true })],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    // Inte i open_assistant_events (stale → ut ur prompt)
    expect(res.reasons).not.toContain('open_assistant_events');
    // Men FINNS i stale_review_events → dagen är fortfarande needs_review
    expect(res.reasons).toContain('stale_review_events');
    expect(res.status).toBe('needs_review');
  });

  it('3. Gårdagen kan öppnas nästa dag — missing_end registreras', () => {
    const res = computeReview({
      workday: wd({ ended_at: null }), // saknar slut
      events: [],
      travels: [],
      now: NEXT_DAY_NOON, // > 20h efter start
    });
    expect(res.reasons).toContain('missing_end');
    expect(res.status).toBe('needs_review');
  });

  it('4. Dagen blir ready när luckor lösts', () => {
    const res = computeReview({
      workday: wd({ ended_at: dayIso('17:00') }),
      events: [
        ev({
          resolution_status: 'resolved',
          stale_for_prompt: true,
          still_relevant_for_review: false,
        }),
      ],
      travels: [travel()], // klar resa
      now: NEXT_DAY_NOON,
    });
    expect(res.reasons).toEqual([]);
    expect(res.status).toBe('ready');
  });

  it('5. Dagen blir approved efter godkännande och LÅSES', () => {
    // Även om saker fortfarande är "trasigt" så ska approved inte degradera
    const res = computeReview({
      workday: wd({ ended_at: null, review_status: 'approved' }),
      events: [ev()], // open event
      travels: [travel({ ended_at: null })], // open travel
      now: NEXT_DAY_NOON,
    });
    expect(res.status).toBe('approved');
    expect(res.reasons).toEqual([]);
  });

  it('6. Flera missade events kan rättas i efterhand → status flippar till ready', () => {
    const before = computeReview({
      workday: wd({ ended_at: null }),
      events: [
        ev({ happened_at: dayIso('08:00'), stale_for_prompt: true }),
        ev({ happened_at: dayIso('11:00'), stale_for_prompt: true }),
        ev({ happened_at: dayIso('14:00'), stale_for_prompt: true }),
      ],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(before.status).toBe('needs_review');
    expect(before.reasons).toContain('stale_review_events');
    expect(before.reasons).toContain('missed_prompts_all_day');
    expect(before.reasons).toContain('missing_end');

    // Användaren har gått igenom review-vyn och rättat allt:
    const after = computeReview({
      workday: wd({ ended_at: dayIso('17:30') }),
      events: [
        ev({ happened_at: dayIso('08:00'), resolution_status: 'resolved', still_relevant_for_review: false, stale_for_prompt: true }),
        ev({ happened_at: dayIso('11:00'), resolution_status: 'ignored_stale', still_relevant_for_review: false, stale_for_prompt: true }),
        ev({ happened_at: dayIso('14:00'), resolution_status: 'resolved', still_relevant_for_review: false, stale_for_prompt: true }),
      ],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(after.status).toBe('ready');
    expect(after.reasons).toEqual([]);
  });

  it('7. Home-arrival utan dagslut flaggas som missing_end', () => {
    const res = computeReview({
      workday: wd({ ended_at: null }),
      events: [
        ev({
          happened_at: dayIso('18:30'),
          // event resolved av användaren men workday är inte avslutad
          resolution_status: 'resolved',
          still_relevant_for_review: false,
          stale_for_prompt: true,
        }),
      ],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(res.reasons).toContain('missing_end');
    expect(res.status).toBe('needs_review');
  });

  it('8. Oklara resor flaggas — unresolved_travel', () => {
    const res = computeReview({
      workday: wd({ ended_at: dayIso('17:00') }),
      events: [],
      travels: [travel({ ended_at: null })],
      now: NEXT_DAY_NOON,
    });
    expect(res.reasons).toEqual(['unresolved_travel']);
    expect(res.status).toBe('needs_review');
  });

  it('9. Påminnelse-villkoret: gårdagens needs_review ligger kvar tills approved', () => {
    // Dag 1: needs_review existerar
    let res = computeReview({
      workday: wd({ ended_at: null }),
      events: [ev({ happened_at: dayIso('08:00') })],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(res.status).toBe('needs_review');
    // Användaren tittar men gör ingenting → samma status nästa kontroll
    res = computeReview({
      workday: wd({ ended_at: null }),
      events: [ev({ happened_at: dayIso('08:00') })],
      travels: [],
      now: T('2026-04-23T08:00:00.000Z'), // ytterligare ett dygn
    });
    expect(res.status).toBe('needs_review');
    // Först när användaren approvar → låst
    res = computeReview({
      workday: wd({ ended_at: null, review_status: 'approved' }),
      events: [ev({ happened_at: dayIso('08:00') })],
      travels: [],
      now: T('2026-04-23T08:00:00.000Z'),
    });
    expect(res.status).toBe('approved');
  });

  it('10. Ingen data tappas: events finns kvar i review även när tid gått', () => {
    // Gammalt event, stale_for_prompt → ute ur prompt-kön
    // men still_relevant_for_review behålls TRUE
    const oldStaleEvents: OracleEvent[] = [
      ev({ happened_at: dayIso('08:00'), stale_for_prompt: true, still_relevant_for_review: true }),
      ev({ happened_at: dayIso('15:00'), stale_for_prompt: true, still_relevant_for_review: true }),
    ];
    const res = computeReview({
      workday: wd({ ended_at: dayIso('17:00') }),
      events: oldStaleEvents,
      travels: [],
      now: T('2026-05-15T12:00:00.000Z'), // 3+ veckor senare
    });
    expect(res.reasons).toContain('stale_review_events');
    expect(res.status).toBe('needs_review');
  });
});

describe('Edge cases — locking and absorbing rules', () => {
  it('approved förblir approved även med 0 reasons', () => {
    const res = computeReview({
      workday: wd({ ended_at: dayIso('17:00'), review_status: 'approved' }),
      events: [],
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(res.status).toBe('approved');
  });

  it('draft returneras när inget hänt och dagen är ofärdig', () => {
    const res = computeReview({
      workday: wd({ started_at: dayIso('08:00'), ended_at: null }),
      events: [],
      travels: [],
      now: T(`${baseDay}T10:00:00.000Z`), // samma dag, inom 20h
    });
    expect(res.status).toBe('draft');
    expect(res.reasons).toEqual([]);
  });

  it('event utanför workday-dagen påverkar inte', () => {
    const res = computeReview({
      workday: wd({ ended_at: dayIso('17:00') }),
      events: [ev({ happened_at: '2026-04-20T10:00:00.000Z' })], // dagen innan
      travels: [],
      now: NEXT_DAY_NOON,
    });
    expect(res.status).toBe('ready');
  });
});
