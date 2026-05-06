import { describe, it, expect } from 'vitest';
import { buildProjectBlocks } from '@/components/staff/ProjectVisitBlock';
import type { ActualEvent } from '@/lib/staff/actualStaffDayModel';
import type { VisitInfo } from '@/lib/staff/dayBlockTimeline';

const placeKey = 'pk:booking-1';
const knownSiteId = 'booking:bk1';

const mkVisit = (durationMin = 30): VisitInfo => ({
  knownSiteId,
  label: 'BOK-1 · Klient',
  durationMin,
  end: null,
  centre: { lat: 0, lng: 0 } as any,
  nearestKnownSite: null,
  unmatchReason: null,
  pingCount: 5,
  avgAccuracy: 10,
});

const visit = (at: string, until: string | null, ongoing: boolean, opts: Partial<{ departed_at: string }> = {}): ActualEvent => ({
  id: `v:${at}`,
  kind: 'gps_visit',
  at,
  until: until ?? undefined,
  label: '',
  place: null,
  durationMin: 30,
  meta: { placeKey, ongoing, departed_at: opts.departed_at ?? null },
} as any);

const timer = (kind: 'timer_started' | 'timer_stopped', at: string): ActualEvent => ({
  id: `t:${kind}:${at}`,
  kind,
  at,
  label: '',
  place: null,
  durationMin: 0,
  meta: { placeKey },
} as any);

const visitMap = new Map<string, VisitInfo>([[placeKey, mkVisit()]]);

describe('buildProjectBlocks — timer per tidsfönster', () => {
  it('två besök, timer endast i besök 1 → endast besök 1 har hasTimer', () => {
    const events: ActualEvent[] = [
      visit('2026-05-06T08:00:00Z', '2026-05-06T09:00:00Z', false, { departed_at: '2026-05-06T09:00:00Z' }),
      timer('timer_started', '2026-05-06T08:05:00Z'),
      timer('timer_stopped', '2026-05-06T08:55:00Z'),
      visit('2026-05-06T13:00:00Z', '2026-05-06T14:00:00Z', false, { departed_at: '2026-05-06T14:00:00Z' }),
    ];
    const blocks = buildProjectBlocks({ events, visitByKey: visitMap, plannedTargetIds: new Set(), workdayStartedIso: null });
    expect(blocks).toHaveLength(2);
    expect(blocks[0].hasTimer).toBe(true);
    expect(blocks[0].timerActive).toBe(false);
    expect(blocks[1].hasTimer).toBe(false);
    expect(blocks[1].timerActive).toBe(false);
  });

  it('öppen timer + pågående besök → timerActive=true', () => {
    const events: ActualEvent[] = [
      visit('2026-05-06T08:00:00Z', null, true),
      timer('timer_started', '2026-05-06T08:02:00Z'),
    ];
    const blocks = buildProjectBlocks({ events, visitByKey: visitMap, plannedTargetIds: new Set(), workdayStartedIso: null });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].timerActive).toBe(true);
    expect(blocks[0].hasTimer).toBe(true);
  });

  it('besök utan timer → hasTimer=false', () => {
    const events: ActualEvent[] = [
      visit('2026-05-06T08:00:00Z', '2026-05-06T09:00:00Z', false, { departed_at: '2026-05-06T09:00:00Z' }),
    ];
    const blocks = buildProjectBlocks({ events, visitByKey: visitMap, plannedTargetIds: new Set(), workdayStartedIso: null });
    expect(blocks[0].hasTimer).toBe(false);
    expect(blocks[0].timerActive).toBe(false);
  });
});
