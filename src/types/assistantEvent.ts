/**
 * AssistantEvent — failproof event-/resolution-modell för geofence-hjälparen.
 *
 * Källa: tabellen `assistant_events`. Steg 1 av fasad rollout — körs parallellt
 * med arrival_prompt_log. Vägen läses/skrivs via edge function `assistant-events`.
 *
 * Designprinciper:
 *   - Varje arrival/departure/home_arrival är en SEPARAT rad (inte "senaste").
 *   - stale_for_prompt vs still_relevant_for_review — data tappas aldrig.
 *   - suggested_action driver ENDAST UI:t. Den utför inga åtgärder.
 *   - resolution_status täcker alla utfall (incl. merged/auto_closed/stale).
 */

export type AssistantEventType =
  | 'arrival'
  | 'departure'
  | 'home_arrival'
  | 'travel_edge';

export type AssistantEventTargetType =
  | 'location'
  | 'project'
  | 'booking'
  | 'home'
  | 'unknown';

export type AssistantEventSource =
  | 'geofence_foreground'
  | 'geofence_background'
  | 'app_manual'
  | 'system_inferred'
  | 'cron';

export type AssistantEventSuggestedAction =
  | 'start_workday'
  | 'start_activity'
  | 'end_activity'
  | 'end_workday'
  | 'register_travel'
  | 'review_only';

export type AssistantEventResolution =
  | 'pending'
  | 'applied_from_event_time'
  | 'applied_from_now'
  | 'applied_from_custom_time'
  | 'dismissed'
  | 'merged_into_other_event'
  | 'auto_closed_by_later_action'
  | 'ignored_stale';

export interface AssistantEvent {
  id: string;
  organization_id: string;
  staff_id: string;

  event_type: AssistantEventType;
  target_type: AssistantEventTargetType;
  target_id: string | null;
  target_label: string | null;
  target_address: string | null;

  happened_at: string;   // ISO
  detected_at: string;   // ISO
  source: AssistantEventSource;

  suggested_action: AssistantEventSuggestedAction;

  stale_for_prompt: boolean;
  still_relevant_for_review: boolean;

  resolution_status: AssistantEventResolution;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;

  linked_workday_id: string | null;
  linked_time_report_id: string | null;
  linked_travel_log_id: string | null;
  merged_into_event_id: string | null;

  dedupe_key: string | null;
  metadata: Record<string, unknown>;

  created_at: string;
  updated_at: string;
}

export interface CreateAssistantEventInput {
  event_type: AssistantEventType;
  target_type: AssistantEventTargetType;
  target_id?: string | null;
  target_label?: string | null;
  target_address?: string | null;
  happened_at?: string; // default = now
  source?: AssistantEventSource;
  suggested_action?: AssistantEventSuggestedAction;
  metadata?: Record<string, unknown>;
}

export interface ResolveAssistantEventInput {
  event_id: string;
  resolution_status: Exclude<AssistantEventResolution, 'pending'>;
  resolution_notes?: string;
  linked_workday_id?: string;
  linked_time_report_id?: string;
  linked_travel_log_id?: string;
  merged_into_event_id?: string;
  /** true = behåll i review-listan trots resolved (default: false) */
  keep_for_review?: boolean;
}
