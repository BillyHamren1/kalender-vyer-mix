// @ts-nocheck
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildKnownTargetsEvidence } from "./buildKnownTargetsEvidence.ts";

const ORG = "00000000-0000-0000-0000-000000000001";
const STAFF = "staff-1";
const DATE = "2026-05-15";

interface Tables {
  organization_locations?: any[];
  large_projects?: any[];
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
