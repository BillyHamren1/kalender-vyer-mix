// @vitest-environment node
/**
 * Steg 5 — JourneyBlock får bara skapas mellan två presenceBlocks.
 *
 * Förbjudna fall i huvudjournalen:
 *   - samma plats (FA → FA / samePlaceTravel)
 *   - privat/bakgrund/pre-workday lead-in
 *   - destinationens presenceBlock saknas
 *   - resa som ersätter vistelsen
 *
 * Tillåtet: Presence A → Journey → Presence B där A.placeKey ≠ B.placeKey.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type JourneyBlock, type PresenceBlock } from '../dayBlockTimeline';
import type { ActualEvent, ActualVisit } from '../actualStaffDayModel';

const visit = (over: Partial<ActualVisit> & Pick<ActualVisit, 'key' | 'knownSiteId' | 'start' | 'end' | 'durationMin'>): ActualVisit => ({
  label: over.key, centre: null, pingCount: 5, avgAccuracy: 10, ...over,
}) as ActualVisit;

const travel = (id: string, atIso: string, untilIso: string, meta: Record<string, unknown>, label = ''): ActualEvent => ({
  id,
  at: atIso,
  until: untilIso,
  kind: 'gps_travel' as ActualEvent['kind'],
  severity: 'info',
  label: label || 'Förflyttning: A → B',
  durationMin: Math.round((new Date(untilIso).getTime() - new Date(atIso).getTime()) / 60_000),
  meta,
} as ActualEvent);

describe('buildDayBlockTimeline — journey rules (Steg 5)', () => {
  const visitByKey = new Map<string, { knownSiteId: string | null; label: string; durationMin: number; end: string }>();

  it('tillåter journey mellan två olika presenceBlocks', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60 }),
      visit({ key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman',
              start: '2026-04-29T09:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 180 }),
    ];
    const events: ActualEvent[] = [
      travel('trv:1', '2026-04-29T08:05:00Z', '2026-04-29T08:55:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'booking:WM', bothKnown: true,
        travelClass: 'work_travel', workRelevance: 'work_confirmed',
      }, 'Förflyttning: FA Warehouse → Workman'),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    const journeys = blocks.filter((b): b is JourneyBlock => b.kind === 'journey');
    expect(journeys.length).toBe(1);
    expect(journeys[0].fromPlaceKey).toBe('site:fa');
    expect(journeys[0].toPlaceKey).toBe('booking:WM');
  });

  it('förbjuder samma-plats-resa (FA → FA)', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T07:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 300 }),
    ];
    const events: ActualEvent[] = [
      travel('trv:loop', '2026-04-29T09:00:00Z', '2026-04-29T09:10:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'site:fa', samePlaceTravel: true,
        travelClass: 'work_travel', bothKnown: true,
      }),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    expect(blocks.filter(b => b.kind === 'journey').length).toBe(0);
  });

  it('förbjuder privat/bakgrund/lead-in journey (nattlig första GPS)', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman',
              start: '2026-04-29T08:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 240 }),
    ];
    const events: ActualEvent[] = [
      travel('trv:home', '2026-04-29T05:30:00Z', '2026-04-29T07:55:00Z', {
        fromPlaceKey: 'home', toPlaceKey: 'booking:WM',
        travelClass: 'commute_or_background', workRelevance: 'private_or_background',
        preWorkdayLeadIn: true,
      }, 'Bakgrunds-GPS före arbetsdagens start: Hem → Workman'),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    expect(blocks.filter(b => b.kind === 'journey').length).toBe(0);
  });

  it('förbjuder journey utan destination-presence', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60 }),
      // Ingen presence på 'unknown:x'
    ];
    const events: ActualEvent[] = [
      travel('trv:nowhere', '2026-04-29T08:05:00Z', '2026-04-29T08:30:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'unknown:x', bothKnown: false,
        travelClass: 'work_travel',
      }),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    expect(blocks.filter(b => b.kind === 'journey').length).toBe(0);
  });

  it('huvudjournalen blir Presence → Journey → Presence', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T07:00:00Z', end: '2026-04-29T08:00:00Z', durationMin: 60 }),
      visit({ key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman',
              start: '2026-04-29T09:00:00Z', end: '2026-04-29T12:00:00Z', durationMin: 180 }),
    ];
    const events: ActualEvent[] = [
      travel('trv:1', '2026-04-29T08:05:00Z', '2026-04-29T08:55:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'booking:WM', bothKnown: true,
        travelClass: 'work_travel',
      }),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    const main = blocks.filter(b => b.kind !== 'gap');
    expect(main.map(b => b.kind)).toEqual(['presence', 'journey', 'presence']);
    const [a, _j, c] = main as [PresenceBlock, JourneyBlock, PresenceBlock];
    expect(a.placeKey).not.toBe(c.placeKey);
  });
});
