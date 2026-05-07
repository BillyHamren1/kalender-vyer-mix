// @ts-nocheck
/**
 * processStaffLocationUpdate
 * ────────────────────────────────────────────────────────────────────────────
 * Bryggan mellan en GPS-batch som just landat i staff_location_history och
 * den server-driven backendkedjan som omsätter pings till arbetsdagsstate.
 *
 * Anropas direkt från `mobile-app-api :: handleUploadLocationBatch` efter att
 * pings sparats, så att GPS-uppladdning INTE längre är passiv.
 *
 * Per (staff, date) gör den följande, alltid på server-sidan:
 *   1. Avbryt om dagen är låst/attesterad (audit "skipped_locked").
 *   2. Anropa `process-location-auto-start` i mode=backfill_day, dry_run=false,
 *      scoped till (staff_id, organization_id, date) — det är samma engine
 *      som cron och scenario-testerna kör. Den:
 *        • laddar pings för dagen,
 *        • laddar targets (warehouse / booking / large_project),
 *        • avgör arrival/exit/switch via stable-entry,
 *        • stänger föregående aktiva LTE vid bekräftat platsbyte,
 *        • skapar transportsegment via travel_time_logs,
 *        • öppnar ny LTE och triggar ev. workday-skapande.
 *   3. Logga decision (rule_engine) i staff_day_decision_log.
 *   4. Köa en day-snapshot rebuild (staff_day_rebuild_queue) med reason
 *      "late_ping" så day-timeline-engine räknar om dagen.
 *
 * VIKTIGT — appen ska INTE själv klassa platsbyten längre.
 * Funktionen är fire-and-forget från mobil-API:t (await:ad men felsäker —
 * får aldrig kasta upp i upload-flödet).
 */

import {
  enqueueDayRebuild,
  isDayLocked,
  logDayDecision,
} from "./day-decision-audit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface ProcessLocationUpdateArgs {
  staffId: string;
  organizationId: string;
  /** YYYY-MM-DD list of dates touched by the batch. */
  dates: string[];
  /** Source tag for audit trail. */
  source?: string;
}

export interface ProcessLocationUpdateResult {
  date: string;
  locked: boolean;
  ok: boolean;
  engine_status?: number;
  engine_report?: any;
  errors: string[];
}

/**
 * Process one staff for one or more affected dates. Never throws.
 */
export async function processStaffLocationUpdate(
  supabase: any,
  args: ProcessLocationUpdateArgs,
): Promise<ProcessLocationUpdateResult[]> {
  const out: ProcessLocationUpdateResult[] = [];
  const dates = Array.from(new Set(args.dates)).sort();
  if (dates.length === 0) return out;

  for (const date of dates) {
    const result: ProcessLocationUpdateResult = {
      date,
      locked: false,
      ok: false,
      errors: [],
    };

    try {
      const lock = await isDayLocked(supabase, {
        staffId: args.staffId,
        dayDate: date,
      });

      if (lock.locked) {
        result.locked = true;
        await logDayDecision(supabase, {
          organizationId: args.organizationId,
          staffId: args.staffId,
          dayDate: date,
          actor: "rule_engine",
          action: "location_update_skipped_locked",
          reason: lock.reason ?? "day_locked",
          sourceFunction: "processStaffLocationUpdate",
        });
        out.push(result);
        continue;
      }

      // Run the canonical auto-start engine in live mode, scoped to this
      // single (staff, date). The engine owns ALL location→state transitions:
      // arrival/exit/switch/travel/workday. App logic must never duplicate
      // these decisions.
      const url = `${SUPABASE_URL}/functions/v1/process-location-auto-start`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          mode: "backfill",
          dry_run: false,
          confirm: true,
          date,
          staff_id: args.staffId,
          organization_id: args.organizationId,
        }),
      });
      result.engine_status = resp.status;
      let body: any = null;
      try { body = await resp.json(); } catch { /* ignore */ }
      result.engine_report = body?.report ?? null;

      if (!resp.ok) {
        result.errors.push(`engine_${resp.status}: ${body?.error ?? ""}`);
      } else {
        result.ok = true;
      }

      // Audit: log what the engine returned so admin kan see varför dagen
      // ändrades av en GPS-uppladdning.
      await logDayDecision(supabase, {
        organizationId: args.organizationId,
        staffId: args.staffId,
        dayDate: date,
        actor: "rule_engine",
        action: result.ok ? "location_update_processed" : "location_update_failed",
        reason: args.source ?? "upload_location_batch",
        after: {
          engine_status: result.engine_status,
          report: result.engine_report,
          errors: result.errors,
        },
        sourceFunction: "processStaffLocationUpdate",
      });

      // Always rebuild the day snapshot — even when no LTE changed, a fresh
      // ping may move arrival timing, gap classification, or travel inference.
      await enqueueDayRebuild(supabase, {
        organizationId: args.organizationId,
        staffId: args.staffId,
        dayDate: date,
        reason: "late_ping",
        requestedBy: "processStaffLocationUpdate",
      });
    } catch (err: any) {
      console.warn(
        "[processStaffLocationUpdate] day failed",
        { staffId: args.staffId, date, err: err?.message ?? err },
      );
      result.errors.push(err?.message ?? String(err));
      try {
        await logDayDecision(supabase, {
          organizationId: args.organizationId,
          staffId: args.staffId,
          dayDate: date,
          actor: "rule_engine",
          action: "location_update_failed",
          reason: err?.message ?? "unknown",
          sourceFunction: "processStaffLocationUpdate",
        });
      } catch { /* swallow */ }
    }

    out.push(result);
  }

  return out;
}
