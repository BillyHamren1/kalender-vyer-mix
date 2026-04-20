/**
 * ArrivalTarget — UNIFIED arrival contract.
 *
 * The arrival flow used to be split three ways (fixed locations got server
 * presence rows, projects/bookings got a local-only prompt, and the
 * polling/cron only knew about locations). That split is gone.
 *
 * Every arrival — to a Lager, a large project, or a normal booking — is
 * represented by this single shape, both on the wire (mobile-app-api) and
 * in the UI (ArrivalPromptDialog, useArrivalPrompt, useGeofencing).
 *
 * Contract:
 *   * `kind` is the only allowed branch in target-aware code.
 *   * `target_id` references the row in the corresponding table:
 *       - location → organization_locations.id
 *       - project  → large_projects.id
 *       - booking  → bookings.id
 *   * `label` is the human-readable workplace name shown in the prompt.
 *   * `arrived_at` is the ISO timestamp the system saw the user arrive.
 *
 * NOTE: Keep this file dependency-free so server (Deno) tests can mirror
 * the same vocabulary without dragging React/types into Deno.
 */
export type ArrivalTargetKind = 'location' | 'project' | 'booking';

export interface ArrivalTarget {
  kind: ArrivalTargetKind;
  target_id: string;
  label: string;
  arrived_at: string; // ISO
  address?: string | null;
}

/** Server-side arrival prompt state — same shape for all three kinds. */
export interface ArrivalState {
  should_prompt: boolean;
  target: ArrivalTarget | null;
  prompts_sent: number;
  /**
   * @deprecated Legacy fields kept for the (now-soft-removed) location-only
   * polling path. New code MUST read `target` instead.
   */
  arrived_at?: string | null;
  location_id?: string | null;
  location_name?: string | null;
}
