// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAssignmentEvidence } from "./buildAssignmentEvidence.ts";

const ORG = "00000000-0000-0000-0000-000000000001";
const STAFF = "staff-1";
const DATE = "2026-05-15";
const DAY_START = "2026-05-14T22:00:00.000Z";
const DAY_END = "2026-05-15T22:00:00.000Z";

interface Tables {
  booking_staff_assignments?: any[];
  staff_assignments?: any[];
  calendar_events?: any[];
  large_project_team_assignments?: any[];
  bookings?: any[];
}

function makeStub(tables: Tables) {
  return {
    from(name: string) {
      const rows: any[] = (tables as any)[name] ?? [];
      const filters: Array<(r: any) => boolean> = [];
      const builder: any = {
        select() { return builder; },
        eq(col: string, val: any) { filters.push((r) => r[col] === val); return builder; },
        in(col: string, vals: any[]) { filters.push((r) => vals.includes(r[col])); return builder; },
        async then(resolve: any) {
          const data = rows.filter((r) => filters.every((f) => f(r)));
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

Deno.test("Person utan planering → 0 items, inga warnings", async () => {
  const stub = makeStub({});
  const r = await buildAssignmentEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    dayStartUtc: DAY_START, dayEndUtc: DAY_END,
  });
  assertEquals(r.items.length, 0);
  assertEquals(r.diagnostics.directBookingAssignmentCount, 0);
  assertEquals(r.diagnostics.staffAssignmentCount, 0);
});

Deno.test("Direkt booking_staff_assignment → item med phase + LP-context", async () => {
  const stub = makeStub({
    booking_staff_assignments: [
      { id: "bsa-1", organization_id: ORG, staff_id: STAFF, assignment_date: DATE, booking_id: "B1", team_id: "team-A", role: "tech" },
    ],
    bookings: [
      { id: "B1", large_project_id: "LP-9", eventdate: DATE, event_start_time: "08:00", event_end_time: "17:00", booking_number: "BK-001", project_name: "Acme show" },
    ],
  });
  const r = await buildAssignmentEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    dayStartUtc: DAY_START, dayEndUtc: DAY_END,
  });
  assertEquals(r.items.length, 1);
  const it = r.items[0];
  assertEquals(it.source, "booking_staff_assignment");
  assertEquals(it.bookingId, "B1");
  assertEquals(it.largeProjectId, "LP-9");
  assertEquals(it.belongsToLargeProject, true);
  assertEquals(it.childBookingId, "B1");
  assertEquals(it.plannedPhase, "event");
  assertEquals(it.title, "Acme show");
  assertEquals(it.overlapsDate, true);
  assertEquals(r.diagnostics.assignmentsWithLargeProjectContextCount, 1);
});

Deno.test("Team via staff_assignments → calendar_events item", async () => {
  const stub = makeStub({
    staff_assignments: [
      { id: "sa-1", organization_id: ORG, staff_id: STAFF, team_id: "team-B", assignment_date: DATE },
    ],
    calendar_events: [
      { id: "ce-1", organization_id: ORG, source_date: DATE, resource_id: "team-B", booking_id: "B2", title: "Rig dag", start_time: "2026-05-15T06:00:00Z", end_time: "2026-05-15T10:00:00Z", event_type: "rig", booking_number: "BK-002" },
    ],
    bookings: [
      { id: "B2", large_project_id: null, rigdaydate: DATE, rig_start_time: "06:00", rig_end_time: "10:00" },
    ],
  });
  const r = await buildAssignmentEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    dayStartUtc: DAY_START, dayEndUtc: DAY_END,
  });
  // ett item — calendar_event (staff_assignments räknas i diag, ej som item)
  assertEquals(r.items.length, 1);
  assertEquals(r.items[0].source, "staff_team_calendar_event");
  assertEquals(r.items[0].bookingId, "B2");
  assertEquals(r.items[0].plannedPhase, "rig");
  assertEquals(r.items[0].belongsToLargeProject, false);
  assertEquals(r.items[0].overlapsTimeWindow, true);
  assertEquals(r.diagnostics.calendarEventCount, 1);
  assertEquals(r.diagnostics.staffAssignmentCount, 1);
});

Deno.test("Large project team-tilldelning → LP-item utan booking", async () => {
  const stub = makeStub({
    staff_assignments: [
      { id: "sa-2", organization_id: ORG, staff_id: STAFF, team_id: "team-C", assignment_date: DATE },
    ],
    large_project_team_assignments: [
      { id: "lpa-1", organization_id: ORG, large_project_id: "LP-42", team_id: "team-C", phase: "event", assignment_date: DATE },
    ],
  });
  const r = await buildAssignmentEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    dayStartUtc: DAY_START, dayEndUtc: DAY_END,
  });
  assertEquals(r.items.length, 1);
  assertEquals(r.items[0].source, "large_project_team_assignment");
  assertEquals(r.items[0].largeProjectId, "LP-42");
  assertEquals(r.items[0].bookingId, null);
  assertEquals(r.items[0].belongsToLargeProject, true);
  assertEquals(r.items[0].plannedPhase, "event");
  assertEquals(r.diagnostics.largeProjectAssignmentCount, 1);
  assertEquals(r.diagnostics.assignmentsWithLargeProjectContextCount, 1);
});

Deno.test("team_id='project' räknas inte som dagsteam → ingen calendar fetch", async () => {
  const stub = makeStub({
    booking_staff_assignments: [
      { id: "bsa-x", organization_id: ORG, staff_id: STAFF, assignment_date: DATE, booking_id: "Bx", team_id: "project" },
    ],
    bookings: [{ id: "Bx", large_project_id: null }],
    calendar_events: [
      { id: "ce-x", organization_id: ORG, source_date: DATE, resource_id: "project", booking_id: "Bx" },
    ],
  });
  const r = await buildAssignmentEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    dayStartUtc: DAY_START, dayEndUtc: DAY_END,
  });
  // BSA-rad blir item, men teamet 'project' triggar inte calendar_events-fetch
  assertEquals(r.items.length, 1);
  assertEquals(r.diagnostics.calendarEventCount, 0);
});
