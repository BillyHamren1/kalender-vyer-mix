/**
 * backfill-project-staff-time-cost-lines
 * ============================================================================
 * Admin-säker backfill av `project_staff_time_cost_lines` från alla
 * countable `staff_day_submissions`.
 *
 * Skriver ENDAST till `project_staff_time_cost_lines` via
 * rebuildProjectStaffTimeCostLinesForSubmission (delete+insert, idempotent).
 *
 * Rör ALDRIG: GPS-pings, time_reports, workdays, location_time_entries,
 * travel_time_logs, day_attestations, staff_day_report_cache.
 *
 * Body-varianter:
 *   A) { "large_project_id": "..." }
 *   B) { "booking_ids": ["...","..."] }
 *   C) { "organization_id": "...", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }
 *   + optional "dryRun": true
 *
 * Submissions plockas oberoende av BSA — varje countable submission med
 * work-block som pekar på booking/project/large_project/location ger rader,
 * även när personen inte ligger i BSA för dagen.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  COUNTABLE_SUBMISSION_STATUSES,
  rebuildProjectStaffTimeCostLinesForSubmission,
} from "../_shared/staff-day-cost-lines.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COUNTABLE_LIST = Array.from(COUNTABLE_SUBMISSION_STATUSES);

interface BackfillBody {
  large_project_id?: string | null;
  booking_ids?: string[] | null;
  organization_id?: string | null;
  from?: string | null;
  to?: string | null;
  dryRun?: boolean;
}

interface SubmissionRow {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  status: string;
  display_timeline_snapshot_json: unknown;
  submitted_payload_json: unknown;
}

const WORK_KINDS = new Set(["work", "work_session", "work_block", "project_work"]);
const PRIVATE_KINDS = new Set(["private_residence", "private", "home", "private_or_background"]);
const TRANSPORT_KINDS = new Set(["transport", "travel", "resa"]);
const BREAK_KINDS = new Set(["break", "rast", "lunch"]);
const NON_WORK_KINDS = new Set([
  "signal_gap", "gps_gap", "gps_gap_in_workday", "unknown", "unknown_place",
  "needs_review", "no_report", "other_place", "unclear_movement", "unclear_transport",
]);

function blocksOf(snap: unknown): any[] {
  if (Array.isArray(snap)) return snap;
  if (snap && typeof snap === "object") {
    const obj = snap as Record<string, unknown>;
    for (const k of ["display_blocks", "blocks", "timeline", "items"]) {
      const v = obj[k];
      if (Array.isArray(v)) return v as any[];
    }
  }
  return [];
}

function hasCountableSegments(sub: SubmissionRow): boolean {
  const blocks = (() => {
    const b1 = blocksOf(sub.display_timeline_snapshot_json);
    if (b1.length > 0) return b1;
    return blocksOf(sub.submitted_payload_json);
  })();
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    const kind = String((b as any).kind ?? (b as any).type ?? "").toLowerCase();
    if (!kind) continue;
    if (PRIVATE_KINDS.has(kind) || TRANSPORT_KINDS.has(kind) || BREAK_KINDS.has(kind) || NON_WORK_KINDS.has(kind)) continue;
    const isWork = WORK_KINDS.has(kind) || kind.startsWith("work");
    if (!isWork) continue;
    const ev = ((b as any).evidence ?? {}) as Record<string, unknown>;
    const md = ((b as any).metadata ?? {}) as Record<string, unknown>;
    const tType = ((b as any).targetType ?? (b as any).target?.type ?? "") as string;
    const tId = ((b as any).targetId ?? (b as any).target?.id ?? null) as string | null;
    const ref =
      (b as any).booking_id || (b as any).project_id || (b as any).large_project_id || (b as any).location_id ||
      ev.booking_id || ev.project_id || ev.large_project_id || ev.location_id ||
      md.booking_id || md.project_id || md.large_project_id || md.location_id ||
      (tType && tId ? tId : null);
    if (ref) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const body = (await req.json().catch(() => ({}))) as BackfillBody;
    const largeProjectId = body.large_project_id ?? null;
    const bookingIdsIn = Array.isArray(body.booking_ids) ? body.booking_ids.filter(Boolean) : [];
    const organizationId = body.organization_id ?? null;
    const fromDate = body.from ?? null;
    const toDate = body.to ?? null;
    const dryRun = body.dryRun === true;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Resolva bookings för project-modes
    let bookingIds = [...bookingIdsIn];
    if (largeProjectId) {
      const { data, error } = await admin
        .from("large_project_bookings")
        .select("booking_id")
        .eq("large_project_id", largeProjectId);
      if (error) throw error;
      for (const r of data ?? []) {
        const id = (r as any).booking_id;
        if (id && !bookingIds.includes(id)) bookingIds.push(id);
      }
    }

    // Bygg submission-query
    let query = admin
      .from("staff_day_submissions")
      .select(
        "id, organization_id, staff_id, date, status, display_timeline_snapshot_json, submitted_payload_json",
      )
      .in("status", COUNTABLE_LIST)
      .order("date", { ascending: true })
      .limit(10_000);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
      if (fromDate) query = query.gte("date", fromDate);
      if (toDate) query = query.lte("date", toDate);
    } else if (bookingIds.length > 0) {
      // Hämta submissions vars snapshot pekar på någon av dessa bookings (ELLER vars staff är planerade på dessa bookings)
      // Vi gör en bred hämtning på berörd personal+datum och filtrerar sedan i minne.
      const { data: bsa, error: bsaErr } = await admin
        .from("booking_staff_assignments")
        .select("staff_id, assignment_date")
        .in("booking_id", bookingIds)
        .limit(20_000);
      if (bsaErr) throw bsaErr;

      // LP team -> BSA expansion
      if (largeProjectId) {
        const { data: lpAss } = await admin
          .from("large_project_team_assignments")
          .select("assignment_date, team_id")
          .eq("large_project_id", largeProjectId);
        const teamDayPairs = new Map<string, { date: string; team_id: string }>();
        for (const r of lpAss ?? []) {
          const date = String((r as any).assignment_date ?? "").slice(0, 10);
          const tid = (r as any).team_id;
          if (date && tid) teamDayPairs.set(`${date}|${tid}`, { date, team_id: tid });
        }
        if (teamDayPairs.size > 0) {
          const teamIds = Array.from(new Set(Array.from(teamDayPairs.values()).map((p) => p.team_id)));
          const allDates = Array.from(new Set(Array.from(teamDayPairs.values()).map((p) => p.date))).sort();
          const { data: saRows } = await admin
            .from("staff_assignments")
            .select("staff_id, team_id, assignment_date")
            .in("team_id", teamIds)
            .gte("assignment_date", allDates[0])
            .lte("assignment_date", allDates[allDates.length - 1]);
          for (const r of saRows ?? []) {
            const date = String((r as any).assignment_date).slice(0, 10);
            const team_id = String((r as any).team_id);
            if (!teamDayPairs.has(`${date}|${team_id}`)) continue;
            (bsa ?? []).push({ staff_id: (r as any).staff_id, assignment_date: date } as any);
          }
        }
      }

      const staffIds = new Set<string>();
      const dates = new Set<string>();
      for (const r of bsa ?? []) {
        const sid = (r as any).staff_id;
        const date = String((r as any).assignment_date ?? "").slice(0, 10);
        if (sid && date) {
          staffIds.add(sid);
          dates.add(date);
        }
      }
      if (staffIds.size === 0) {
        return new Response(
          JSON.stringify({ ok: true, mode: "bookings", reason: "no_planned_staff", considered: 0, rebuilt: 0 }),
          { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
        );
      }
      const sorted = Array.from(dates).sort();
      query = query
        .in("staff_id", Array.from(staffIds))
        .gte("date", sorted[0])
        .lte("date", sorted[sorted.length - 1]);
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: "no_target — pass large_project_id | booking_ids | organization_id+from+to" }),
        { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
      );
    }

    const { data: subs, error: subErr } = await query;
    if (subErr) throw subErr;

    const submissions = (subs ?? []) as SubmissionRow[];

    // Om vi körde booking-mode: filtrera ner till submissions som faktiskt rör dessa bookings
    let candidates = submissions;
    if (!organizationId && bookingIds.length > 0) {
      const bookingSet = new Set(bookingIds);
      candidates = submissions.filter((s) => {
        const all = [
          ...blocksOf(s.display_timeline_snapshot_json),
          ...blocksOf(s.submitted_payload_json),
        ];
        if (all.length === 0) return true; // släpp igenom — låt rebuild bestämma via cache
        for (const b of all) {
          if (!b || typeof b !== "object") continue;
          const ev = ((b as any).evidence ?? {}) as Record<string, unknown>;
          const md = ((b as any).metadata ?? {}) as Record<string, unknown>;
          const bid = ((b as any).booking_id ?? ev.booking_id ?? md.booking_id) as string | null;
          if (bid && bookingSet.has(bid)) return true;
        }
        return false;
      });
    }

    const summary = {
      mode: organizationId ? "organization" : largeProjectId ? "large_project" : "bookings",
      dryRun,
      considered: candidates.length,
      rebuilt: 0,
      createdRows: 0,
      deletedRows: 0,
      skippedNoBlocks: 0,
      skippedNoCountableSegments: 0,
      skippedStatusNotCountable: 0,
      errors: [] as Array<{ id: string; staff_id: string; date: string; error: string }>,
      dryRunPreview: dryRun
        ? {
            wouldRebuild: [] as Array<{ id: string; staff_id: string; date: string; status: string }>,
            missingCountableSegments: [] as Array<{ id: string; staff_id: string; date: string; status: string }>,
          }
        : undefined,
    };

    for (const s of candidates) {
      const logBase = { submission: s.id, staff_id: s.staff_id, date: s.date, status: s.status };

      if (!COUNTABLE_SUBMISSION_STATUSES.has(s.status)) {
        summary.skippedStatusNotCountable++;
        continue;
      }

      if (dryRun) {
        const ok = hasCountableSegments(s);
        if (ok) {
          summary.dryRunPreview!.wouldRebuild.push({ ...logBase });
        } else {
          summary.skippedNoCountableSegments++;
          summary.dryRunPreview!.missingCountableSegments.push({ ...logBase });
        }
        console.log("[backfill] dryRun", { ...logBase, ok });
        continue;
      }

      try {
        const r = await rebuildProjectStaffTimeCostLinesForSubmission(admin, s.id);
        summary.createdRows += r.created;
        summary.deletedRows += r.deleted;
        if (r.created > 0 || r.deleted > 0) summary.rebuilt++;
        if (r.reason === "no_blocks") summary.skippedNoBlocks++;
        if (r.reason === "no_countable_segments") summary.skippedNoCountableSegments++;
        if (r.reason && r.reason.startsWith("status_not_countable")) summary.skippedStatusNotCountable++;
        console.log("[backfill] rebuilt", { ...logBase, created: r.created, deleted: r.deleted, reason: r.reason });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        summary.errors.push({ id: s.id, staff_id: s.staff_id, date: s.date, error: msg });
        console.error("[backfill] error", { ...logBase, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, ...summary }),
      { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  } catch (e) {
    console.error("[backfill-project-staff-time-cost-lines] error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message ?? e) }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
    );
  }
});
