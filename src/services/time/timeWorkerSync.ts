/**
 * Planning → Time realtidsnotis.
 *
 * Så fort Planning/Booking sparar något som påverkar ett uppdrag med tilldelad
 * personal skickar vi hela den aktuella worker-projektionen till Time via den
 * befintliga signerade gränsen (Edge: time-planning-proxy →
 * time-planning-adapter, operation worker.assignments.sync).
 *
 * Klienten skriver ALDRIG i Time. Anropet är fire-and-forget: en misslyckad
 * notis får aldrig fälla användarens spara-flöde — Time hämtar ändå vid nästa
 * pull.
 */
import { supabase } from '@/integrations/supabase/client';

export type TimeWorkerSyncReason =
  | 'booking_fields_changed'
  | 'booking_dates_changed'
  | 'staff_assignment_changed'
  | 'assignment_removed'
  | 'booking_import_applied';

export interface TimeWorkerSyncInput {
  bookingIds?: ReadonlyArray<string | null | undefined>;
  staffIds?: ReadonlyArray<string | null | undefined>;
  reason: TimeWorkerSyncReason;
}

const clean = (values?: ReadonlyArray<string | null | undefined>): string[] =>
  [...new Set((values ?? []).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean))];

export async function pushTimeWorkerAssignments(input: TimeWorkerSyncInput): Promise<void> {
  const bookingIds = clean(input.bookingIds);
  const staffIds = clean(input.staffIds);
  if (!bookingIds.length && !staffIds.length) return;
  try {
    await supabase.functions.invoke('time-planning-proxy', {
      body: {
        operation: 'worker.assignments.push',
        reason: input.reason,
        ...(bookingIds.length ? { bookingIds } : {}),
        ...(staffIds.length ? { staffIds } : {}),
      },
    });
  } catch (error) {
    console.warn('[timeWorkerSync] push failed (non-fatal)', error);
  }
}

/** Fire-and-forget-variant för spara-flöden som inte får vänta. */
export function notifyTimeWorkerAssignments(input: TimeWorkerSyncInput): void {
  void pushTimeWorkerAssignments(input);
}
