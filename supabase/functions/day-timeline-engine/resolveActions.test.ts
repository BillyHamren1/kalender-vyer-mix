// Tests for resolve actions (Etapp 3).
// Uses an in-memory fake of the supabase client to verify side effects.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveAccept,
  resolveIgnore,
  resolveMarkTravel,
  resolveMoveToOtherSite,
  resolveMarkUnclear,
  type ResolveContext,
} from "../_shared/timeline/resolveActions.ts";

interface Row { [k: string]: unknown }
interface Tables { [name: string]: Row[] }

function fakeSupabase(initial: Tables) {
  const tables: Tables = JSON.parse(JSON.stringify(initial));
  function table(name: string) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }
  // Chainable builder where every terminal call returns a thenable.
  // deno-lint-ignore no-explicit-any
  function builder(name: string): any {
    let filters: Array<[string, unknown]> = [];
    let pendingUpdate: Row | null = null;
    let pendingInsert: Row[] | null = null;
    const api = {
      select(_cols?: string) { return api; },
      eq(col: string, v: unknown) { filters.push([col, v]); return api; },
      async maybeSingle() {
        if (pendingInsert) return { data: pendingInsert[0] ?? null, error: null };
        const rows = table(name).filter((r) => filters.every(([c, v]) => r[c] === v));
        return { data: rows[0] ?? null, error: null };
      },
      update(patch: Row) { pendingUpdate = patch; return api; },
      insert(rowOrRows: Row | Row[]) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const inserted = rows.map((r) => ({ id: r.id ?? crypto.randomUUID(), ...r }));
        table(name).push(...inserted);
        pendingInsert = inserted;
        return api;
      },
      // Allow `await builder` to flush pending update/insert with no select().
      then(resolve: (v: { data: null; error: null }) => void) {
        if (pendingUpdate) {
          for (const r of table(name)) {
            if (filters.every(([c, v]) => r[c] === v)) Object.assign(r, pendingUpdate);
          }
          pendingUpdate = null;
        }
        filters = [];
        resolve({ data: null, error: null });
      },
    };
    return api;
  }
  const supabase = {
    from(name: string) { return builder(name); },
    _tables: tables,
  };
  return supabase;
}

function makeCtx(opts: {
  suggestion: Row;
  reports?: Row[];
  payload?: Record<string, unknown>;
}): ResolveContext & { supabase: ReturnType<typeof fakeSupabase> } {
  const supabase = fakeSupabase({
    time_reports: opts.reports ?? [],
    time_report_correction_suggestions: [opts.suggestion],
    travel_time_logs: [],
    workday_flags: [],
    timeline_action_audit: [],
  });
  return {
    supabase: supabase as unknown as ReturnType<typeof fakeSupabase>,
    userId: "user-1",
    orgId: "org-1",
    suggestion: opts.suggestion,
    payload: opts.payload ?? {},
  };
}

Deno.test("accept updates time_report and writes audit", async () => {
  const ctx = makeCtx({
    suggestion: {
      id: "s1", organization_id: "org-1", staff_id: "staff-1",
      time_report_id: "tr1", report_date: "2026-04-29",
      suggested_start_time: "08:00:00", suggested_end_time: "16:04:00",
      suggested_duration_min: 484, original_end_time: "19:53:00",
      status: "pending", suggestion_type: "shorten_end",
    },
    reports: [{
      id: "tr1", organization_id: "org-1", staff_id: "staff-1",
      report_date: "2026-04-29", start_time: "08:00:00", end_time: "19:53:00",
      hours_worked: 11.88,
    }],
  });
  const res = await resolveAccept(ctx as unknown as ResolveContext);
  assertEquals(res.action, "accept");
  const tr = ctx.supabase._tables.time_reports[0];
  assertEquals(tr.end_time, "16:04:00");
  assertEquals(tr.hours_worked, 8.07);
  const sug = ctx.supabase._tables.time_report_correction_suggestions[0];
  assertEquals(sug.status, "accepted");
  assertEquals(sug.resolved_action, "accept");
  assertEquals(ctx.supabase._tables.timeline_action_audit.length, 1);
  assertEquals(ctx.supabase._tables.timeline_action_audit[0].action, "accept");
});

Deno.test("ignore writes audit but does not touch time_report", async () => {
  const ctx = makeCtx({
    suggestion: {
      id: "s2", organization_id: "org-1", staff_id: "staff-1",
      time_report_id: "tr2", report_date: "2026-04-29",
      status: "pending", suggestion_type: "shorten_end",
    },
    reports: [{ id: "tr2", end_time: "19:53:00", hours_worked: 11.88 }],
  });
  await resolveIgnore(ctx as unknown as ResolveContext);
  assertEquals(ctx.supabase._tables.time_reports[0].end_time, "19:53:00");
  assertEquals(ctx.supabase._tables.time_report_correction_suggestions[0].status, "ignored");
  assertEquals(ctx.supabase._tables.timeline_action_audit.length, 1);
});

Deno.test("mark_travel shortens report and creates travel log", async () => {
  const ctx = makeCtx({
    suggestion: {
      id: "s3", organization_id: "org-1", staff_id: "staff-1",
      time_report_id: "tr3", report_date: "2026-04-29",
      suggested_start_time: "08:00:00", suggested_end_time: "16:00:00",
      suggested_duration_min: 480, original_end_time: "18:00:00",
      status: "pending", suggestion_type: "shorten_end",
    },
    reports: [{
      id: "tr3", organization_id: "org-1", staff_id: "staff-1",
      report_date: "2026-04-29", start_time: "08:00:00", end_time: "18:00:00",
      hours_worked: 10, booking_id: "BKG-1",
    }],
  });
  const res = await resolveMarkTravel(ctx as unknown as ResolveContext);
  assert(res.side_effects.travel_log_id);
  assertEquals(ctx.supabase._tables.time_reports[0].end_time, "16:00:00");
  assertEquals(ctx.supabase._tables.time_reports[0].hours_worked, 8);
  const travels = ctx.supabase._tables.travel_time_logs;
  assertEquals(travels.length, 1);
  assertEquals(travels[0].hours_worked, 2);
  assertEquals(travels[0].destination_booking_id, "BKG-1");
  assertEquals(travels[0].source, "timeline_suggestion");
  assertEquals(ctx.supabase._tables.timeline_action_audit[0].action, "mark_travel");
});

Deno.test("move_to_other_site shortens original and creates new report", async () => {
  const ctx = makeCtx({
    suggestion: {
      id: "s4", organization_id: "org-1", staff_id: "staff-1",
      time_report_id: "tr4", report_date: "2026-04-29",
      suggested_end_time: "16:00:00", suggested_duration_min: 480,
      original_end_time: "18:30:00",
      status: "pending", suggestion_type: "shorten_end",
    },
    reports: [{
      id: "tr4", organization_id: "org-1", staff_id: "staff-1",
      report_date: "2026-04-29", start_time: "08:00:00", end_time: "18:30:00",
      hours_worked: 10.5,
    }],
    payload: { target_booking_id: "BKG-NEW" },
  });
  const res = await resolveMoveToOtherSite(ctx as unknown as ResolveContext);
  assert(res.side_effects.new_time_report_id);
  const reports = ctx.supabase._tables.time_reports;
  assertEquals(reports.length, 2);
  assertEquals(reports[0].end_time, "16:00:00");
  const newR = reports.find((r: Row) => r.id === res.side_effects.new_time_report_id)!;
  assertEquals(newR.start_time, "16:00:00");
  assertEquals(newR.end_time, "18:30:00");
  assertEquals(newR.booking_id, "BKG-NEW");
  assertEquals(newR.source, "timeline_move");
  assertEquals(ctx.supabase._tables.timeline_action_audit[0].action, "move_to_other_site");
});

Deno.test("mark_unclear creates workday_flag without touching time_report", async () => {
  const ctx = makeCtx({
    suggestion: {
      id: "s5", organization_id: "org-1", staff_id: "staff-1",
      time_report_id: "tr5", report_date: "2026-04-29",
      status: "pending", suggestion_type: "phantom_end",
      human_readable_text: "Otydligt slut",
    },
    reports: [{ id: "tr5", end_time: "19:00:00", hours_worked: 11 }],
    payload: { note: "Behöver verifieras" },
  });
  const res = await resolveMarkUnclear(ctx as unknown as ResolveContext);
  assert(res.side_effects.workday_flag_id);
  assertEquals(ctx.supabase._tables.time_reports[0].end_time, "19:00:00");
  const flag = ctx.supabase._tables.workday_flags[0];
  assertEquals(flag.flag_type, "unclear_time");
  assertEquals(flag.related_time_report_id, "tr5");
  assertEquals((flag.context as Row).suggestion_id, "s5");
  assertEquals(ctx.supabase._tables.timeline_action_audit[0].action, "mark_unclear");
});
