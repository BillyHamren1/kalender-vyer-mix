/**
 * @deprecated Do not use in project views.
 *
 * Project views must not read time_reports / location_time_entries /
 * travel_time_logs directly. Use `project_staff_time_cost_lines` via
 * `useProjectReportedTime` / `fetchProjectStaffTimeCostSummaryForTargets`
 * for reported project time.
 *
 * Edge function `get-project-time-summary` får finnas kvar för debug/admin,
 * men FÅR INTE anropas automatiskt från projektvyer.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';


export type ProjectTimeStatus = 'ok' | 'active' | 'review_required' | 'gps_only' | 'missing_workday';

export interface ProjectTimeSourceRow {
  type: 'time_report' | 'lte' | 'travel' | 'gps_suggestion' | 'assistant';
  id: string;
  staff_id: string;
  start_at: string | null;
  end_at: string | null;
  minutes: number;
  status: string;
  source: string;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
}

export interface ProjectTimeStaffRow {
  staff_id: string;
  staff_name: string;
  confirmed_minutes: number;
  active_minutes: number;
  suggested_minutes: number;
  travel_minutes: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  active_timer: boolean;
  status: ProjectTimeStatus;
  source_rows: ProjectTimeSourceRow[];
}

export interface ProjectTimeSummaryResponse {
  target: { project_type: 'booking' | 'large_project' | 'location'; project_id: string };
  summary: {
    confirmed_minutes: number;
    active_minutes: number;
    suggested_minutes: number;
    approved_travel_minutes: number;
    suggested_travel_minutes: number;
    staff_count: number;
    active_staff_count: number;
    review_required_count: number;
  };
  staffRows: ProjectTimeStaffRow[];
  sourceRows: ProjectTimeSourceRow[];
  anomalies: Array<{ kind: string; staffId: string; rowId: string; message: string }>;
}

interface Args {
  projectType: 'booking' | 'large_project' | 'location';
  projectId: string | null;
  from?: string;
  to?: string;
  includeBookingIds?: string[];
}

/**
 * Server-driven projekttid via edge function `get-project-time-summary`.
 * Frontend ska föredra denna framför att räkna lokalt från råtabeller.
 */
export function useGetProjectTimeSummary({ projectType, projectId, from, to, includeBookingIds }: Args) {
  return useQuery<ProjectTimeSummaryResponse | null>({
    queryKey: ['get-project-time-summary', projectType, projectId, from, to, (includeBookingIds ?? []).slice().sort()],
    enabled: !!projectId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!projectId) return null;
      const { data, error } = await supabase.functions.invoke('get-project-time-summary', {
        body: {
          project_type: projectType,
          project_id: projectId,
          from,
          to,
          include_booking_ids: includeBookingIds,
        },
      });
      if (error) throw error;
      return data as ProjectTimeSummaryResponse;
    },
  });
}
