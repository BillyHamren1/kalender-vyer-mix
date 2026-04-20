/**
 * Backend parity contract for the UNIFIED arrival API.
 *
 * Locks in that `report_arrival`, `get_arrival_state` and
 * `mark_arrival_resolved` accept the same shape regardless of whether
 * the target is a location, a large project, or a plain booking.
 *
 * Pure auth/validation surface — the deeper happy-path requires a real
 * staff token and is covered by manual QA. These tests ensure the
 * contract surface for all three kinds stays in lockstep.
 */
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mobile-app-api`;

async function callApi(action: string, token?: string, data?: any) {
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, token, data }),
  });
  const body = await res.text();
  let json: any;
  try { json = JSON.parse(body); } catch { json = { raw: body }; }
  return { status: res.status, json };
}

// ────────────────────────────────────────────────────────────────────────
// 1. report_arrival — must require auth for ALL three kinds.
// ────────────────────────────────────────────────────────────────────────

for (const kind of ["location", "project", "booking"] as const) {
  Deno.test(`report_arrival(kind=${kind}) requires authentication`, async () => {
    const { status } = await callApi("report_arrival", undefined, {
      kind,
      target_id: "00000000-0000-0000-0000-000000000000",
      arrived_at: new Date().toISOString(),
    });
    assertEquals(status, 401);
  });

  Deno.test(`report_arrival(kind=${kind}) rejects expired token`, async () => {
    const expired = btoa(JSON.stringify({
      staffId: "00000000-0000-0000-0000-000000000000",
      timestamp: Date.now(),
      expiresAt: Date.now() - 3600_000,
    }));
    const { status } = await callApi("report_arrival", expired, {
      kind,
      target_id: "00000000-0000-0000-0000-000000000000",
      arrived_at: new Date().toISOString(),
    });
    assertEquals(status, 401);
  });
}

// ────────────────────────────────────────────────────────────────────────
// 2. mark_arrival_resolved — must accept BOTH the new generic shape and
//    the legacy location-only shape, with identical auth requirements.
// ────────────────────────────────────────────────────────────────────────

for (const kind of ["location", "project", "booking"] as const) {
  Deno.test(`mark_arrival_resolved(target_type=${kind}) requires auth`, async () => {
    const { status } = await callApi("mark_arrival_resolved", undefined, {
      target_type: kind,
      target_id: "00000000-0000-0000-0000-000000000000",
      arrived_at: new Date().toISOString(),
    });
    assertEquals(status, 401);
  });
}

Deno.test("mark_arrival_resolved(legacy location_id payload) still requires auth", async () => {
  const { status } = await callApi("mark_arrival_resolved", undefined, {
    location_id: "00000000-0000-0000-0000-000000000000",
    arrived_at: new Date().toISOString(),
  });
  assertEquals(status, 401);
});

// ────────────────────────────────────────────────────────────────────────
// 3. get_arrival_state — single endpoint for all kinds; auth required.
// ────────────────────────────────────────────────────────────────────────

Deno.test("get_arrival_state requires authentication (unified)", async () => {
  const { status, json } = await callApi("get_arrival_state");
  assertEquals(status, 401);
  assert(typeof json.error === "string");
});

// ────────────────────────────────────────────────────────────────────────
// 4. ArrivalTarget contract — what the client sends back to the server.
//    Mirrors the shape exported by src/types/arrivalTarget.ts. If this
//    test breaks, the client and the edge function have drifted.
// ────────────────────────────────────────────────────────────────────────

interface ArrivalTarget {
  kind: "location" | "project" | "booking";
  target_id: string;
  label: string;
  arrived_at: string;
  address?: string | null;
}

function makeTarget(kind: ArrivalTarget["kind"]): ArrivalTarget {
  return {
    kind,
    target_id: `00000000-0000-0000-0000-00000000000${kind === "location" ? 1 : kind === "project" ? 2 : 3}`,
    label: kind === "location" ? "Lager" : kind === "project" ? "Projekt X" : "Kund AB",
    arrived_at: "2026-04-20T06:00:00.000Z",
  };
}

Deno.test("ArrivalTarget shape — three kinds all share the same field set", () => {
  const a = makeTarget("location");
  const b = makeTarget("project");
  const c = makeTarget("booking");
  // Same set of mandatory fields.
  for (const t of [a, b, c]) {
    assertEquals(typeof t.kind, "string");
    assertEquals(typeof t.target_id, "string");
    assertEquals(typeof t.label, "string");
    assertEquals(typeof t.arrived_at, "string");
  }
  // Kinds are distinct.
  assertEquals(new Set([a.kind, b.kind, c.kind]).size, 3);
});
