// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildKnownTargetsEvidence } from "./buildKnownTargetsEvidence.ts";

const ORG = "00000000-0000-0000-0000-000000000001";
const STAFF = "staff-1";
const DATE = "2026-05-15";

interface Tables {
  organization_locations?: any[];
  large_projects?: any[];
  large_project_bookings?: any[];
  projects?: any[];
  bookings?: any[];
  staff_private_zones?: any[];
  staff_home_observations?: any[];
  staff_inferred_home_locations?: any[];
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
        is(col: string, val: any) {
          if (val === null) filters.push((r) => r[col] === null || r[col] === undefined);
          return builder;
        },
        or(expr: string) {
          // very small parser: "eventdate.eq.X,rigdaydate.eq.X,rigdowndate.eq.X"
          const parts = expr.split(',').map((p) => p.trim());
          const preds: Array<(r: any) => boolean> = [];
          for (const p of parts) {
            const m = p.match(/^(\w+)\.eq\.(.+)$/);
            if (m) {
              const [, col, val] = m;
              preds.push((r) => String(r[col]) === val);
            }
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

Deno.test("FA Warehouse + organization_location + utan large project → primary + geo", async () => {
  const stub = makeStub({
    organization_locations: [
      { id: "wh-1", organization_id: ORG, name: "FA Warehouse", location_type: "warehouse", status: "active", latitude: 59.3, longitude: 18.0, radius_meters: 80, geofence_polygon: null, is_private_residence: false },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  assertEquals(r.diagnostics.warehouseCount, 1);
  assertEquals(r.items[0].canBePrimaryWorkTarget, true);
  assertEquals(r.items[0].canBeGeoTarget, true);
  assertEquals(r.items[0].suppressedReason, null);
});

Deno.test("Large project med egen geo → primary + geo target", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-1", organization_id: ORG, project_name: "LOGOSOL Mässa", status: "active", latitude: 60.6, longitude: 17.1, address_radius_meters: 150, address_geofence_polygon: null, deleted_at: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const lp = r.items.find((i) => i.targetType === "large_project");
  assert(lp);
  assertEquals(lp!.canBePrimaryWorkTarget, true);
  assertEquals(lp!.canBeGeoTarget, true);
  assertEquals(lp!.suppressedReason, null);
  assertEquals(r.dataQuality.largeProjectsMissingGeo.length, 0);
});

Deno.test("Large project utan geo → primary, INTE geo + dataQuality flag", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-2", organization_id: ORG, project_name: "Tour 2026", status: "active", latitude: null, longitude: null, address_radius_meters: null, address_geofence_polygon: null, deleted_at: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const lp = r.items.find((i) => i.targetType === "large_project");
  assertEquals(lp!.canBePrimaryWorkTarget, true);
  assertEquals(lp!.canBeGeoTarget, false);
  assertEquals(lp!.suppressedReason, "large_project_missing_geo");
  assertEquals(r.diagnostics.largeProjectsMissingGeoCount, 1);
  assertEquals(r.dataQuality.largeProjectsMissingGeo[0].targetId, "LP-2");
});

Deno.test("Child booking inom large project → suppressed som primary + geo target", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-3", organization_id: ORG, project_name: "Tour", status: "active", latitude: 60.6, longitude: 17.1, address_radius_meters: 100, address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-child", organization_id: ORG, booking_number: "BK-001", project_name: "Stage A", status: "confirmed", delivery_latitude: 60.61, delivery_longitude: 17.11, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: "LP-3" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const child = r.items.find((i) => i.targetType === "booking");
  assert(child);
  assertEquals(child!.canBePrimaryWorkTarget, false);
  assertEquals(child!.canBeGeoTarget, false);
  assertEquals(child!.suppressedReason, "child_booking_inside_large_project");
  assertEquals(child!.parentLargeProjectId, "LP-3");
  assertEquals(child!.belongsToLargeProject, true);
  assertEquals(r.diagnostics.childBookingsSuppressedCount, 1);
  assertEquals(r.dataQuality.bookingsInsideLargeProjects.length, 1);
});

Deno.test("Vanlig booking utan large project → primary + geo om coords finns", async () => {
  const stub = makeStub({
    bookings: [
      { id: "BK-solo", organization_id: ORG, booking_number: "BK-9", project_name: "Solo gig", status: "confirmed", delivery_latitude: 59.0, delivery_longitude: 18.0, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const b = r.items.find((i) => i.targetType === "booking");
  assert(b);
  assertEquals(b!.canBePrimaryWorkTarget, true);
  assertEquals(b!.canBeGeoTarget, true);
  assertEquals(b!.suppressedReason, null);
});

Deno.test("Booking utan coords → missing_coordinates + dataQuality", async () => {
  const stub = makeStub({
    bookings: [
      { id: "BK-nocoord", organization_id: ORG, booking_number: "BK-X", project_name: "Mystery", status: "confirmed", delivery_latitude: null, delivery_longitude: null, address_radius_meters: null, address_geofence_polygon: null, eventdate: DATE, large_project_id: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const b = r.items.find((i) => i.targetType === "booking");
  assertEquals(b!.canBePrimaryWorkTarget, false);
  assertEquals(b!.canBeGeoTarget, false);
  assertEquals(b!.suppressedReason, "missing_coordinates");
  assert(r.dataQuality.targetsMissingCoordinates.some((t) => t.targetId === "BK-nocoord"));
});

Deno.test("Private zone → aldrig primary work target, geo om coords", async () => {
  const stub = makeStub({
    staff_private_zones: [
      { id: "pz-1", organization_id: ORG, staff_id: STAFF, label: "Hem", kind: "home", latitude: 59.5, longitude: 18.1, radius_meters: 60, geofence_polygon: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const z = r.items.find((i) => i.targetType === "private_zone");
  assert(z);
  assertEquals(z!.canBePrimaryWorkTarget, false);
  assertEquals(z!.canBeGeoTarget, true);
  assertEquals(r.diagnostics.privateZoneCount, 1);
});

Deno.test("Assignment utan matchande target → diagnostics flagga", async () => {
  const stub = makeStub({});
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
    assignmentItems: [
      { assignmentId: "a1", bookingId: "missing-booking", largeProjectId: null },
    ],
  });
  assertEquals(r.dataQuality.assignmentsWithoutMatchingTarget.length, 1);
  assertEquals(r.dataQuality.assignmentsWithoutMatchingTarget[0].bookingId, "missing-booking");
});

// ──────────────────────────────────────────────────────────────────────────
// Lager 1.8 — child projects, large_project_bookings join, datakvalitet
// ──────────────────────────────────────────────────────────────────────────

Deno.test("L1.8: vanlig project utan LP → primary + geo om coords", async () => {
  const stub = makeStub({
    projects: [
      { id: "P-solo", organization_id: ORG, name: "Solo Project", status: "active", delivery_latitude: 59.0, delivery_longitude: 18.0, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, deleted_at: null, booking_id: null },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const p = r.items.find((i) => i.targetType === "project");
  assert(p);
  assertEquals(p!.canBePrimaryWorkTarget, true);
  assertEquals(p!.canBeGeoTarget, true);
  assertEquals(p!.suppressedReason, null);
  assertEquals(p!.belongsToLargeProject, false);
});

Deno.test("L1.8: child project inom LP via bookings.large_project_id → suppressed", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-A", organization_id: ORG, project_name: "LOGOSOL", status: "active", latitude: 60.6, longitude: 17.1, address_radius_meters: 150, address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-A", organization_id: ORG, booking_number: "BK-A", project_name: "Stage A", status: "confirmed", delivery_latitude: 60.61, delivery_longitude: 17.11, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: "LP-A" },
    ],
    projects: [
      { id: "P-A", organization_id: ORG, name: "Stage A Project", status: "active", delivery_latitude: 60.61, delivery_longitude: 17.11, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, deleted_at: null, booking_id: "BK-A" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const proj = r.items.find((i) => i.targetType === "project");
  assert(proj, "project ska finnas");
  assertEquals(proj!.parentLargeProjectId, "LP-A");
  assertEquals(proj!.belongsToLargeProject, true);
  assertEquals(proj!.canBePrimaryWorkTarget, false);
  assertEquals(proj!.canBeGeoTarget, false);
  assertEquals(proj!.suppressedReason, "child_project_inside_large_project");
  assertEquals(r.diagnostics.childProjectsSuppressedCount, 1);
  assertEquals(r.dataQuality.projectsInsideLargeProjects.length, 1);
  // Child project hade egen geo → ambiguous-flagga.
  assertEquals(r.dataQuality.ambiguousLargeProjectChildProjects.length, 1);
  assertEquals(r.diagnostics.largeProjectRules.ambiguousLargeProjectChildProjectCount, 1);
  // LP själv är fortfarande primary + geo target.
  const lp = r.items.find((i) => i.targetType === "large_project");
  assertEquals(lp!.canBePrimaryWorkTarget, true);
  assertEquals(lp!.canBeGeoTarget, true);
});

Deno.test("L1.8: child project via large_project_bookings join (booking saknar direktkolumn)", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-B", organization_id: ORG, project_name: "Tour B", status: "active", latitude: 59.5, longitude: 18.0, address_radius_meters: 200, address_geofence_polygon: null, deleted_at: null },
    ],
    large_project_bookings: [
      { id: "lpb-1", organization_id: ORG, large_project_id: "LP-B", booking_id: "BK-B", booking_id_join: "BK-B" },
    ],
    bookings: [
      { id: "BK-B", organization_id: ORG, booking_number: "BK-B", project_name: "Stage B", status: "confirmed", delivery_latitude: 59.5, delivery_longitude: 18.0, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: null },
    ],
    projects: [
      { id: "P-B", organization_id: ORG, name: "Stage B Project", status: "active", delivery_latitude: null, delivery_longitude: null, address_radius_meters: null, address_geofence_polygon: null, eventdate: DATE, deleted_at: null, booking_id: "BK-B" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  const bk = r.items.find((i) => i.targetType === "booking");
  const proj = r.items.find((i) => i.targetType === "project");
  // Booking härleds till LP via join-tabellen.
  assertEquals(bk!.parentLargeProjectId, "LP-B");
  assertEquals(bk!.suppressedReason, "child_booking_inside_large_project");
  // Project härleds transitivt: project.booking_id → booking → LP.
  assertEquals(proj!.parentLargeProjectId, "LP-B");
  assertEquals(proj!.suppressedReason, "child_project_inside_large_project");
});

Deno.test("L1.8: LP utan geo med child-objekt → missing_geo entry har räknat barn + child geo flaggor", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-C", organization_id: ORG, project_name: "No Geo LP", status: "active", latitude: null, longitude: null, address_radius_meters: null, address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-C1", organization_id: ORG, booking_number: "BK-C1", project_name: "Child 1", status: "confirmed", delivery_latitude: 60.0, delivery_longitude: 17.0, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: "LP-C" },
      { id: "BK-C2", organization_id: ORG, booking_number: "BK-C2", project_name: "Child 2", status: "confirmed", delivery_latitude: null, delivery_longitude: null, address_radius_meters: null, address_geofence_polygon: null, eventdate: DATE, large_project_id: "LP-C" },
    ],
    projects: [
      { id: "P-C", organization_id: ORG, name: "Child Project", status: "active", delivery_latitude: 60.0, delivery_longitude: 17.0, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, deleted_at: null, booking_id: "BK-C1" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  assertEquals(r.diagnostics.largeProjectsMissingGeoCount, 1);
  const entry = r.dataQuality.largeProjectsMissingGeo[0];
  assertEquals(entry.targetId, "LP-C");
  assertEquals(entry.largeProjectId, "LP-C");
  assertEquals(entry.reason, "large_project_missing_own_geo");
  assertEquals(entry.childObjectsCount, 3); // 2 bookings + 1 project
  assertEquals(entry.hasChildBookingGeo, true);
  assertEquals(entry.hasChildProjectGeo, true);
  // LP-själv: primary=true, geo=false (tyst fallback förbjuden).
  const lp = r.items.find((i) => i.targetType === "large_project");
  assertEquals(lp!.canBePrimaryWorkTarget, true);
  assertEquals(lp!.canBeGeoTarget, false);
  assertEquals(lp!.suppressedReason, "large_project_missing_geo");
  // largeProjectRules-summering.
  assertEquals(r.diagnostics.largeProjectRules.largeProjectsWithGeoCount, 0);
  assertEquals(r.diagnostics.largeProjectRules.largeProjectsMissingGeoCount, 1);
  assertEquals(r.diagnostics.largeProjectRules.childBookingsSuppressedCount, 2);
  assertEquals(r.diagnostics.largeProjectRules.childProjectsSuppressedCount, 1);
});

Deno.test("L1.8: LP med geo + child booking → LP kvar som geo, child suppressed", async () => {
  const stub = makeStub({
    large_projects: [
      { id: "LP-D", organization_id: ORG, project_name: "Geo LP", status: "active", latitude: 59.3, longitude: 18.1, address_radius_meters: 250, address_geofence_polygon: null, deleted_at: null },
    ],
    bookings: [
      { id: "BK-D", organization_id: ORG, booking_number: "BK-D", project_name: "Child", status: "confirmed", delivery_latitude: 59.31, delivery_longitude: 18.12, address_radius_meters: 100, address_geofence_polygon: null, eventdate: DATE, large_project_id: "LP-D" },
    ],
  });
  const r = await buildKnownTargetsEvidence({
    supabaseAdmin: stub, organizationId: ORG, staffId: STAFF, date: DATE,
  });
  assertEquals(r.diagnostics.largeProjectRules.largeProjectsWithGeoCount, 1);
  assertEquals(r.diagnostics.largeProjectRules.largeProjectsMissingGeoCount, 0);
  assertEquals(r.dataQuality.largeProjectsMissingGeo.length, 0);
  const lp = r.items.find((i) => i.targetType === "large_project")!;
  assertEquals(lp.canBeGeoTarget, true);
  const bk = r.items.find((i) => i.targetType === "booking")!;
  assertEquals(bk.canBeGeoTarget, false);
  assertEquals(bk.suppressedReason, "child_booking_inside_large_project");
});
