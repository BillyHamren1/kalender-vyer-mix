// @vitest-environment node
/**
 * Steg 9 — Verklighetstester för buildDayBlockTimeline.
 *
 * Test 1: blandad dag med okänd plats mellan kända arbetsplatser.
 * Test 2: same-site FA→FA får INTE generera journey.
 * Test 3: nattliga GPS-vistelser får inte producera huvudjourney 02:03→13:10.
 * Test 4: timer/time_report under Workman ligger i innerEvents, inte huvudrader.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock, type JourneyBlock } from '../dayBlockTimeline';
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
  label: label || 'Förflyttning',
  durationMin: Math.round((new Date(untilIso).getTime() - new Date(atIso).getTime()) / 60_000),
  meta,
} as ActualEvent);

const tech = (id: string, kind: string, atIso: string, placeKey?: string, label = ''): ActualEvent => ({
  id, at: atIso, kind: kind as ActualEvent['kind'], severity: 'info', label, durationMin: 0,
  meta: placeKey ? { placeKey } : {},
} as ActualEvent);

const VBK = (entries: [string, { knownSiteId: string | null; label: string; durationMin: number; end: string }][]) =>
  new Map(entries);

describe('buildDayBlockTimeline — Steg 9 verklighetstester', () => {
  /* ---------------------------------------------------------------- */
  /* Test 1: FA → unknown → Bergman → FA (blandad dag)                */
  /* ---------------------------------------------------------------- */
  it('Test 1: blandad dag med okänd mellan kända — presence + journeys, inte bara journeys', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T13:43:00Z', end: '2026-04-29T14:39:00Z', durationMin: 56 }),
      visit({ key: 'unk:1', knownSiteId: null, label: 'Okänd plats',
              start: '2026-04-29T15:13:00Z', end: '2026-04-29T15:30:00Z', durationMin: 17 }),
      visit({ key: 'booking:BE', knownSiteId: 'booking:BE-1', label: 'Bergman Event AB',
              start: '2026-04-29T15:45:00Z', end: '2026-04-29T16:30:00Z', durationMin: 45 }),
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T22:48:00Z', end: '2026-04-29T23:30:00Z', durationMin: 42 }),
    ];
    const visitByKey = VBK([
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 56, end: '2026-04-29T14:39:00Z' }],
      ['unk:1', { knownSiteId: null, label: 'Okänd plats', durationMin: 17, end: '2026-04-29T15:30:00Z' }],
      ['booking:BE', { knownSiteId: 'booking:BE-1', label: 'Bergman Event AB', durationMin: 45, end: '2026-04-29T16:30:00Z' }],
    ]);
    const events: ActualEvent[] = [
      travel('t1', '2026-04-29T14:39:00Z', '2026-04-29T15:13:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'unk:1', bothKnown: false, travelClass: 'work_travel',
      }),
      travel('t2', '2026-04-29T15:30:00Z', '2026-04-29T15:45:00Z', {
        fromPlaceKey: 'unk:1', toPlaceKey: 'booking:BE', bothKnown: false, travelClass: 'work_travel',
      }),
      travel('t3', '2026-04-29T16:30:00Z', '2026-04-29T22:48:00Z', {
        fromPlaceKey: 'booking:BE', toPlaceKey: 'site:fa', bothKnown: true, travelClass: 'work_travel',
      }),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });

    // Måste innehålla alla fyra presence + minst två journeys (t3 är 6h=360 min, OK)
    const presences = blocks.filter((b): b is PresenceBlock => b.kind === 'presence');
    const journeys = blocks.filter((b): b is JourneyBlock => b.kind === 'journey');
    const titles = presences.map(p => p.title);
    expect(titles).toContain('FA Warehouse');
    expect(titles).toContain('Bergman Event AB');
    expect(titles).toContain('Okänd plats');
    // Inte BARA journey-rader — presence-block dominerar
    expect(presences.length).toBeGreaterThanOrEqual(4);
    expect(journeys.length).toBeGreaterThanOrEqual(2);
    // Bergman ska klassas som projekt
    const bergman = presences.find(p => p.title === 'Bergman Event AB');
    expect(bergman?.presenceKind).toBe('project');
    // Okänd plats ska kräva granskning
    const unk = presences.find(p => p.title === 'Okänd plats');
    expect(unk?.requiresReview).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /* Test 2: same-site gap (FA→FA) får INTE bli journey               */
  /* ---------------------------------------------------------------- */
  it('Test 2: FA Warehouse → FA Warehouse genererar ingen journey', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T12:24:00Z', end: '2026-04-29T12:41:00Z', durationMin: 17 }),
      visit({ key: 'site:fa', knownSiteId: 'site:fa', label: 'FA Warehouse',
              start: '2026-04-29T13:42:00Z', end: '2026-04-29T14:39:00Z', durationMin: 57 }),
    ];
    const visitByKey = VBK([
      ['site:fa', { knownSiteId: 'site:fa', label: 'FA Warehouse', durationMin: 57, end: '2026-04-29T14:39:00Z' }],
    ]);
    const events: ActualEvent[] = [
      // Jitter-resa FA→FA — ska filtreras (samePlaceTravel)
      travel('t-jitter', '2026-04-29T12:41:00Z', '2026-04-29T13:42:00Z', {
        fromPlaceKey: 'site:fa', toPlaceKey: 'site:fa', samePlaceTravel: true,
        bothKnown: true, travelClass: 'work_travel',
      }),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });
    const journeys = blocks.filter(b => b.kind === 'journey');
    expect(journeys.length).toBe(0);
    // Två FA-presence (block-engine slår inte ihop visits — det är OK)
    const presences = blocks.filter((b): b is PresenceBlock => b.kind === 'presence');
    expect(presences.every(p => p.title === 'FA Warehouse')).toBe(true);
    expect(presences.length).toBe(2);
  });

  /* ---------------------------------------------------------------- */
  /* Test 3: nattlig GPS får inte bli huvudjourney 02:03→13:10        */
  /* ---------------------------------------------------------------- */
  it('Test 3: nattlig private/background-resa filtreras från huvudjournalen', () => {
    // Nattliga visiter är private_or_background och plockas bort innan dayBlockTimeline.
    // Vi simulerar: ingen nattlig visit, bara den arbetsrelevanta. Den nattliga
    // travel-eventen markeras commute_or_background+preWorkdayLeadIn och ska
    // filtreras av journey-reglerna.
    const visits: ActualVisit[] = [
      visit({ key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman Event AB',
              start: '2026-04-29T13:10:00Z', end: '2026-04-29T17:00:00Z', durationMin: 230 }),
    ];
    const visitByKey = VBK([
      ['booking:WM', { knownSiteId: 'booking:WM-1', label: 'Workman Event AB', durationMin: 230, end: '2026-04-29T17:00:00Z' }],
    ]);
    const events: ActualEvent[] = [
      travel('t-night', '2026-04-29T02:03:00Z', '2026-04-29T13:10:00Z', {
        fromPlaceKey: 'fair:swedish-game', toPlaceKey: 'booking:WM',
        travelClass: 'commute_or_background', workRelevance: 'private_or_background',
        preWorkdayLeadIn: true, bothKnown: false,
      }, 'Bakgrunds-GPS före arbetsdagens start: Swedish Game Fair → Workman'),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });

    expect(blocks.filter(b => b.kind === 'journey').length).toBe(0);
    const presences = blocks.filter((b): b is PresenceBlock => b.kind === 'presence');
    expect(presences.length).toBe(1);
    expect(presences[0].startIso).toBe('2026-04-29T13:10:00Z');
    expect(presences[0].title).toBe('Workman Event AB');
  });

  /* ---------------------------------------------------------------- */
  /* Test 4: Workman 08:01–12:04 — timer/TR i innerEvents              */
  /* ---------------------------------------------------------------- */
  it('Test 4: Workman ProjectBlock sväljer timer/time_report i innerEvents', () => {
    const visits: ActualVisit[] = [
      visit({ key: 'booking:WM', knownSiteId: 'booking:WM-1', label: 'Workman Event AB',
              start: '2026-04-29T08:01:00Z', end: '2026-04-29T12:04:00Z', durationMin: 243 }),
    ];
    const visitByKey = VBK([
      ['booking:WM', { knownSiteId: 'booking:WM-1', label: 'Workman Event AB', durationMin: 243, end: '2026-04-29T12:04:00Z' }],
    ]);
    const events: ActualEvent[] = [
      tech('tmr-s', 'timer_started', '2026-04-29T08:04:00Z', 'booking:WM', 'Timer startad'),
      tech('tr-c', 'time_report_created', '2026-04-29T08:04:00Z', 'booking:WM', 'Tidrapport startad'),
      tech('tmr-e', 'timer_stopped', '2026-04-29T12:04:00Z', 'booking:WM', 'Timer stoppad'),
      tech('tr-x', 'time_report_closed', '2026-04-29T12:25:00Z', 'booking:WM', 'Tidrapport stängd'),
    ];
    const blocks = buildDayBlockTimeline({ allEvents: events, actualVisits: visits, visitByKey });

    // Exakt ett huvudblock — projektet
    const main = blocks.filter(b => b.kind !== 'gap');
    expect(main.length).toBe(1);
    const project = main[0] as PresenceBlock;
    expect(project.kind).toBe('presence');
    expect(project.presenceKind).toBe('project');
    expect(project.title).toBe('Workman Event AB');
    // Timer/TR är inneslutna, inte separata huvudrader
    const innerIds = project.innerEvents.map(e => e.id).sort();
    expect(innerIds).toEqual(['tmr-e', 'tmr-s', 'tr-c', 'tr-x']);
    expect(project.timer.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(project.timer.stoppedIso).toBe('2026-04-29T12:04:00Z');
    expect(project.timeReport.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(project.timeReport.closedIso).toBe('2026-04-29T12:25:00Z');
  });
});
