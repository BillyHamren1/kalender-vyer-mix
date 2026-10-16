import { describe, expect, it } from 'vitest';
import { buildDayLanes, isTodoOnDay } from '@/lib/warehouse/warehouseDayBoard';

const day = '2026-10-16';
const job = (o: Partial<any>): any => ({ id: 'j', direction: 'out', status: 'planning', anchorDate: null, startDate: null, endDate: null, assignedStaff: [], ...o });
const todo = (o: Partial<any>) => ({ id: 't', typeKey: 'warehouse_task', scheduledDate: day, planningStatus: 'needs_planning', ...o });

describe('lagrets dagstavla', () => {
  it('lägger utleveranser i packning och returer i returer', () => {
    const l = buildDayLanes([job({ id: 'a', anchorDate: day }), job({ id: 'b', direction: 'in', anchorDate: day })], [], day);
    expect(l.packing.jobs.map((j) => j.id)).toEqual(['a']);
    expect(l.returns.jobs.map((j) => j.id)).toEqual(['b']);
  });
  it('visar inte jobb från andra dagar', () => {
    const l = buildDayLanes([job({ anchorDate: '2026-10-17' })], [], day);
    expect(l.packing.jobs).toHaveLength(0);
  });
  it('lägger reparation & vård i eget fack och övriga to-dos i interna', () => {
    const l = buildDayLanes([], [todo({ id: 'r', typeKey: 'repair_care' }), todo({ id: 'i' })], day);
    expect(l.repairs.todos.map((t) => t.id)).toEqual(['r']);
    expect(l.internal.todos.map((t) => t.id)).toEqual(['i']);
  });
  it('visar odaterade obemannade to-dos (t.ex. från Brain) varje dag', () => {
    expect(isTodoOnDay(todo({ scheduledDate: null }), day)).toBe(true);
    expect(isTodoOnDay(todo({ scheduledDate: null, planningStatus: 'completed' }), day)).toBe(false);
    expect(isTodoOnDay(todo({ planningStatus: 'cancelled' }), day)).toBe(false);
  });
});
