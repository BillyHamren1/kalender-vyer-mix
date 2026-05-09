import { supabase } from '@/integrations/supabase/client';
import type { ConsolidationSource } from './projectConsolidationService';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

/**
 * Given a calendar event, resolve which project it belongs to so that the
 * "Konsolidera"-flödet can pre-select it. Order:
 *   1) extendedProps.largeProjectId (large project tile)
 *   2) booking → bookings.large_project_id
 *   3) booking → bookings.assigned_project_id (medium)
 *   4) booking → jobs.id (small)
 */
export async function resolveEventConsolidationSource(
  event: CalendarEvent,
): Promise<ConsolidationSource | null> {
  const ext: any = event.extendedProps || {};
  if (ext.largeProjectId) return { type: 'large', id: ext.largeProjectId };

  const bookingId: string | undefined =
    event.bookingId || ext.bookingId || ext.booking_id;
  if (!bookingId) return null;

  const { data: b } = await supabase
    .from('bookings')
    .select('large_project_id, assigned_project_id')
    .eq('id', bookingId)
    .maybeSingle();

  if (b?.large_project_id) return { type: 'large', id: b.large_project_id };
  if (b?.assigned_project_id) {
    // Could be medium or large — verify
    const { data: lp } = await supabase
      .from('large_projects')
      .select('id')
      .eq('id', b.assigned_project_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (lp) return { type: 'large', id: lp.id };

    const { data: med } = await supabase
      .from('projects')
      .select('id')
      .eq('id', b.assigned_project_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (med) return { type: 'medium', id: med.id };
  }

  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('booking_id', bookingId)
    .is('deleted_at', null)
    .maybeSingle();
  if (job) return { type: 'small', id: job.id };

  return null;
}
