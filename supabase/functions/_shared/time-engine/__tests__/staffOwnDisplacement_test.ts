import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { staffOwnDisplacementMeters } from "../staffOwnDisplacement.ts";
import { TRANSPORT_MIN_DISTANCE_METERS } from "../transportThreshold.ts";

Deno.test("staffOwnDisplacement: identical coordinates → 0 m", () => {
  const d = staffOwnDisplacementMeters(
    { lat: 59.49128, lng: 17.85299 },
    { lat: 59.49128, lng: 17.85299 },
  );
  assertEquals(d, 0);
});

Deno.test("staffOwnDisplacement: ~10 m apart stays well under 500 m", () => {
  const d = staffOwnDisplacementMeters(
    { lat: 59.49128, lng: 17.85299 },
    { lat: 59.49137, lng: 17.85299 },
  );
  assert(d != null && d > 5 && d < 20, `expected ~10m, got ${d}`);
  assert(d! < TRANSPORT_MIN_DISTANCE_METERS);
});

Deno.test("staffOwnDisplacement: 800 m apart exceeds transport threshold", () => {
  // 0.0072 deg lat ≈ 800 m
  const d = staffOwnDisplacementMeters(
    { lat: 59.49128, lng: 17.85299 },
    { lat: 59.49848, lng: 17.85299 },
  );
  assert(d != null && d > TRANSPORT_MIN_DISTANCE_METERS, `expected >500m, got ${d}`);
});

Deno.test("staffOwnDisplacement: missing side → null", () => {
  assertEquals(staffOwnDisplacementMeters(null, { lat: 1, lng: 2 }), null);
  assertEquals(staffOwnDisplacementMeters({ lat: 1, lng: 2 }, null), null);
  assertEquals(
    staffOwnDisplacementMeters({ lat: 1, lng: null }, { lat: 1, lng: 2 }),
    null,
  );
});

Deno.test("threshold constant is 500 m (engine 4 contract)", () => {
  assertEquals(TRANSPORT_MIN_DISTANCE_METERS, 500);
});
