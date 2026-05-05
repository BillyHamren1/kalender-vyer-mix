// @vitest-environment node
/**
 * Steg 4 — timer/time_report/assistant ovanpå presenceBlocks.
 *
 * Regel:
 *   - timer/TR/assistant som överlappar ett presenceBlock med samma placeKey
 *     hamnar i block.innerEvents (inte som egna huvudrader).
 *   - timer/TR utan GPS-presence → synthetic PresenceBlock med source-markering.
 */
import { describe, it, expect } from 'vitest';
import { buildDayBlockTimeline, type PresenceBlock } from '../dayBlockTimeline';
import type { ActualEvent, ActualVisit } from '../actualStaffDayModel';

const ev = (over: Partial<ActualEvent> & Pick<ActualEvent, 'id' | 'at' | 'kind'>): ActualEvent => ({
  severity: 'info', label: '', ...over,
}) as ActualEvent;

const visit = (over: Partial<ActualVisit> & Pick<ActualVisit, 'key' | 'knownSiteId' | 'start' | 'end' | 'durationMin'>): ActualVisit => ({
  label: over.key, centre: null, pingCount: 5, avgAccuracy: 10, ...over,
}) as ActualVisit;

describe('buildDayBlockTimeline — timer/TR overlay', () => {
  it('drar in timer/TR/assistant i projektblocket istället för egna huvudrader', () => {
    const WM = 'booking:2604-111';
    const blocks = buildDayBlockTimeline({
      allEvents: [
        ev({ id: 'tmr-s', kind: 'timer_started',     at: '2026-04-29T08:04:00Z', meta: { placeKey: WM } }),
        ev({ id: 'tr-c',  kind: 'time_report_created', at: '2026-04-29T08:04:00Z', meta: { placeKey: WM } }),
        ev({ id: 'asst',  kind: 'assistant_arrival', at: '2026-04-29T08:02:00Z', meta: { placeKey: WM } }),
        ev({ id: 'tmr-e', kind: 'timer_stopped',     at: '2026-04-29T12:04:00Z', meta: { placeKey: WM } }),
        ev({ id: 'tr-x',  kind: 'time_report_closed', at: '2026-04-29T12:25:00Z', meta: { placeKey: WM } }),
      ],
      actualVisits: [
        visit({ key: WM, knownSiteId: WM, label: '2604-111 · Workman Event AB',
                start: '2026-04-29T08:01:00Z', end: '2026-04-29T12:04:00Z', durationMin: 243 }),
      ],
      visitByKey: new Map(),
    });
    const presence = blocks.filter(b => b.kind === 'presence') as PresenceBlock[];
    expect(presence).toHaveLength(1);
    const p = presence[0];
    // Inga huvud-rader för timer/TR — alla absorberade.
    const innerIds = p.innerEvents.map(e => e.id).sort();
    expect(innerIds).toEqual(['asst', 'tmr-e', 'tmr-s', 'tr-c', 'tr-x']);
    expect(p.timer.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(p.timer.stoppedIso).toBe('2026-04-29T12:04:00Z');
    expect(p.timeReport.startedIso).toBe('2026-04-29T08:04:00Z');
    expect(p.timeReport.closedIso).toBe('2026-04-29T12:25:00Z');
    expect(p.sources.timer).toBe(true);
    expect(p.sources.timeReport).toBe(true);
    expect(p.sources.assistant).toBe(true);
    // Subtitle/evidence ska summera bevisen — inte tomma huvudrader.
    expect(p.evidenceLabel).toMatch(/Tidrapport/);
  });

  it('skapar synthetic PresenceBlock när time_report finns utan GPS-vistelse', () => {
    const blocks = buildDayBlockTimeline({
      allEvents: [
        ev({ id: 'tr-create:42', kind: 'time_report_created',
             at: '2026-04-29T13:43:00Z', label: 'Tidrapport startad: FA Warehouse',
             place: 'FA Warehouse' }),
        ev({ id: 'tr-close:42',  kind: 'time_report_closed',
             at: '2026-04-29T22:48:00Z', label: 'Tidrapport stängd' }),
      ],
      actualVisits: [],            // ingen GPS!
      visitByKey: new Map(),
    });
    const presence = blocks.filter(b => b.kind === 'presence') as PresenceBlock[];
    expect(presence).toHaveLength(1);
    const p = presence[0];
    expect(p.strength).toBe('time_report_window');
    expect(p.sources.timeReport).toBe(true);
    expect(p.sources.gpsVisit).toBe(false);
    expect(p.requiresReview).toBe(true);
    expect(p.subtitle).toMatch(/från tidrapport/);
    expect(p.timeReport.startedIso).toBe('2026-04-29T13:43:00Z');
    expect(p.timeReport.closedIso).toBe('2026-04-29T22:48:00Z');
  });
});
