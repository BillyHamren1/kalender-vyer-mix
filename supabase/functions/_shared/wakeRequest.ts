// @ts-nocheck
/**
 * wakeRequest.ts
 * ────────────────────────────────────────────────────────────────────────────
 * Shared helper used by `location-update-cron` (and any future caller) to
 * automatically request a fresh GPS sample from a staff device when the
 * backend has detected a stale signal during an active workday.
 *
 * POLICY (2026-05-07):
 *   • Wake requests are per-staff cooldown-bound:
 *       - max 1 per 10 minutes per staff
 *       - max 3 per 60 minutes per staff
 *   • A non-responding device must NOT close the workday or deduct time —
 *     it stays in `signal_stale` (handled by trackingPolicy + UI).
 *   • Every dispatch is recorded in `staff_wake_requests` for audit.
 *   • Wake requests are SILENT (FCM data payload), not user-visible alerts.
 */

const PER_STAFF_COOLDOWN_MIN = 10;
const PER_STAFF_HOURLY_CAP = 3;

export interface MaybeWakeArgs {
  supabase: any;            // service-role client
  staffId: string;
  organizationId: string;
  reason: string;           // e.g. "signal_stale_workday_open"
  silenceMs?: number | null;
  context?: Record<string, unknown>;
  now?: Date;
}

export interface WakeResult {
  dispatched: boolean;
  skippedReason?:
    | "cooldown_10min"
    | "hourly_cap_3"
    | "dispatch_failed"
    | "audit_failed";
  auditId?: string;
}

/**
 * Decide + dispatch + audit a wake request. Idempotent against the
 * cooldown windows: callers may invoke this every cron tick safely.
 */
export async function maybeRequestWake(args: MaybeWakeArgs): Promise<WakeResult> {
  const now = args.now ?? new Date();
  const tenMinAgo = new Date(now.getTime() - PER_STAFF_COOLDOWN_MIN * 60_000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000).toISOString();

  // ── 1. Cooldown check ────────────────────────────────────────────────
  const { data: recent, error: recentErr } = await args.supabase
    .from("staff_wake_requests")
    .select("id, requested_at")
    .eq("staff_id", args.staffId)
    .gte("requested_at", oneHourAgo)
    .order("requested_at", { ascending: false })
    .limit(10);

  if (recentErr) {
    console.warn("[wakeRequest] cooldown query failed:", recentErr.message);
    return { dispatched: false, skippedReason: "audit_failed" };
  }

  const rows = recent ?? [];
  if (rows.some((r: any) => r.requested_at >= tenMinAgo)) {
    return { dispatched: false, skippedReason: "cooldown_10min" };
  }
  if (rows.length >= PER_STAFF_HOURLY_CAP) {
    return { dispatched: false, skippedReason: "hourly_cap_3" };
  }

  // ── 2. Audit row FIRST (claims a slot in the cooldown window) ────────
  const { data: auditRow, error: auditErr } = await args.supabase
    .from("staff_wake_requests")
    .insert({
      organization_id: args.organizationId,
      staff_id: args.staffId,
      reason: args.reason,
      silence_ms: args.silenceMs ?? null,
      source: "location-update-cron",
      dispatch_status: "pending",
      context: args.context ?? {},
    })
    .select("id")
    .single();

  if (auditErr || !auditRow) {
    console.warn("[wakeRequest] audit insert failed:", auditErr?.message);
    return { dispatched: false, skippedReason: "audit_failed" };
  }

  // ── 3. Dispatch through request-location-ping (silent FCM data) ──────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let dispatchOk = false;
  let dispatchInfo: any = null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        staff_ids: [args.staffId],
        title: "Plats-uppdatering",
        body: "Systemet hämtade din position.",
        notification_type: "broadcast",
        data: {
          notification_type: "location_ping",
          reason: args.reason,
          requested_at: now.toISOString(),
          silent: "true",
        },
        organization_id: args.organizationId,
      }),
    });
    dispatchOk = res.ok;
    const txt = await res.text();
    try { dispatchInfo = JSON.parse(txt); } catch { dispatchInfo = { message: txt.slice(0, 200) }; }
    if (!res.ok) {
      console.warn(
        `[wakeRequest] dispatch failed for staff=${args.staffId} status=${res.status}`,
        txt.slice(0, 200),
      );
    } else {
      console.log(
        `[wakeRequest] dispatched staff=${args.staffId} reason=${args.reason} silenceMs=${args.silenceMs ?? "n/a"}`,
      );
    }
  } catch (err) {
    console.warn("[wakeRequest] dispatch threw:", (err as Error).message);
  }

  // ── 4. Update audit row with final status ────────────────────────────
  await args.supabase
    .from("staff_wake_requests")
    .update({
      dispatch_status: dispatchOk ? "dispatched" : "failed",
      context: { ...(args.context ?? {}), dispatch: dispatchInfo },
    })
    .eq("id", auditRow.id);

  return dispatchOk
    ? { dispatched: true, auditId: auditRow.id }
    : { dispatched: false, skippedReason: "dispatch_failed", auditId: auditRow.id };
}
