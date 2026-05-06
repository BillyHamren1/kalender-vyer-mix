// @vitest-environment node
/**
 * StaffDayTimelineBuilder — central byggare. Låser regelverket:
 *  1. workday = huvudram
 *  2. saknas workday + finns starka signaler ⇒ föreslå envelope, review_required
 *  3. gaps fylls som 'unknown' (inte fel)
 *  4. raw rader hamnar i evidence, inte som segments
 */
import { describe, it, expect } from 'vitest';
import { buildStaffDayTimelineFromRaw } from '../StaffDayTimelineBuilder';

const D = '2026-05-06';
const iso = (h: number, m = 0) =>
  `${D}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
const NOW = new Date(`${D}T20:00:00.000Z`);

const base = {
  staff_id: 's1',
  staff_name: 'Anna',
  date: D,
  now: NOW,
};

describe('buildStaffDayTimelineFromRaw — kontrakt', () => {
  it('workday=null + inga signaler ⇒ status=no_workday, inga segments', () => {
    const out = buildStaffDayTimelineFromRaw({ ...base });
    expect(out.status).toBe('no_workday');
    expect(out.segments).toEqual([]);
    expect(out.workday_start).toBeNull();
    expect(out.workday_suggested).toBe(false);
  });

  it('workday-rad är huvudram för dagen', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(16) },
    });
    expect(out.workday_start).toBe(iso(7));
    expect(out.workday_end).toBe(iso(16));
    expect(out.workday_suggested).toBe(false);
  });

  it('saknad workday + starka TR/timer ⇒ workday_suggested=true, review_required', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'Projekt A', category: 'project' },
        { id: 'tr2', start_iso: iso(13), end_iso: iso(17), hours: 4, label: 'Projekt B', category: 'project' },
      ],
    });
    expect(out.workday_suggested).toBe(true);
    expect(out.workday_start).toBe(iso(8));
    expect(out.workday_end).toBe(iso(17));
    expect(out.review_required).toBe(true);
    expect(out.status).toBe('review_required');
  });

  it('time_report mappas till segment och räknas som payable', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'Projekt A', category: 'project' },
      ],
    });
    const tr = out.segments.find((s) => s.id === 'tr:tr1');
    expect(tr?.kind).toBe('project');
    expect(tr?.payable).toBe(true);
    expect(tr?.durationMin).toBe(240);
    expect(out.payable_minutes).toBe(240);
  });

  it('luckor fylls som unknown-segment (inte fel) och kräver review', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'A', category: 'project' },
        { id: 'tr2', start_iso: iso(13), end_iso: iso(16), hours: 3, label: 'B', category: 'project' },
      ],
    });
    const unknowns = out.segments.filter((s) => s.kind === 'unknown');
    expect(unknowns.length).toBeGreaterThan(0);
    expect(unknowns.every((s) => s.reviewRequired && !s.payable)).toBe(true);
  });

  it('travel_log utan destination ⇒ reviewRequired=true, ej payable', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      travelLogs: [
        { id: 't1', start_iso: iso(7), end_iso: iso(8), approved: false },
      ],
    });
    const t = out.segments.find((s) => s.id === 'travel:t1');
    expect(t?.kind).toBe('travel');
    expect(t?.reviewRequired).toBe(true);
    expect(t?.payable).toBe(false);
  });

  it('LTE som redan rapporterats som distribution skippas (ingen dubbel)', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'A', category: 'project' },
      ],
      locationEntries: [
        { id: 'lte1', entered_at: iso(8), exited_at: iso(12), label: 'A', reportedAsDistribution: true },
      ],
    });
    expect(out.segments.find((s) => s.id === 'lte:lte1')).toBeUndefined();
    expect(out.segments.find((s) => s.id === 'tr:tr1')).toBeDefined();
  });

  it('TR vinner över överlappande LTE (dedup)', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'A', category: 'project' },
      ],
      locationEntries: [
        { id: 'lte1', entered_at: iso(9), exited_at: iso(11), label: 'A', presenceOnly: false },
      ],
    });
    expect(out.segments.find((s) => s.id === 'lte:lte1')).toBeUndefined();
  });

  it('råa rader sparas i evidence (inte som segments)', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [{ id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'A', category: 'project' }],
      travelLogs: [{ id: 't1', start_iso: iso(7), end_iso: iso(8), approved: true, destinationBookingId: 'b1' }],
      locationEntries: [{ id: 'lte1', entered_at: iso(13), exited_at: iso(14), label: 'Lager' }],
      assistantEvents: [{ id: 'ae1', at: iso(7), kind: 'arrival' }],
    });
    expect(out.evidence.workdayRowIds).toEqual(['wd1']);
    expect(out.evidence.timeReportIds).toEqual(['tr1']);
    expect(out.evidence.travelLogIds).toEqual(['t1']);
    expect(out.evidence.locationEntryIds).toEqual(['lte1']);
    expect(out.evidence.assistantEventIds).toEqual(['ae1']);
  });

  it('subdivisions ignoreras', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: iso(17) },
      timeReports: [
        { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'A', category: 'project' },
        { id: 'sub', start_iso: iso(8), end_iso: iso(9), hours: 1, label: 'sub', category: 'project', is_subdivision: true },
      ],
    });
    expect(out.segments.find((s) => s.id === 'tr:sub')).toBeUndefined();
  });

  it('öppen workday + ongoing TR (täcker hela ramen) ⇒ status=open', () => {
    const out = buildStaffDayTimelineFromRaw({
      ...base,
      workday: { id: 'wd1', started_at: iso(7), ended_at: null },
      timeReports: [
        { id: 'tr1', start_iso: iso(7), end_iso: null, hours: 0, label: 'A', category: 'project' },
      ],
    });
    expect(out.status).toBe('open');
    expect(out.segments[0].ongoing).toBe(true);
  });

  it('producerar samma typ för alla — fältkontrakt stabilt', () => {
    const out = buildStaffDayTimelineFromRaw({ ...base });
    expect(Object.keys(out).sort()).toEqual([
      'date',
      'evidence',
      'payable_minutes',
      'review_count',
      'review_required',
      'segments',
      'staff_id',
      'staff_name',
      'status',
      'workday_end',
      'workday_start',
      'workday_suggested',
    ]);
  });

  describe('synthetic / auto-origin', () => {
    it('synthetic time_report blir EJ segment, men hamnar i evidence + bumpar review', () => {
      const out = buildStaffDayTimelineFromRaw({
        ...base,
        workday: { id: 'wd1', started_at: iso(7), ended_at: iso(16) },
        timeReports: [
          { id: 'tr1', start_iso: iso(8), end_iso: iso(12), hours: 4, label: 'Auto', synthetic: true, autoOrigin: 'auto_repair' },
        ],
      });
      expect(out.segments.some((s) => s.id === 'tr:tr1')).toBe(false);
      expect(out.evidence.timeReportIds).toContain('tr1');
      expect(out.review_required).toBe(true);
      expect(out.evidence.notes.some((n) => /auto-repair|backfill|system/i.test(n))).toBe(true);
    });

    it('synthetic location_entry (watchdog/clamp) blir EJ segment', () => {
      const out = buildStaffDayTimelineFromRaw({
        ...base,
        workday: { id: 'wd1', started_at: iso(7), ended_at: iso(16) },
        locationEntries: [
          { id: 'l1', entered_at: iso(8), exited_at: iso(12), label: 'Plats', presenceOnly: false, synthetic: true, autoOrigin: 'watchdog' },
        ],
      });
      expect(out.segments.some((s) => s.id === 'lte:l1')).toBe(false);
      expect(out.evidence.locationEntryIds).toContain('l1');
      expect(out.review_required).toBe(true);
    });

    it('workday med autoOrigin är fortfarande envelope (ram), men noteras', () => {
      const out = buildStaffDayTimelineFromRaw({
        ...base,
        workday: { id: 'wd1', started_at: iso(7), ended_at: iso(16), autoOrigin: 'auto_repair' },
      });
      expect(out.workday_start).toBe(iso(7));
      expect(out.workday_end).toBe(iso(16));
      expect(out.review_required).toBe(true);
      expect(out.evidence.notes.some((n) => /auto/i.test(n))).toBe(true);
    });
  });
});
