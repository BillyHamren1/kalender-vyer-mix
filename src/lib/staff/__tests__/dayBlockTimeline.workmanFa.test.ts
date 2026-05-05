// @vitest-environment node
/**
 * Scenario 7 — Workman / FA Warehouse round-trip
 *
 *   06:50–07:33  FA Warehouse           (LocationBlock)
 *   07:33–08:01  resa FA → Workman      (JourneyBlock)
 *   08:01–12:04  Workman Event AB        (ProjectBlock)
 *   12:04–12:24  resa Workman → FA       (JourneyBlock)
 *   12:24–14:38  FA Warehouse            (LocationBlock)
 *
 * Tekniska rader (timer/assistant/GPS arrival/departure) ska SVÄLJAS
 * in i respektive block och inte dyka upp som egna huvudrader.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock, type JourneyBlock } from '../dayBlockTimeline';
import type { ActualEvent } from '../actualStaffDayModel';

const ev = (over: Partial<ActualEvent> & Pick<ActualEvent, 'id' | 'at' | 'kind'>): ActualEvent => ({
  severity: 'info',
  label: '',
  ...over,
}) as ActualEvent;

describe('buildDayBlockTimeline — Workman/FA Warehouse round-trip', () => {
  const FA_KEY = 'site:fa';
  const WM_KEY = 'booking:2604-111';

  const visitByKey = new Map<string, { knownSiteId: string | null; label: string; durationMin: number; end: string }>([
    [FA_KEY, { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 43, end: '2026-04-29T07:33:00Z' }],
    [WM_KEY, { knownSiteId: 'booking:2604-111', label: '2604-111 · Workman Event AB', durationMin: 243, end: '2026-04-29T12:04:00Z' }],
  ]);

  const mainEvents: ActualEvent[] = [
    ev({
      id: 'v1', kind: 'gps_visit',
      at: '2026-04-29T06:50:00Z', until: '2026-04-29T07:33:00Z', durationMin: 43,
      label: 'FA Warehouse', place: 'FA Warehouse',
      meta: { placeKey: FA_KEY, stopStrength: 'strong_visit' },
    }),
    ev({
      id: 't1', kind: 'gps_travel',
      at: '2026-04-29T07:33:00Z', until: '2026-04-29T08:01:00Z', durationMin: 28,
      label: 'Förflyttning: FA Warehouse → 2604-111 · Workman Event AB',
      meta: { fromPlaceKey: FA_KEY, toPlaceKey: WM_KEY, bothKnown: true,
              from_label: 'FA Warehouse', to_label: '2604-111 · Workman Event AB' },
    }),
    ev({
      id: 'v2', kind: 'gps_visit',
      at: '2026-04-29T08:01:00Z', until: '2026-04-29T12:04:00Z', durationMin: 243,
      label: '2604-111 · Workman Event AB', place: '2604-111 · Workman Event AB',
      meta: { placeKey: WM_KEY, stopStrength: 'project' },
    }),
    ev({
      id: 't2', kind: 'gps_travel',
      at: '2026-04-29T12:04:00Z', until: '2026-04-29T12:24:00Z', durationMin: 20,
      label: 'Förflyttning: 2604-111 · Workman Event AB → FA Warehouse',
      meta: { fromPlaceKey: WM_KEY, toPlaceKey: FA_KEY, bothKnown: true,
              from_label: '2604-111 · Workman Event AB', to_label: 'FA Warehouse' },
    }),
    ev({
      id: 'v3', kind: 'gps_visit',
      at: '2026-04-29T12:24:00Z', until: '2026-04-29T14:38:00Z', durationMin: 134,
      label: 'FA Warehouse', place: 'FA Warehouse',
      meta: { placeKey: FA_KEY, stopStrength: 'strong_visit' },
    }),
  ];

  // Tekniska rader som SKA sväljas in.
  const techEvents: ActualEvent[] = [
    ev({ id: 'arr1', kind: 'gps_arrival', at: '2026-04-29T08:01:00Z',
         label: 'Anlände projekt', meta: { placeKey: WM_KEY } }),
    ev({ id: 'asst1', kind: 'assistant_arrival', at: '2026-04-29T08:02:00Z',
         label: 'Bekräftad ankomst', meta: { placeKey: WM_KEY } }),
    ev({ id: 'tmr-s', kind: 'timer_started', at: '2026-04-29T08:04:00Z',
         label: 'Timer startad', meta: { placeKey: WM_KEY } }),
    ev({ id: 'tr-c', kind: 'time_report_created', at: '2026-04-29T08:04:00Z',
         label: 'Tidrapport startad', meta: { placeKey: WM_KEY } }),
    ev({ id: 'tmr-e', kind: 'timer_stopped', at: '2026-04-29T12:04:00Z',
         label: 'Timer stoppad', meta: { placeKey: WM_KEY } }),
    ev({ id: 'dep1', kind: 'gps_departure', at: '2026-04-29T12:04:00Z',
         label: 'Lämnade projekt', meta: { placeKey: WM_KEY } }),
    ev({ id: 'tr-x', kind: 'time_report_closed', at: '2026-04-29T12:25:00Z',
         label: 'Tidrapport stängd', meta: { placeKey: WM_KEY } }),
  ];

  const blocks = buildDayBlockTimeline({
    mainEvents,
    allEvents: [...mainEvents, ...techEvents],
    visitByKey,
  });

  it('producerar exakt 5 huvudrader: Location, Journey, Project, Journey, Location', () => {
    expect(blocks.map(b => b.kind)).toEqual(['presence', 'journey', 'presence', 'journey', 'presence']);
    const [b1, b2, b3, b4, b5] = blocks as [PresenceBlock, JourneyBlock, PresenceBlock, JourneyBlock, PresenceBlock];
    expect(b1.presenceKind).toBe('location');
    expect(b1.title).toBe('FA Warehouse');
    expect(b1.startIso).toBe('2026-04-29T06:50:00Z');
    expect(b1.endIso).toBe('2026-04-29T07:33:00Z');

    expect(b2.fromLabel).toBe('FA Warehouse');
    expect(b2.toLabel).toBe('2604-111 · Workman Event AB');

    expect(b3.presenceKind).toBe('project');
    expect(b3.isProject).toBe(true);
    expect(b3.title).toBe('2604-111 · Workman Event AB');
    expect(b3.startIso).toBe('2026-04-29T08:01:00Z');
    expect(b3.endIso).toBe('2026-04-29T12:04:00Z');

    expect(b4.fromLabel).toBe('2604-111 · Workman Event AB');
    expect(b4.toLabel).toBe('FA Warehouse');

    expect(b5.presenceKind).toBe('location');
    expect(b5.title).toBe('FA Warehouse');
    expect(b5.startIso).toBe('2026-04-29T12:24:00Z');
    expect(b5.endIso).toBe('2026-04-29T14:38:00Z');
  });

  it('sväljer alla tekniska arrival/timer/tidrapport-rader in i projektblocket', () => {
    const project = blocks[2] as PresenceBlock;
    const innerIds = project.innerEvents.map(e => e.id).sort();
    expect(innerIds).toEqual(['arr1', 'asst1', 'dep1', 'tmr-e', 'tmr-s', 'tr-c', 'tr-x'].sort());
    expect(project.timer.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(project.timer.stoppedIso).toBe('2026-04-29T12:04:00Z');
    expect(project.timeReport.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(project.timeReport.closedIso).toBe('2026-04-29T12:25:00Z');
    expect(project.arrivalIso).toBe('2026-04-29T08:01:00Z');
    expect(project.departureIso).toBe('2026-04-29T12:04:00Z');
    expect(project.sources.timer).toBe(true);
    expect(project.sources.timeReport).toBe(true);
    expect(project.sources.gpsVisit).toBe(true);
    expect(project.sources.assistant).toBe(true);
  });

  it('infogar inga GAP-rader mellan presence och journey i ett komplett dygn', () => {
    expect(blocks.some(b => b.kind === 'gap')).toBe(false);
  });
});
