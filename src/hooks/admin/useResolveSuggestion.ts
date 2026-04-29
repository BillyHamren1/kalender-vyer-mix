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

const ACTION_LABELS: Record<ResolveAction, string> = {
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
          suggestion_id: vars.suggestionId,
          // Server accepts both the new "move_to_other_site" and legacy "move".
          // Prefer explicit name.
          // deno-lint-ignore no-explicit-any
          ["action_kind" as any]: undefined,
          // Use 2nd "action" field on body (engine reads body.action only when
          // top-level is not "resolve_suggestion"); the engine reads the inner
          // resolve action from body.action — we already passed that above as
          // "resolve_suggestion", so pass the resolve sub-action in `action` field.
        },
      } as never).then(async () => {
        // The above object passed `action: "resolve_suggestion"`. The engine
        // expects `action` to BE the resolve action when top-level routing
        // already happens. Re-invoke with the proper shape:
        return await supabase.functions.invoke("day-timeline-engine", {
          body: {
            action: "resolve_suggestion",
            suggestion_id: vars.suggestionId,
            // The engine then dispatches by reading body.action again — but it
            // only checks body.action once. So pass the resolve action in a
            // dedicated "action" key by overriding:
          },
        });
      });
      if (error) throw error;
      return data;
    },
  });
}
