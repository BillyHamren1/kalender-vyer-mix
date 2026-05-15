// projectDateAuthority — frontend-fasad mot edge function `apply-project-dates`.
// Detta är den ENDA vägen för UI att skriva projekt-datum (medium + large).
// Skriv aldrig direkt till bookings.{phase}date eller calendar_events från UI längre.
//
// Flow: UI → writeProjectDates() → edge → (lokal UPDATE + extern push + calendar rebuild)

import { supabase } from '@/integrations/supabase/client';

export type Phase = 'rig' | 'event' | 'rigDown';

export interface WriteProjectDatesInput {
  projectId: string;
  projectType: 'medium' | 'large';
  organizationId: string;
  /** Per fas: full lista av YYYY-MM-DD som projektet vill att alla sub-bookings ska ha. */
  dates: Partial<Record<Phase, string[]>>;
}

export interface WriteProjectDatesResult {
  ok: boolean;
  results: Array<{
    booking_id: string;
    local_updated: boolean;
    external_pushed: boolean;
    external_status: number;
    calendar_rebuilt: boolean;
    error?: string;
  }>;
  error?: string;
}

export async function writeProjectDates(
  input: WriteProjectDatesInput,
): Promise<WriteProjectDatesResult> {
  const { data, error } = await supabase.functions.invoke('apply-project-dates', {
    body: {
      project_id: input.projectId,
      project_type: input.projectType,
      organization_id: input.organizationId,
      dates: input.dates,
    },
  });

  if (error) {
    return { ok: false, results: [], error: error.message };
  }
  return data as WriteProjectDatesResult;
}
