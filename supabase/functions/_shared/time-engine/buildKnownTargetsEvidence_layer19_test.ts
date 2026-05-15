// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildKnownTargetsEvidence } from "./buildKnownTargetsEvidence.ts";

const ORG = "00000000-0000-0000-0000-000000000001";
const STAFF = "staff-1";
const DATE = "2026-05-15";

function makeStub(tables: Record<string, any[]>) {
  return {
    from(name: string) {
      const rows: any[] = tables[name] ?? [];
      const filters: Array<(r: any) => boolean> = [];
      const builder: any = {
        select() { return builder; },
        eq(col: string, val: any) { filters.push((r) => r[col] === val); return builder; },
        in(col: string, vals: any[]) { filters.push((r) => vals.includes(r[col])); return builder; },
        is(col: string, val: any) {
          if (val === null) filters.push((r) => r[col] === null || r[col] === undefined);
          return builder;
        },
        or(expr: string) {
          const parts = expr.split(",").map((p) => p.trim());
          const preds: Array<(r: any) => boolean> = [];
          for (const p of parts) {
            const m = p.match(/^(\w+)\.eq\.(.+)$/);
            if (m) { const [, col, val] = m; preds.push((r) => String(r[col]) === val); }
          }
          filters.push((r) => preds.some((f) => f(r)));
          return builder;
        },
        async then(resolve: any) {
          const data = rows.filter((r) => filters.every((f) => f(r)));
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  };
}

Deno.test("L1.9 — calendar_event utan booking_id → no_booking_ref", async () => {
  const stub = makeStub({});
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentCalendarEvents: [{ id: "ce-1", eventId: "ce-1", bookingId: null }],
  });
  const ced = r.diagnostics.calendarEventTargetDiagnostics;
  assertEquals(ced.calendarEventCount, 1);
  assertEquals(ced.calendarEventsWithoutTargetCount, 1);
  assertEquals(r.dataQuality.calendarEventsWithoutTarget[0].reason, "no_booking_ref");
});

Deno.test("L1.9 — calendar_event pekar på booking inom LP med geo → child_booking_inside_lp + LP context, ingen missing_geo", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-1", organization_id: ORG, project_name: "LOGOSOL", status: "active",
        latitude: 60.6, longitude: 17.1, address_radius_meters: 200,
        address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-1", organization_id: ORG, booking_number: "B1", project_name: "LOGOSOL Sub",
        status: "active", delivery_latitude: 60.61, delivery_longitude: 17.11,
        address_radius_meters: 50, address_geofence_polygon: null, deliveryaddress: "x",
        eventdate: DATE, rigdaydate: null, rigdowndate: null, large_project_id: "LP-1" },
    ],
    large_project_bookings: [
      { organization_id: ORG, booking_id: "BK-1", large_project_id: "LP-1" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentCalendarEvents: [
      { id: "ce-1", eventId: "ce-1", bookingId: "BK-1", teamId: "team-A", title: "Rig", plannedPhase: "rig" },
    ],
  });
  const ced = r.diagnostics.calendarEventTargetDiagnostics;
  assertEquals(ced.calendarEventCount, 1);
  assertEquals(ced.calendarEventsWithLargeProjectContextCount, 1);
  assertEquals(ced.calendarEventsPointingToChildBookingCount, 1);
  assertEquals(ced.calendarEventsPointingToMissingGeoLargeProjectCount, 0);
  assertEquals(r.dataQuality.calendarEventsPointingToChildBooking[0].largeProjectId, "LP-1");
});

Deno.test("L1.9 — calendar_event pekar på LP utan geo → pointingToMissingGeoLargeProject", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-2", organization_id: ORG, project_name: "Stort utan geo", status: "active",
        latitude: null, longitude: null, address_radius_meters: null,
        address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-2", organization_id: ORG, booking_number: "B2", project_name: "Sub",
        status: "active", delivery_latitude: null, delivery_longitude: null,
        address_radius_meters: null, address_geofence_polygon: null, deliveryaddress: null,
        eventdate: DATE, rigdaydate: null, rigdowndate: null, large_project_id: "LP-2" },
    ],
    large_project_bookings: [
      { organization_id: ORG, booking_id: "BK-2", large_project_id: "LP-2" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentCalendarEvents: [
      { id: "ce-2", eventId: "ce-2", bookingId: "BK-2", teamId: "team-B", title: null, plannedPhase: "event" },
    ],
  });
  const ced = r.diagnostics.calendarEventTargetDiagnostics;
  assertEquals(ced.calendarEventsWithLargeProjectContextCount, 1);
  assertEquals(ced.calendarEventsPointingToMissingGeoLargeProjectCount, 1);
});

Deno.test("L1.9 — vanlig calendar_event med booking utan LP → with_target, ingen LP-flagga", async () => {
  const stub = makeStub({
    bookings: [
      { id: "BK-3", organization_id: ORG, booking_number: "B3", project_name: "Vanlig",
        status: "active", delivery_latitude: 59.3, delivery_longitude: 18.0,
        address_radius_meters: 100, address_geofence_polygon: null, deliveryaddress: "y",
        eventdate: DATE, rigdaydate: null, rigdowndate: null, large_project_id: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentCalendarEvents: [
      { id: "ce-3", eventId: "ce-3", bookingId: "BK-3", teamId: "team-C", title: "Event", plannedPhase: "event" },
    ],
  });
  const ced = r.diagnostics.calendarEventTargetDiagnostics;
  assertEquals(ced.calendarEventsWithTargetCount, 1);
  assertEquals(ced.calendarEventsWithoutTargetCount, 0);
  assertEquals(ced.calendarEventsWithLargeProjectContextCount, 0);
  assertEquals(ced.calendarEventsPointingToChildBookingCount, 0);
});

Deno.test("L1.9 — calendar_event med booking_id som inte finns → booking_not_in_targets", async () => {
  const stub = makeStub({});
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentCalendarEvents: [
      { id: "ce-x", eventId: "ce-x", bookingId: "BK-MISSING" },
    ],
  });
  const ced = r.diagnostics.calendarEventTargetDiagnostics;
  assertEquals(ced.calendarEventsWithoutTargetCount, 1);
  assertEquals(r.dataQuality.calendarEventsWithoutTarget[0].reason, "booking_not_in_targets");
});
