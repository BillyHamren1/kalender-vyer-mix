// @vitest-environment node
/**
 * Steg 6 — inferred_between_journeys är FALLBACK, inte default.
 *
 * Kärnregel: två journeys som råkar dela endpoint får INTE skapa en falsk
 * arbetsvistelse. Inferred presence kräver antingen starkt stöd (timer/TR)
 * eller känd plats med långt gap, och requiresReview=true om GPS/timer/TR
 * saknas.
 *
 * I praktiken filtrerar Steg 5 bort journeys som saknar presence i båda ändar,
 * så inferred-vägen är extra säkerhet bakom det.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock } from '../dayBlockTimeline';
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

describe('buildDayBlockTimeline — inferred presence är fallback (Steg 6)', () => {
  it('skapar INTE inferred presence från endast två resor som delar endpoint', () => {
    // Två journeys mellan riktiga presence-block. Mellan dem (08:30–09:00)
    // finns INGEN actualVisit, INGEN timer/TR. Då ska huvudjournalen INTE
    // hitta på en arbetsvistelse på FA Warehouse.
    const visitByKey = new Map([
      ['home', { knownSiteId: 'home', label: 'Hem', durationMin: 60, end: '2026-04-29T08:00:00Z' }],
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 0, end: '2026-04-29T08:30:00Z' }],
      ['booking:WM', { knownSiteId: 'booking:WM-1', label: 'Workman', durationMin: 150, end: '2026-04-29T12:00:00Z' }],
    ]);
    const visits = [
      { key: 'home', knownSiteId: 'home', label: 'Hem',
        start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60,
        centre: null, pingCount: 5, avgAccuracy: 10 },
      // Kort site:fa-presence räcker som from/to-ankare för båda journeys
      { key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
        start: '2026-04-29T08:25:00Z', end: '2026-04-29T08:31:00Z', durationMin: 6,
        centre: null, pingCount: 5, avgAccuracy: 10 },
      { key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman',
        start: '2026-04-29T09:30:00Z', end: '2026-04-29T12:00:00Z', durationMin: 150,
        centre: null, pingCount: 5, avgAccuracy: 10 },
    ] as any;
    const events: ActualEvent[] = [
      travel('jA', '2026-04-29T08:00:00Z', '2026-04-29T08:30:00Z', {
        fromPlaceKey: 'home', toPlaceKey: 'site:fa', bothKnown: true,
        travelClass: 'work_travel',
      }),
      travel('jB', '2026-04-29T09:00:00Z', '2026-04-29T09:30:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'booking:WM', bothKnown: true,
        travelClass: 'work_travel',
      }),
    ];

    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    const inferred = blocks.filter((b): b is PresenceBlock =>
      b.kind === 'presence' && b.id.startsWith('pb:inferred:'));
    // Ingen falsk arbetsvistelse skapas mellan jA och jB (gap saknar timer/TR)
    expect(inferred.length).toBe(0);
  });
});
