// @vitest-environment node
/**
 * Princip: blockmotorn får INTE vara beroende av buildMainTimeline.
 * Även om mainEvents är tom (allt filtrerat bort av timelineVisibility)
 * ska presence-blocken byggas från actualVisits direkt.
 *
 * Journeys hämtas från allEvents (gps_travel) — inte mainEvents.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock, type JourneyBlock } from '../dayBlockTimeline';
import type { ActualEvent, ActualVisit } from '../actualStaffDayModel';

const ev = (over: Partial<ActualEvent> & Pick<ActualEvent, 'id' | 'at' | 'kind'>): ActualEvent => ({
  severity: 'info', label: '', ...over,
}) as ActualEvent;

describe('buildDayBlockTimeline — visits-first principle', () => {
  const FA = 'site:fa';
  const WM = 'booking:2604-111';

  const actualVisits: ActualVisit[] = [
    { key: FA, label: 'FA Warehouse', knownSiteId: 'site:fa', centre: null,
      start: '2026-04-29T06:50:00Z', end: '2026-04-29T07:33:00Z',
      durationMin: 43, pingCount: 10, avgAccuracy: 12 },
    { key: WM, label: '2604-111 · Workman Event AB', knownSiteId: 'booking:2604-111', centre: null,
      start: '2026-04-29T08:01:00Z', end: '2026-04-29T12:04:00Z',
      durationMin: 243, pingCount: 50, avgAccuracy: 9 },
  ];

  // Inga gps_visit-events alls — bara journeys + tekniska rader. Detta
  // simulerar fallet där timelineVisibility filtrerat bort vistelserna.
  const allEvents: ActualEvent[] = [
    ev({ id: 't1', kind: 'gps_travel',
         at: '2026-04-29T07:33:00Z', until: '2026-04-29T08:01:00Z', durationMin: 28,
         label: 'Förflyttning: FA Warehouse → 2604-111 · Workman Event AB',
         meta: { fromPlaceKey: FA, toPlaceKey: WM, bothKnown: true,
                 from_label: 'FA Warehouse', to_label: '2604-111 · Workman Event AB' } }),
    ev({ id: 'tmr-s', kind: 'timer_started', at: '2026-04-29T08:04:00Z',
         meta: { placeKey: WM } }),
    ev({ id: 'tmr-e', kind: 'timer_stopped', at: '2026-04-29T12:04:00Z',
         meta: { placeKey: WM } }),
  ];

  const blocks = buildDayBlockTimeline({
    mainEvents: [],            // tom! ska INTE blockera presence
    allEvents,
    actualVisits,
    visitByKey: new Map(),
  });

  it('bygger presence-block från actualVisits även när mainEvents är tom', () => {
    const presence = blocks.filter(b => b.kind === 'presence') as PresenceBlock[];
    expect(presence.length).toBe(2);
    expect(presence[0].title).toBe('FA Warehouse');
    expect(presence[1].title).toBe('2604-111 · Workman Event AB');
    expect(presence[1].isProject).toBe(true);
  });

  it('bygger journey från allEvents (inte mainEvents)', () => {
    const journeys = blocks.filter(b => b.kind === 'journey') as JourneyBlock[];
    expect(journeys.length).toBe(1);
    expect(journeys[0].fromLabel).toBe('FA Warehouse');
    expect(journeys[0].toLabel).toBe('2604-111 · Workman Event AB');
  });

  it('sväljer tekniska timer-events in i projekt-blocket', () => {
    const project = blocks.find(b => b.kind === 'presence' && (b as PresenceBlock).isProject) as PresenceBlock;
    expect(project.timer.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(project.timer.stoppedIso).toBe('2026-04-29T12:04:00Z');
    expect(project.sources.timer).toBe(true);
  });
});
