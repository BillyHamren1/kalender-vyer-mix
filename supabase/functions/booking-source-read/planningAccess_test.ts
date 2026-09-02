import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertPlanningAccess,
  decidePlanningAccess,
} from "../_shared/planningAccess.ts";

Deno.test("nekar användare utan Planning-behörighet med 403", () => {
  const res = decidePlanningAccess({ organizationId: "org-1", hasPlanningAccess: false });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.status, 403);
    assertEquals(res.error, "planning_access_required");
  }
});

Deno.test("nekar användare utan organisation med 403", () => {
  const res = decidePlanningAccess({ organizationId: null, hasPlanningAccess: true });
  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.error, "no_organization");
});

Deno.test("släpper igenom behörig användare med organisation", () => {
  const res = decidePlanningAccess({ organizationId: "org-1", hasPlanningAccess: true });
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.organizationId, "org-1");
});

const makeClient = (allowed: unknown, organizationId: string | null, calls: string[]) => ({
  rpc: (fn: string, args: Record<string, unknown>) => {
    calls.push(`rpc:${fn}:${String(args._user_id)}`);
    return Promise.resolve({ data: allowed, error: null });
  },
  from: (table: string) => {
    calls.push(`from:${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: organizationId ? { organization_id: organizationId } : null }),
        }),
      }),
    };
  },
});

Deno.test("assertPlanningAccess läser inte profiler när behörighet saknas", async () => {
  const calls: string[] = [];
  const res = await assertPlanningAccess(makeClient(false, "org-1", calls) as never, "user-1");
  assertEquals(res.ok, false);
  assertEquals(calls, ["rpc:has_planning_access:user-1"]);
});

Deno.test("assertPlanningAccess returnerar org för behörig användare", async () => {
  const calls: string[] = [];
  const res = await assertPlanningAccess(makeClient(true, "org-9", calls) as never, "user-2");
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.organizationId, "org-9");
  assertEquals(calls, ["rpc:has_planning_access:user-2", "from:profiles"]);
});
