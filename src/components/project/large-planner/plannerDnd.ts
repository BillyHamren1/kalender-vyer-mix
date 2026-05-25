/**
 * plannerDnd — minimal HTML5 drag/drop-kontrakt för stora projektets interna
 * planerare. Isolerat från personalkalenderns useEventDragDrop.
 *
 * Skriver ALDRIG någonting självt — bara typer + MIME + serialisering.
 * Faktiska uppdateringar går via useLargeProjectPlannerItems.updateItem
 * (→ enbart tabellen large_project_booking_plan_items).
 */

export const PLANNER_DND_MIME = 'application/x-large-project-planner-item';

export interface PlannerDragPayload {
  itemId: string;
  fromDate: string;
  fromStaffId: string | null;
}

export const writeDragPayload = (
  dt: DataTransfer,
  payload: PlannerDragPayload,
): void => {
  try {
    dt.setData(PLANNER_DND_MIME, JSON.stringify(payload));
    // fallback för browsers som kräver "text/plain"
    dt.setData('text/plain', payload.itemId);
    dt.effectAllowed = 'move';
  } catch {
    /* noop */
  }
};

export const readDragPayload = (dt: DataTransfer): PlannerDragPayload | null => {
  try {
    const raw = dt.getData(PLANNER_DND_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlannerDragPayload;
    if (!parsed?.itemId) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const hasPlannerPayload = (dt: DataTransfer | null): boolean => {
  if (!dt) return false;
  return Array.from(dt.types).includes(PLANNER_DND_MIME);
};
