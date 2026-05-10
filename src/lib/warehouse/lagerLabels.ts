/**
 * UI labels + CTA helpers for normalized warehouse_assignments.
 *
 * Keeps swedish labels and per-action CTA copy in one place so the
 * Lager day card, the Lager detail page and any future surfaces stay
 * consistent.
 */
import type { LagerAssignmentItem } from '@/hooks/useLagerAssignments';

export type AssignmentType = NonNullable<LagerAssignmentItem['assignment_type']>;
export type AssignmentAction = NonNullable<LagerAssignmentItem['action']>;

export const ASSIGNMENT_TYPE_LABEL: Record<AssignmentType | 'other', string> = {
  packing: 'Packning',
  return: 'Retur',
  inventory: 'Inventering',
  internal_task: 'Intern uppgift',
  other: 'Lageruppgift',
};

export const ASSIGNMENT_ACTION_LABEL: Record<AssignmentAction, string> = {
  open_scanner: 'Starta scanner',
  open_return_scanner: 'Starta returscanning',
  open_inventory: 'Öppna inventering',
  complete_task: 'Markera klar',
  open_details: 'Visa detaljer',
};

export const ASSIGNMENT_TYPE_TONE: Record<AssignmentType | 'other', string> = {
  packing: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30',
  return: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
  inventory: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30',
  internal_task: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  other: 'bg-muted text-muted-foreground border-border',
};

/** Resolve assignment_type, falling back to event_type from legacy rows. */
export function resolveAssignmentType(item: LagerAssignmentItem): AssignmentType | 'other' {
  const t = item.assignment_type ?? (item.event_type as AssignmentType | undefined);
  switch (t) {
    case 'packing':
    case 'return':
    case 'inventory':
    case 'internal_task':
      return t;
    default:
      return 'other';
  }
}

export function resolveAction(item: LagerAssignmentItem): AssignmentAction {
  if (item.action) return item.action;
  switch (resolveAssignmentType(item)) {
    case 'packing':
      return 'open_scanner';
    case 'return':
      return 'open_return_scanner';
    case 'inventory':
      return 'open_inventory';
    case 'internal_task':
      return 'complete_task';
    default:
      return 'open_details';
  }
}

/** Display title — never "Okänd plats" if we have any meaningful info. */
export function resolveTitle(item: LagerAssignmentItem): string {
  if (item.title && item.title.trim().length > 0 && item.title !== 'Okänd plats') {
    return item.title;
  }
  if (item.customer_name) return item.customer_name;
  if (item.delivery_address) return item.delivery_address;
  if (resolveAssignmentType(item) === 'internal_task') return 'Intern lageruppgift';
  return 'Lageruppgift utan adress';
}

/** Build a short "Packning, retur och intern uppgift"-style status line. */
export function summarizeTypes(items: LagerAssignmentItem[]): string {
  const counts = new Map<AssignmentType | 'other', number>();
  for (const it of items) {
    const t = resolveAssignmentType(it);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const labels = Array.from(counts.keys()).map((t) => ASSIGNMENT_TYPE_LABEL[t].toLowerCase());
  if (labels.length === 0) return '';
  if (labels.length === 1) return capitalize(labels[0]);
  if (labels.length === 2) return capitalize(`${labels[0]} och ${labels[1]}`);
  const last = labels.pop();
  return capitalize(`${labels.join(', ')} och ${last}`);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** First start → last end. Empty strings if nothing parseable. */
export function dayTimeWindow(items: LagerAssignmentItem[]): { start: string; end: string } {
  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const it of items) {
    const s = it.start_time ? new Date(it.start_time).getTime() : NaN;
    const e = it.end_time ? new Date(it.end_time).getTime() : NaN;
    if (!Number.isNaN(s)) minStart = Math.min(minStart, s);
    if (!Number.isNaN(e)) maxEnd = Math.max(maxEnd, e);
  }
  const fmt = (ms: number) =>
    Number.isFinite(ms)
      ? new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
      : '';
  return { start: fmt(minStart), end: fmt(maxEnd) };
}
