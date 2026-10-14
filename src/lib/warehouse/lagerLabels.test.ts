import { describe, expect, it } from 'vitest';
import { dayTimeWindow, resolveAssignmentType, workerActionLabel } from './lagerLabels';
import type { LagerAssignmentItem } from '@/hooks/useLagerAssignments';
const item = (values: Partial<LagerAssignmentItem>) => ({ id: 'a', status: 'planned', ...values }) as LagerAssignmentItem;
describe('warehouse worker labels', () => {
  it('formats summer and winter day windows in Stockholm rather than the device zone', () => {
    expect(dayTimeWindow([item({ start_time: '2026-10-14T06:00:00Z', end_time: '2026-10-14T14:00:00Z' })])).toEqual({ start: '08:00', end: '16:00' });
    expect(dayTimeWindow([item({ start_time: '2026-12-14T06:00:00Z', end_time: '2026-12-14T14:00:00Z' })])).toEqual({ start: '07:00', end: '15:00' });
  });
  it('uses the canonical type without requiring legacy aliases', () => {
    expect(resolveAssignmentType(item({ type: 'internal_task' }))).toBe('internal_task');
  });
  it('only offers completion when a project task can actually be completed', () => {
    expect(workerActionLabel(item({ type: 'internal_task', action: 'complete_task' }))).toBe('Visa uppgift');
    expect(workerActionLabel(item({ type: 'internal_task', action: 'complete_task', project_task_id: 'task-1' }))).toBe('Markera klar');
  });
});
