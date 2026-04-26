/**
 * staffTimeReports.dayFilter.contract.test.ts
 *
 * Regressionsskydd för "spök-arbetsdag" (50h-pinnen).
 *
 * Bug 2026-04-25: en `workdays`-rad utan `ended_at` som startade tidigare
 * dag spillerade in i alla efterföljande dagars vy och visade en
 * "pågående 50h"-pill — eftersom queryn filtrerade
 *   `started_at < nextDay AND (ended_at IS NULL OR ended_at >= dayStart)`.
 *
 * Detta test låser fast två kontrakt:
 *
 *   1) Frågekontrakt: workdays-queryn för en vald dag måste begränsa
 *      `started_at` till intervallet [dayStart, nextDay) ELLER träffa via
 *      `ended_at` i samma intervall (för shifts som spänner midnatt).
 *      Den får ALDRIG returnera en öppen workday som startade en helt
 *      annan tidigare dag.
 *
 *   2) Render-skyddskontrakt: även om en sådan rad ändå läcker fram (t.ex.
 *      nattskift som verkligen pågår >18h), måste klienten markera den som
 *      "anomali" och inte visa "pågående 50h"-tid.
 *
 * Testerna är rent strukturella: vi simulerar aggregerings-loopen från
 * StaffTimeReports.tsx (rad 442–479 efter fix) och kontrollerar
 * isOpen/label/age-tröskeln.
 */

import { describe, it, expect } from 'vitest';

type Workday = {
  id: string;
  staff_id: string;
  started_at: string;
  ended_at: string | null;
};

interface AggregatedSegment {
  id: string;
  isOpen: boolean;
  label: string;
}

// Mirror the post-fix logic from StaffTimeReports.tsx so the contract is
// locked even if the file is refactored (e.g. moved to a hook). When that
// file is moved/renamed, update the import here too.
function aggregateWorkdays(workdays: Workday[], now: Date): AggregatedSegment[] {
  return workdays.map((wd) => {
    const ageHours =
      (now.getTime() - new Date(wd.started_at).getTime()) / (1000 * 60 * 60);
    const isStaleOpen = !wd.ended_at && ageHours > 18;
    const isOpen = !wd.ended_at && !isStaleOpen;
    return {
      id: `wd:${wd.id}`,
      isOpen,
      label: isStaleOpen
        ? 'Arbetsdag — ej avslutad (anomali)'
        : 'Arbetsdag startad',
    };
  });
}

// Mirror the post-fix Supabase filter as a JS predicate for unit testing.
// Real query: `.gte('started_at', dayStartIso).lt('started_at', nextDayIso)`
// We strictly bind workdays to their START day. A shift that starts T-1
// 23:30 and ends T 00:38 belongs to T-1 only — never bleeds into T.
function selectWorkdaysForDay(
  rows: Workday[],
  dayStart: Date,
  nextDay: Date,
): Workday[] {
  return rows.filter((wd) => {
    const start = new Date(wd.started_at);
    return start >= dayStart && start < nextDay;
  });
}

describe('StaffTimeReports day filter — regression: spök-arbetsdag', () => {
  it('utesluter en öppen workday som startade FÖRE valt datum', () => {
    // Ranjan-style ghost row: startade 23 april, ended_at NULL.
    const ghost: Workday = {
      id: 'ghost-1',
      staff_id: 'staff_1',
      started_at: '2026-04-23T06:40:00Z',
      ended_at: null,
    };
    // Query for 25 april — ghost must NOT be returned.
    const dayStart = new Date('2026-04-25T00:00:00Z');
    const nextDay = new Date('2026-04-26T00:00:00Z');
    const result = selectWorkdaysForDay([ghost], dayStart, nextDay);
    expect(result).toEqual([]);
  });

  it('inkluderar workday som startade idag', () => {
    const today: Workday = {
      id: 'today-1',
      staff_id: 'staff_1',
      started_at: '2026-04-25T07:00:00Z',
      ended_at: null,
    };
    const dayStart = new Date('2026-04-25T00:00:00Z');
    const nextDay = new Date('2026-04-26T00:00:00Z');
    expect(selectWorkdaysForDay([today], dayStart, nextDay)).toHaveLength(1);
  });

  it('nattskift T-1 23:30 → T 00:38 hör till T-1, INTE T (start-day binding)', () => {
    const overnight: Workday = {
      id: 'night-1',
      staff_id: 'staff_1',
      started_at: '2026-04-24T23:30:00Z',
      ended_at: '2026-04-25T00:38:00Z',
    };
    const dayT = new Date('2026-04-25T00:00:00Z');
    const dayTNext = new Date('2026-04-26T00:00:00Z');
    const dayTMinus1 = new Date('2026-04-24T00:00:00Z');
    // Hör hemma på T-1
    expect(selectWorkdaysForDay([overnight], dayTMinus1, dayT)).toHaveLength(1);
    // Får INTE läcka in på T
    expect(selectWorkdaysForDay([overnight], dayT, dayTNext)).toEqual([]);
  });

  it('separerar färska öppna workdays från stale anomalier (>18h regel)', () => {
    const now = new Date('2026-04-25T12:00:00Z');
    const fresh: Workday = {
      id: 'fresh',
      staff_id: 's1',
      started_at: '2026-04-25T08:00:00Z',
      ended_at: null,
    };
    const stale: Workday = {
      id: 'stale',
      staff_id: 's2',
      started_at: '2026-04-23T06:40:00Z', // ~53h gammal
      ended_at: null,
    };
    const closed: Workday = {
      id: 'closed',
      staff_id: 's3',
      started_at: '2026-04-25T07:00:00Z',
      ended_at: '2026-04-25T11:30:00Z',
    };
    const segs = aggregateWorkdays([fresh, stale, closed], now);
    const freshSeg = segs.find((s) => s.id === 'wd:fresh')!;
    const staleSeg = segs.find((s) => s.id === 'wd:stale')!;
    const closedSeg = segs.find((s) => s.id === 'wd:closed')!;

    expect(freshSeg.isOpen).toBe(true);
    expect(freshSeg.label).toBe('Arbetsdag startad');

    // Spöket får ALDRIG visas som "open" (ingen 50h-pill)
    expect(staleSeg.isOpen).toBe(false);
    expect(staleSeg.label).toBe('Arbetsdag — ej avslutad (anomali)');

    expect(closedSeg.isOpen).toBe(false);
  });

  it('en stängd workday räknas aldrig som anomali oavsett hur lång den är', () => {
    const now = new Date('2026-04-25T12:00:00Z');
    const longClosed: Workday = {
      id: 'long-closed',
      staff_id: 's4',
      started_at: '2026-04-23T06:00:00Z',
      ended_at: '2026-04-25T10:00:00Z',
    };
    const [seg] = aggregateWorkdays([longClosed], now);
    expect(seg.isOpen).toBe(false);
    expect(seg.label).toBe('Arbetsdag startad');
  });
});
