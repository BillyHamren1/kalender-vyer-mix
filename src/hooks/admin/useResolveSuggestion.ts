import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dayTimelineQueryKey } from "@/hooks/admin/useDayTimeline";

export type ResolveAction =
  | "accept"
  | "ignore"
  | "mark_travel"
  | "mark_unclear"
  | "move_to_other_site";

export interface ResolveVars {
  suggestionId: string;
  action: ResolveAction;
  staffId: string;
  date: string;
  payload?: Record<string, unknown>;
}

const ACTION_SUCCESS_LABELS: Record<ResolveAction, string> = {
  accept: "Förslag accepterat",
  ignore: "Förslag ignorerat",
  mark_travel: "Markerat som restid",
  mark_unclear: "Markerat som oklar tid",
  move_to_other_site: "Tid flyttad till annan plats",
};

export function useResolveSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: ResolveVars) => {
      const { data, error } = await supabase.functions.invoke("day-timeline-engine", {
        body: {
          action: "resolve_suggestion",
          resolve_action: vars.action,
          suggestion_id: vars.suggestionId,
          payload: vars.payload ?? {},
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_data, vars) => {
      toast.success(ACTION_SUCCESS_LABELS[vars.action]);
      qc.invalidateQueries({ queryKey: dayTimelineQueryKey(vars.staffId, vars.date) });
      // Time reports / travel logs may have changed — invalidate broad keys
      qc.invalidateQueries({ queryKey: ["staff-time-reports-detail"] });
      qc.invalidateQueries({ queryKey: ["time_reports"] });
      qc.invalidateQueries({ queryKey: ["travel_time_logs"] });
      qc.invalidateQueries({ queryKey: ["workday_flags"] });
    },
    onError: (err: Error) => {
      toast.error(`Kunde inte uppdatera förslaget: ${err.message ?? "okänt fel"}`);
    },
  });
}
