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
 *   2. Ladda pings för dagen (med liten överlappning).
 *   3. Ladda alla kända targets: warehouse-locations, bookings, large_projects.
 *   4. Kör auto-start-engine.processStaff() i LIVE-läge → arrival/exit/switch
 *      stänger föregående aktiva location_time_entry, skapar
 *      transportsegment via travel_time_logs, öppnar ny LTE och triggar
 *      ev. workday-skapande — exakt samma logik som cron, bara realtidsdriven.
 *   5. Logga decision (rule_engine) i staff_day_decision_log med antal
 *      arrivals/switches/öppnade/stängda LTE:er.
 *   6. Köa en day-snapshot rebuild (staff_day_rebuild_queue) med reason
 *      "late_ping" så day-timeline-engine räknar om dagen.
 *
 * VIKTIGT — appen ska INTE själv klassa platsbyten längre.
 * Funktionen är fire-and-forget från mobil-API:t (await:ad men felsäker —
 * får aldrig kasta upp i upload-flödet).
 */

import {
  loadTargets,
  processStaff,
  ENGINE_VERSION,
  type Ping,
  type ProcessReport,
} from "../process-location-auto-start/engine.ts";
import {
  enqueueDayRebuild,
  isDayLocked,
  logDayDecision,
} from "./day-decision-audit.ts";

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
  pings: number;
  arrivals: number;
  switches: number;
  workdays_opened: number;
  ltes_opened: number;
  ltes_closed: number;
  travels_created: number;
  errors: string[];
}

const DAY_OVERLAP_MS = 30 * 60 * 1000; // grab a bit before/after the date

function emptyReport(): ProcessReport {
  return {
    run_id: globalThis.crypto?.randomUUID?.() ?? `live-${Date.now()}`,
    engine_version: ENGINE_VERSION,
    mode: "cron",
    dry_run: false,
    source_tag: "live_upload",
    staff: 0,
    pings: 0,
    arrivals: 0,
    switches: 0,
    workdays_opened: 0,
    ltes_opened: 0,
    ltes_closed: 0,
    travels_created: 0,
    events_emitted: 0,
    skipped_existing: 0,
    errors: [],
    plan: [],
  };
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

  let targets: any[] = [];
  try {
    targets = await loadTargets(supabase);
  } catch (err) {
    console.warn("[processStaffLocationUpdate] loadTargets failed:", err);
    return out;
  }
  // Scope to the staff's organization.
  targets = targets.filter((t) => t.organization_id === args.organizationId);

  for (const date of dates) {
    const result: ProcessLocationUpdateResult = {
      date,
      locked: false,
      pings: 0,
      arrivals: 0,
      switches: 0,
      workdays_opened: 0,
      ltes_opened: 0,
      ltes_closed: 0,
      travels_created: 0,
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

      const fromIso = new Date(
        new Date(`${date}T00:00:00.000Z`).getTime() - DAY_OVERLAP_MS,
      ).toISOString();
      const toIso = new Date(
        new Date(`${date}T23:59:59.999Z`).getTime() + DAY_OVERLAP_MS,
      ).toISOString();

      // Paginate to bypass PostgREST's 1000-row cap on busy days.
      const PAGE = 1000;
      const HARD_CAP = 5000;
      const rawPings: any[] = [];
      let from = 0;
      while (rawPings.length < HARD_CAP) {
        const { data: page, error } = await supabase
          .from("staff_location_history")
          .select("id, staff_id, organization_id, lat, lng, accuracy, recorded_at")
          .eq("staff_id", args.staffId)
          .eq("organization_id", args.organizationId)
          .gte("recorded_at", fromIso)
          .lte("recorded_at", toIso)
          .order("recorded_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = page ?? [];
        rawPings.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      const pings: Ping[] = rawPings.map((r: any) => ({
        id: r.id,
        staff_id: r.staff_id,
        organization_id: r.organization_id,
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
        recorded_at: r.recorded_at,
        ts: new Date(r.recorded_at).getTime(),
      }));
      result.pings = pings.length;

      if (pings.length === 0) {
        out.push(result);
        continue;
      }

      const report = emptyReport();
      report.source_tag = args.source ?? "live_upload";
      report.staff = 1;
      report.pings = pings.length;

      await processStaff(supabase, args.staffId, pings, targets, report);

      result.arrivals = report.arrivals;
      result.switches = report.switches;
      result.workdays_opened = report.workdays_opened;
      result.ltes_opened = report.ltes_opened;
      result.ltes_closed = report.ltes_closed;
      result.travels_created = report.travels_created;
      result.errors = report.errors;

      // Audit: always log what the engine decided so admin kan see varför
      // dagen ändrades av en GPS-uppladdning.
      await logDayDecision(supabase, {
        organizationId: args.organizationId,
        staffId: args.staffId,
        dayDate: date,
        actor: "rule_engine",
        action: "location_update_processed",
        reason: args.source ?? "upload_location_batch",
        after: {
          pings: report.pings,
          arrivals: report.arrivals,
          switches: report.switches,
          workdays_opened: report.workdays_opened,
          ltes_opened: report.ltes_opened,
          ltes_closed: report.ltes_closed,
          travels_created: report.travels_created,
          errors: report.errors,
          run_id: report.run_id,
          engine_version: report.engine_version,
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
      // Still try to log the failure for audit visibility.
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
