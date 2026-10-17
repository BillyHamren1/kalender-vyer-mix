/**
 * Dagstavla för lagret: fördelar dagens jobb och lager-to-dos i fyra fack.
 * Ren funktion – ingen datahämtning. Packning/retur kommer från WMS-packningar
 * (useWarehouseOpsRange), reparation/interna uppgifter från todos (calendar_scope='warehouse').
 */
export type WarehouseLane = 'packing' | 'returns' | 'repairs' | 'internal';

export interface DayJobLike {
  id: string;
  direction: 'out' | 'in' | 'internal';
  status: string;
  anchorDate: string | null;
  startDate: string | null;
  endDate: string | null;
  assignedStaff: { assignmentDate: string }[];
}

export interface DayTodoLike {
  id: string;
  typeKey: string | null;
  scheduledDate: string | null;
  planningStatus: string;
}

const DONE = new Set(['completed', 'done', 'completed_in', 'completed_out']);

/**
 * Ett jobb hör till en dag endast om det är dess egen packnings-/returdag
 * (anchorDate) eller om personal är bemannad på jobbet just den dagen.
 * Bokningens hela spann (rigg→nedrigg) räknas INTE — då hamnade samma
 * bokning i både packning och retur varje dag under eventet.
 */
export function isJobOnDay(job: DayJobLike, day: string): boolean {
  if (job.anchorDate === day) return true;
  return !DONE.has(job.status) && job.assignedStaff.some((a) => a.assignmentDate === day);
}

export function laneForJob(job: DayJobLike): WarehouseLane {
  if (job.direction === 'in') return 'returns';
  if (job.direction === 'internal') return 'internal';
  return 'packing';
}

export function laneForTodo(todo: DayTodoLike): WarehouseLane {
  return todo.typeKey === 'repair_care' ? 'repairs' : 'internal';
}

/** Obemannade/odaterade to-dos i lagrets kö visas alltid, så externa uppgifter inte försvinner. */
export function isTodoOnDay(todo: DayTodoLike, day: string): boolean {
  if (todo.planningStatus === 'cancelled') return false;
  if (!todo.scheduledDate) return todo.planningStatus !== 'completed';
  return todo.scheduledDate === day;
}

export function buildDayLanes<J extends DayJobLike, T extends DayTodoLike>(jobs: J[], todos: T[], day: string) {
  const lanes: Record<WarehouseLane, { jobs: J[]; todos: T[] }> = {
    packing: { jobs: [], todos: [] },
    returns: { jobs: [], todos: [] },
    repairs: { jobs: [], todos: [] },
    internal: { jobs: [], todos: [] },
  };
  for (const job of jobs) if (isJobOnDay(job, day)) lanes[laneForJob(job)].jobs.push(job);
  for (const todo of todos) if (isTodoOnDay(todo, day)) lanes[laneForTodo(todo)].todos.push(todo);
  return lanes;
}
