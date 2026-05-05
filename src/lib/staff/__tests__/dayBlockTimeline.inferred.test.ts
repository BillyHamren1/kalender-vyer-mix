// @vitest-environment node
/**
 * Steg 6 — inferred_between_journeys är FALLBACK, inte default.
 *
 * Regler:
 *   A) Skapa endast inferred presence om starkt stöd (timer/TR/assistant/server) finns
 *      i fönstret, ELLER
 *   B) knownSiteId är tydligt OCH gapet är ≥30 min.
 *   - requiresReview=true om GPS/timer/TR-evidens saknas.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock, type GapBlock } from '../dayBlockTimeline';
import type { ActualEvent } from '../actualStaffDayModel';

const travel = (id: string, atIso: string, untilIso: string, meta: Record<string, unknown>): ActualEvent => ({
  id,
  at: atIso,
  until: untilIso,
  kind: 'gps_travel' as ActualEvent['kind'],
  severity: 'info',
  label: 'Förflyttning: A → B',
  durationMin: Math.round((new Date(untilIso).getTime() - new Date(atIso).getTime()) / 60_000),
  meta,
} as ActualEvent);

const tech = (id: string, kind: string, atIso: string, label = ''): ActualEvent => ({
  id, at: atIso, kind: kind as ActualEvent['kind'], severity: 'info', label, durationMin: 0, meta: {},
} as ActualEvent);

describe('buildDayBlockTimeline — inferred presence är fallback (Steg 6)', () => {
  // Två journeys utan presence emellan; gapet 08:30→09:00
  const baseJourneys = [
    travel('jA', '2026-04-29T08:00:00Z', '2026-04-29T08:30:00Z', {
      fromPlaceKey: 'home', toPlaceKey: 'site:fa', bothKnown: true,
      travelClass: 'work_travel',
    }),
    travel('jB', '2026-04-29T09:00:00Z', '2026-04-29T09:30:00Z', {
      fromPlaceKey: 'site:fa', toPlaceKey: 'booking:WM', bothKnown: true,
      travelClass: 'work_travel',
    }),
  ];

  it('skapar INTE inferred presence när bara två resor delar endpoint (kort gap, ingen evidens)', () => {
    // Förutsättning: presenceBlocks finns för fromBlock/toBlock så journeys överlever.
    // Vi vill att gap mellan dem (på FA Warehouse, 30 min, utan TR/timer) blir GAP, inte presence.
    const visitByKey = new Map([
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 0, end: '2026-04-29T08:30:00Z' }],
    ]);
    const visits = [
      { key: 'home', knownSiteId: 'home', label: 'Hem', start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60, centre: null, pingCount: 5, avgAccuracy: 10 },
      { key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman', start: '2026-04-29T09:30:00Z', end: '2026-04-29T12:00:00Z', durationMin: 150, centre: null, pingCount: 5, avgAccuracy: 10 },
    ] as any;
    const blocks = buildDayBlockTimeline({ allEvents: baseJourneys, actualVisits: visits, visitByKey });
    const inferred = blocks.filter((b): b is PresenceBlock => b.kind === 'presence' && b.id.startsWith('pb:inferred:'));
    expect(inferred.length).toBe(0);
    // Vi förväntar oss istället en GAP-markör mellan resorna
    const gaps = blocks.filter((b): b is GapBlock => b.kind === 'gap');
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('skapar inferred presence (regel A) när timer/TR finns i fönstret', () => {
    const visitByKey = new Map([
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 0, end: '2026-04-29T08:30:00Z' }],
    ]);
    const visits = [
      { key: 'home', knownSiteId: 'home', label: 'Hem', start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60, centre: null, pingCount: 5, avgAccuracy: 10 },
      { key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman', start: '2026-04-29T09:30:00Z', end: '2026-04-29T12:00:00Z', durationMin: 150, centre: null, pingCount: 5, avgAccuracy: 10 },
    ] as any;
    const events: ActualEvent[] = [
      ...baseJourneys,
      tech('tr-c', 'time_report_created', '2026-04-29T08:35:00Z', 'Tidrapport startad: FA Warehouse'),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    const inferred = blocks.filter((b): b is PresenceBlock => b.kind === 'presence' && b.id.startsWith('pb:inferred:'));
    expect(inferred.length).toBe(1);
    expect(inferred[0].requiresReview).toBe(false);
    expect(inferred[0].sources.timeReport).toBe(true);
  });

  it('regel B: knownSite + långt gap (≥30 min) tillåter inferred men kräver review', () => {
    // Justera så gap = 60 min
    const longJourneys = [
      travel('jA', '2026-04-29T08:00:00Z', '2026-04-29T08:30:00Z', {
        fromPlaceKey: 'home', toPlaceKey: 'site:fa', bothKnown: true, travelClass: 'work_travel',
      }),
      travel('jB', '2026-04-29T09:30:00Z', '2026-04-29T10:00:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'booking:WM', bothKnown: true, travelClass: 'work_travel',
      }),
    ];
    const visitByKey = new Map([
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 0, end: '2026-04-29T08:30:00Z' }],
    ]);
    const visits = [
      { key: 'home', knownSiteId: 'home', label: 'Hem', start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60, centre: null, pingCount: 5, avgAccuracy: 10 },
      { key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman', start: '2026-04-29T10:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 120, centre: null, pingCount: 5, avgAccuracy: 10 },
    ] as any;
    const blocks = buildDayBlockTimeline({ allEvents: longJourneys, actualVisits: visits, visitByKey });
    const inferred = blocks.filter((b): b is PresenceBlock => b.kind === 'presence' && b.id.startsWith('pb:inferred:'));
    expect(inferred.length).toBe(1);
    expect(inferred[0].requiresReview).toBe(true);
    expect(inferred[0].placeKey).toBe('site:fa');
  });
});
