/**
 * OBS: Det finns INGEN standard-checklista längre.
 * Användaren bygger sin egen "Att göra"-lista per projekt.
 * Den enda automatiska punkten är "Boka transport", som skapas i databasen
 * via triggern `trg_create_default_project_todo` på `projects`.
 *
 * Endast deadline-typen behålls här eftersom `calculateDeadline.ts` använder den.
 */
export interface DeadlineRule {
  type: 'before_rig' | 'before_event' | 'after_rigdown' | 'after_created' | 'on_rig' | 'on_event' | 'on_rigdown';
  days: number;
  asapIfLess?: boolean;
  minMonthsRequired?: number;
}

/** Titeln på den enda automatiskt skapade uppgiften. */
export const DEFAULT_TRANSPORT_TODO_TITLE = 'Boka transport';

/** Titlar som räknas som "boka transport" (inkl. den historiska titeln). */
export const TRANSPORT_TODO_TITLES = ['Boka transport', 'Transportbokning'] as const;

export const isTransportTodoTitle = (title?: string | null): boolean =>
  !!title && (TRANSPORT_TODO_TITLES as readonly string[]).includes(title.trim());
