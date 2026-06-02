/**
 * backfill-project-staff-time-cost-lines
 * ============================================================================
 * Engångs-backfill: bygg om `project_staff_time_cost_lines` för alla
 * countable `staff_day_submissions` som hör till ett projekts personal
 * och datumfönster.
 *
 * Trigggas från UI när vyn märker att submissions finns men cost lines
 * saknas (t.ex. submissions skapade innan rebuild-flödet aktiverades).
 *
 * Body:
 *   { large_project_id?: string, booking_ids?: string[] }
 *
 * Idempotent — använder samma rebuild-funktion som submit-flödet
 * (delete-then-insert per submission).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rebuildProjectStaffTimeCostLinesForSubmission } from "../_shared/staff-day-cost-lines.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const largeProjectId: string | null = body?.large_project_id ?? null;
    const bookingIdsIn: string[] = Array.isArray(body?.booking_ids) ? body.booking_ids : [];

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Resolva alla bookings för projektet
    let bookingIds = [...bookingIdsIn];
    if (largeProjectId) {
      const { data: lpBks, error: lpErr } = await admin
        .from("large_project_bookings")
        .select("booking_id")
        .eq("large_project_id", largeProjectId);
      if (lpErr) throw lpErr;
      for (const r of lpBks ?? []) {
        const id = (r as any).booking_id;
        if (id && !bookingIds.includes(id)) bookingIds.push(id);
      }
    }

    if (bookingIds.length === 0 && !largeProjectId) {
      return new Response(
        JSON.stringify({ ok: false, error: "no_target" }),
        { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } },
      );
    }

    // 2) Hämta planerad personal (LP-team eller BSA) för att hitta staff_id × date-par
    const assigned = new Set<string>(); // "date|staff_id"
    const staffIds = new Set<string>();
    const dates = new Set<string>();

    if (largeProjectId) {
      const { data: lpAss, error: e1 } = await admin
        .from("large_project_team_assignments")
        .select("assignment_date, team_id")
        .eq("large_project_id", largeProjectId);
      if (e1) throw e1;
      const teamDayPairs = new Map<string, { date: string; team_id: string }>();
      for (const r of lpAss ?? []) {
        const date = String((r as any).assignment_date ?? "").slice(0, 10);
        const tid = (r as any).team_id;
        if (date && tid) teamDayPairs.set(`${date}|${tid}`, { date, team_id: tid });
      }
      if (teamDayPairs.size > 0) {
        const teamIds = Array.from(new Set(Array.from(teamDayPairs.values()).map((p) => p.team_id)));
        const allDates = Array.from(new Set(Array.from(teamDayPairs.values()).map((p) => p.date))).sort();
        const { data: saRows, error: e2 } = await admin
          .from("staff_assignments")
          .select("staff_id, team_id, assignment_date")
          .in("team_id", teamIds)
          .gte("assignment_date", allDates[0])
          .lte("assignment_date", allDates[allDates.length - 1]);
        if (e2) throw e2;
        for (const r of saRows ?? []) {
          const date = String((r as any).assignment_date).slice(0, 10);
          const team_id = String((r as any).team_id);
          if (!teamDayPairs.has(`${date}|${team_id}`)) continue;
          const sid = (r as any).staff_id;
          assigned.add(`${date}|${sid}`);
          staffIds.add(sid);
          dates.add(date);
        }
      }
    } else {
      // Paginerat BSA
      const PAGE = 1000;
      let from = 0;
      for (let page = 0; page < 50; page++) {
        const { data, error } = await admin
          .from("booking_staff_assignments")
          .select("staff_id, assignment_date")
          .in("booking_id", bookingIds)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as Array<any>;
        for (const r of rows) {
          const date = String(r.assignment_date ?? "").slice(0, 10);
          if (!date || !r.staff_id) continue;
          assigned.add(`${date}|${r.staff_id}`);
          staffIds.add(r.staff_id);
          dates.add(date);
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }

    if (staffIds.size === 0 || dates.size === 0) {
      return new Response(
        JSON.stringify({ ok: true, rebuilt: 0, reason: "no_assigned_staff" }),
        { headers: { ...CORS_HEADERS, "content-type": "application/json" } },
      );
    }

    const sortedDates = Array.from(dates).sort();
    const winStart = sortedDates[0];
    const winEnd = sortedDates[sortedDates.length - 1];

    // 3) Hämta alla relevanta submissions
    const { data: subs, error: subErr } = await admin
      .from("staff_day_submissions")
      .select("id, staff_id, date, status")
      .in("staff_id", Array.from(staffIds))
      .gte("date", winStart)
      .lte("date", winEnd)
      .limit(5000);
    if (subErr) throw subErr;

    let rebuilt = 0;
    let skipped = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const s of subs ?? []) {
      const sid = (s as any).id as string;
      const date = String((s as any).date).slice(0, 10);
      const staff_id = (s as any).staff_id as string;
      // Endast submissions som tillhör en planerad (date, staff_id) räknas in
      if (!assigned.has(`${date}|${staff_id}`)) {
        skipped++;
        continue;
      }
      try {
        const r = await rebuildProjectStaffTimeCostLinesForSubmission(admin, sid);
        if (r.created > 0 || r.deleted > 0) rebuilt++;
      } catch (e) {
        errors.push({ id: sid, error: String((e as Error)?.message ?? e) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rebuilt,
        skipped,
        considered: (subs ?? []).length,
        errors,
      }),
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
