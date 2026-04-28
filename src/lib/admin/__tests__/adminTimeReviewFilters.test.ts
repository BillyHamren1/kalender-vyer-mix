// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  computeCounts,
  matchesFilter,
  computeEmptyKind,
} from '../adminTimeReviewFilters';
import type { DayReviewRow } from '../timeReviewQueries';
import type { FilterState } from '@/components/admin/time-review/FilterBar';

const baseRow = (overrides: Partial<DayReviewRow> = {}): DayReviewRow => ({
  staffId: 's1',
  staffName: 'Alice',
  staffColor: null,
  date: '2026-04-28',
  workdayId: 'wd-1',
  workdayStart: '2026-04-28T07:00:00.000Z',
  workdayEnd: '2026-04-28T16:00:00.000Z',
  workEntries: [],
  travelSegments: [],
  result: {
    metrics: {
      workdayMinutes: 540,
      reportedActivityMinutes: 540,
      travelMinutes: 0,
      unallocatedMinutes: 0,
      plannedMinutes: 0,
      overtimeVsPlanned: 0,
      lateStartMinutes: 0,
      stayedAfterPlannedEndMinutes: 0,
      openTimerAgeMinutes: 0,
      overlapCount: 0,
      pendingAssistantEventsCount: 0,
    },
    anomalies: [],
    status: 'ok',
  },
  reviewStatus: 'open',
  approvedAt: null,
  approvedBy: null,
  ...overrides,
});

const baseFilter = (overrides: Partial<FilterState> = {}): FilterState => ({
  from: new Date('2026-04-01T00:00:00.000Z'),
  to: new Date('2026-04-30T00:00:00.000Z'),
  staffId: 'all',
  status: 'all',
  anomaly: 'all',
  projectQuery: '',
  ...overrides,
});

describe('computeCounts', () => {
  it('räknar varje status-kategori korrekt', () => {
    const rows = [
      baseRow({ staffId: 's1', reviewStatus: 'approved' }),
      baseRow({ staffId: 's2', workdayEnd: null }), // ongoing
      baseRow({
        staffId: 's3',
        result: { ...baseRow().result, status: 'critical' },
      }), // needsReview
      baseRow({ staffId: 's4' }), // ready to approve (ok + ended + not approved)
    ];
    const c = computeCounts(rows);
    expect(c.total).toBe(4);
    expect(c.ongoing).toBe(1);
    expect(c.needsReview).toBe(1);
    expect(c.readyToApprove).toBe(1);
    expect(c.approved).toBe(1);
  });
});

describe('matchesFilter — status', () => {
  it('filtrerar på "ongoing" — endast pågående dagar', () => {
    const open = baseRow({ workdayEnd: null });
    const closed = baseRow();
    const f = baseFilter({ status: 'ongoing' });
    expect(matchesFilter(open, f)).toBe(true);
    expect(matchesFilter(closed, f)).toBe(false);
  });

  it('filtrerar på "approved"', () => {
    const ap = baseRow({ reviewStatus: 'approved' });
    const op = baseRow({ reviewStatus: 'open' });
    const f = baseFilter({ status: 'approved' });
    expect(matchesFilter(ap, f)).toBe(true);
    expect(matchesFilter(op, f)).toBe(false);
  });

  it('filtrerar på "needsReview" (review_status eller critical engine status)', () => {
    const r1 = baseRow({ reviewStatus: 'needs_review' });
    const r2 = baseRow({ result: { ...baseRow().result, status: 'critical' } });
    const ok = baseRow();
    const f = baseFilter({ status: 'needsReview' });
    expect(matchesFilter(r1, f)).toBe(true);
    expect(matchesFilter(r2, f)).toBe(true);
    expect(matchesFilter(ok, f)).toBe(false);
  });
});

describe('matchesFilter — datumintervall', () => {
  it('utesluter rader utanför från-/till-intervallet', () => {
    const inside = baseRow({ date: '2026-04-15' });
    const before = baseRow({ date: '2026-03-15' });
    const after = baseRow({ date: '2026-05-15' });
    const f = baseFilter({
      from: new Date('2026-04-01T00:00:00.000Z'),
      to: new Date('2026-04-30T00:00:00.000Z'),
    });
    expect(matchesFilter(inside, f)).toBe(true);
    expect(matchesFilter(before, f)).toBe(false);
    expect(matchesFilter(after, f)).toBe(false);
  });
});

describe('matchesFilter — staff & projektfritext', () => {
  it('filtrerar på staffId och fritextsökning på personnamn', () => {
    const alice = baseRow({ staffId: 's1', staffName: 'Alice' });
    const bob = baseRow({ staffId: 's2', staffName: 'Bob' });
    expect(matchesFilter(alice, baseFilter({ staffId: 's1' }))).toBe(true);
    expect(matchesFilter(bob, baseFilter({ staffId: 's1' }))).toBe(false);
    expect(matchesFilter(alice, baseFilter({ projectQuery: 'ali' }))).toBe(true);
    expect(matchesFilter(bob, baseFilter({ projectQuery: 'ali' }))).toBe(false);
  });
});

describe('computeEmptyKind', () => {
  it('returnerar "no-days" när inga rader alls finns', () => {
    expect(computeEmptyKind([], [], baseFilter(), null)).toBe('no-days');
  });

  it('returnerar "no-matches" när filter exkluderar allt', () => {
    const rows = [baseRow()];
    expect(
      computeEmptyKind(rows, [], baseFilter({ status: 'approved' }), null),
    ).toBe('no-matches');
  });

  it('returnerar "all-approved" när alla rader är godkända och inget filter', () => {
    const rows = [baseRow({ reviewStatus: 'approved' })];
    expect(computeEmptyKind(rows, [], baseFilter(), null)).toBe('all-approved');
  });

  it('returnerar "no-anomalies" när inga rader har anomalies och inget filter', () => {
    const rows = [baseRow()];
    expect(computeEmptyKind(rows, [], baseFilter(), null)).toBe('no-anomalies');
  });

  it('returnerar null när det finns synliga rader', () => {
    const rows = [baseRow()];
    expect(computeEmptyKind(rows, rows, baseFilter(), null)).toBeNull();
  });
});
