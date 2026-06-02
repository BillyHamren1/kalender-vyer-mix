import { describe, it, expect } from 'vitest';
import { allocateTravelToProjects } from '../allocateTravelToProjects';
import type { StaffDaySegment } from '../staffDayTimeline';

function seg(partial: Partial<StaffDaySegment> & Pick<StaffDaySegment, 'id' | 'kind' | 'startIso'>): StaffDaySegment {
  return {
    endIso: partial.endIso ?? null,
    durationMin: partial.durationMin ?? 30,
    label: partial.label ?? partial.id,
    subtitle: partial.subtitle ?? null,
    ongoing: false,
    reviewRequired: false,
    sourceBlockId: partial.sourceBlockId ?? partial.id,
    payable: partial.kind === 'project' || partial.kind === 'warehouse' || partial.kind === 'travel',
    ...partial,
  } as StaffDaySegment;
}

describe('allocateTravelToProjects', () => {
  it('travel före första jobb → travel_to_first_job, ärver destination', () => {
    const segments = [
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T07:20:00Z', durationMin: 44 }),
      seg({ id: 'p1', kind: 'project', startIso: '2026-06-02T08:04:00Z', label: 'Swedish Game Fair', sourceBlockId: 'block-p1' }),
    ];
    const out = allocateTravelToProjects(segments);
    expect(out[0].travelAllocationReason).toBe('travel_to_first_job');
    expect(out[0].travelBelongsToProjectName).toBe('Swedish Game Fair');
    expect(out[0].travelBelongsToProjectId).toBe('block-p1');
  });

  it('travel mellan två jobb → allokeras på destination', () => {
    const segments = [
      seg({ id: 'p1', kind: 'project', startIso: '2026-06-02T08:00:00Z', label: 'FA Warehouse', sourceBlockId: 'b1' }),
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T10:00:00Z', durationMin: 30 }),
      seg({ id: 'p2', kind: 'project', startIso: '2026-06-02T10:30:00Z', label: 'Swedish Game Fair', sourceBlockId: 'b2' }),
    ];
    const out = allocateTravelToProjects(segments);
    expect(out[1].travelAllocationReason).toBe('travel_between_jobs_allocated_to_destination');
    expect(out[1].travelBelongsToProjectName).toBe('Swedish Game Fair');
  });

  it('travel efter sista jobb (ej hem) → travel_after_last_job', () => {
    const segments = [
      seg({ id: 'p1', kind: 'project', startIso: '2026-06-02T08:00:00Z', label: 'Swedish Game Fair', sourceBlockId: 'b1' }),
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T20:00:00Z', durationMin: 49, subtitle: 'Swedish Game Fair → Lager' }),
    ];
    const out = allocateTravelToProjects(segments);
    expect(out[1].travelAllocationReason).toBe('travel_after_last_job_allocated_to_last_job');
    expect(out[1].travelBelongsToProjectName).toBe('Swedish Game Fair');
  });

  it('travel efter sista jobb mot "hem" → privat, ingen allokering', () => {
    const segments = [
      seg({ id: 'p1', kind: 'project', startIso: '2026-06-02T08:00:00Z', label: 'Projekt A', sourceBlockId: 'b1' }),
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T20:00:00Z', durationMin: 35 }),
    ];
    const blocks = new Map<string, any>([
      ['t1', { kind: 'journey', id: 't1', toPlace: { label: 'Hem' }, toLabel: 'Hem' }],
    ]);
    const out = allocateTravelToProjects(segments, blocks);
    expect(out[1].travelAllocationReason).toBe('travel_to_private_not_allocated');
    expect(out[1].travelBelongsToProjectId).toBeNull();
  });

  it('endast travel, inget arbete → unresolved + reviewRequired', () => {
    const segments = [
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T07:00:00Z', durationMin: 20 }),
      seg({ id: 't2', kind: 'travel', startIso: '2026-06-02T18:00:00Z', durationMin: 25 }),
    ];
    const out = allocateTravelToProjects(segments);
    expect(out[0].travelAllocationReason).toBe('unresolved_travel_allocation');
    expect(out[0].reviewRequired).toBe(true);
    expect(out[1].travelAllocationReason).toBe('unresolved_travel_allocation');
  });

  it('ändrar inte kind eller duration', () => {
    const segments = [
      seg({ id: 't1', kind: 'travel', startIso: '2026-06-02T07:00:00Z', durationMin: 30 }),
      seg({ id: 'p1', kind: 'project', startIso: '2026-06-02T07:30:00Z', label: 'X', sourceBlockId: 'b1' }),
    ];
    const out = allocateTravelToProjects(segments);
    expect(out[0].kind).toBe('travel');
    expect(out[0].durationMin).toBe(30);
    expect(out[1].kind).toBe('project');
  });
});
