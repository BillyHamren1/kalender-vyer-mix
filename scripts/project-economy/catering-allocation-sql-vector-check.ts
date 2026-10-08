// Consumes a privately captured actual SQL row; prints no raw/source/person data.
import {
  type CateringAllocationEvent,
  fingerprintCateringAllocationCost,
  fingerprintCateringAllocationEvent,
} from "../../supabase/functions/_shared/catering-project-reassignment.ts";
export async function checkActualAllocationSqlVector(vector: unknown, finance: {
  validateFinanceCateringAllocationAuthority: (
    v: unknown,
  ) => Promise<CateringAllocationEvent>;
  fingerprintFinanceCateringAllocationCost: (v: unknown) => Promise<string>;
}) {
  if (!vector || typeof vector !== "object" || Array.isArray(vector)) {
    throw new Error("invalid SQL vector shape");
  }
  const v = vector as Record<string, unknown>;
  if (
    Object.keys(v).length !== 2 || !Object.hasOwn(v, "allocation_event") ||
    !Object.hasOwn(v, "allocated_snapshot")
  ) throw new Error("invalid SQL vector fields");
  const event = await finance.validateFinanceCateringAllocationAuthority(
    v["allocation_event"],
  );
  if (
    await fingerprintCateringAllocationEvent(event) !== event.fingerprint ||
    await fingerprintCateringAllocationCost(v["allocated_snapshot"]) !==
      event.source_cost_fingerprint ||
    await finance.fingerprintFinanceCateringAllocationCost(
        v["allocated_snapshot"],
      ) !== event.source_cost_fingerprint
  ) throw new Error("SQL/Operations/Finance allocation parity denied");
}
if (import.meta.main) {
  if (
    Deno.args.length !== 2 ||
    Deno.args.some((x) => !x.startsWith("/") || x.includes("\u0000"))
  ) throw new Error("explicit local vector and Finance root required");
  const root = await Deno.realPath(Deno.args[1]!);
  const url = new URL("file:///");
  url.pathname = root + "/src/domain/cateringProjectAllocationDelivery.ts";
  const stat = await Deno.stat(Deno.args[0]!);
  if (!stat.isFile || stat.size > 262144) {
    throw new Error("bounded private SQL vector required");
  }
  await checkActualAllocationSqlVector(
    JSON.parse(await Deno.readTextFile(Deno.args[0]!)),
    await import(url.href),
  );
  console.log(
    "PASS actual SQL-generated allocation event Operations/Finance parity",
  );
}
