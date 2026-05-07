/**
 * day-decision-audit.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Append-only audit log för alla beslut som påverkar en personals dag eller
 * tidrapport. Skrivs av edge functions med service_role.
 *
 * Actor-typer:
 *   rule_engine  – regelmotor (geofence, planning, watchdog regler)
 *   ai           – AI-analys (analyze-unclear-segment m.fl.)
 *   user         – personalen själv (attestera, klassificera, etc.)
 *   admin        – admin/projekt-roll (manuell justering, override)
 *   watchdog     – auto-stäng workday/timer cron
 *   system       – övrig systemkörning
 */

export type DecisionActor =
  | "rule_engine"
  | "ai"
  | "user"
  | "admin"
  | "watchdog"
  | "system";

export interface DecisionLogInput {
  organizationId: string;
  staffId: string;
  dayDate: string; // YYYY-MM-DD
  segmentId?: string | null;
  actor: DecisionActor;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  confidence?: number | null;
  sourceFunction?: string;
}

/**
 * Append a single decision row. Never throws — audit failures must not break
 * the calling business logic.
 */
export async function logDayDecision(
  supabase: any,
  input: DecisionLogInput,
): Promise<{ id: string | null }> {
  try {
    const { data, error } = await supabase
      .from("staff_day_decision_log")
      .insert({
        organization_id: input.organizationId,
        staff_id: input.staffId,
        day_date: input.dayDate,
        segment_id: input.segmentId ?? null,
        actor: input.actor,
        action: input.action,
        before: input.before ?? null,
        after: input.after ?? null,
        reason: input.reason ?? null,
        confidence: input.confidence ?? null,
        source_function: input.sourceFunction ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[day-decision-audit] insert failed:", error.message);
      return { id: null };
    }
    return { id: data?.id ?? null };
  } catch (err) {
    console.warn("[day-decision-audit] threw:", err);
    return { id: null };
  }
}

/**
 * Enqueue a rebuild of a staff day. Idempotent — multiple callers writing the
 * same (staff,date) just create a small queue, the worker dedupes on pickup.
 */
export async function enqueueDayRebuild(
  supabase: any,
  input: {
    organizationId: string;
    staffId: string;
    dayDate: string;
    reason: string;
    requestedBy?: string;
  },
): Promise<{ id: string | null }> {
  try {
    const { data, error } = await supabase
      .from("staff_day_rebuild_queue")
      .insert({
        organization_id: input.organizationId,
        staff_id: input.staffId,
        day_date: input.dayDate,
        reason: input.reason,
        requested_by: input.requestedBy ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[day-rebuild-queue] insert failed:", error.message);
      return { id: null };
    }
    return { id: data?.id ?? null };
  } catch (err) {
    console.warn("[day-rebuild-queue] threw:", err);
    return { id: null };
  }
}

/**
 * Check whether a day is locked (attested/approved) — used by both
 * audit-aware writers and rebuildStaffDay to skip automatic mutations.
 */
export async function isDayLocked(
  supabase: any,
  args: { staffId: string; dayDate: string },
): Promise<{ locked: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from("day_attestations")
    .select("status")
    .eq("staff_id", args.staffId)
    .eq("day_date", args.dayDate)
    .maybeSingle();
  if (error) {
    // Fail open — don't block on audit table read errors
    return { locked: false };
  }
  if (!data) return { locked: false };
  const status = String(data.status ?? "").toLowerCase();
  if (["attested", "approved", "locked", "exported"].includes(status)) {
    return { locked: true, reason: `day_attestation_status=${status}` };
  }
  return { locked: false };
}
