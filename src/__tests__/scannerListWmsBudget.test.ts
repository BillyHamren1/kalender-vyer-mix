import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveWmsBatchWithBudget } from "../../supabase/functions/_shared/scannerReadContractV1";

describe("list_active_packings WMS-berikning", () => {
  it("ett enskilt fel/hängning blockerar bara sitt jobb", async () => {
    const res = await resolveWmsBatchWithBudget(
      ["ok", "throw", "hang", "notfound"],
      async (item, signal) => {
        if (item === "throw") throw new Error("boom");
        if (item === "hang") return new Promise((r) => signal.addEventListener("abort", () => r({ ok: false, code: "aborted" })));
        if (item === "notfound") return { ok: false, code: "wms_reservation_not_found" };
        return { ok: true, reservationId: "r1" };
      },
      { callTimeoutMs: 30, totalBudgetMs: 1000 },
    );
    expect(res.map((r) => r.ok ? "ok" : r.code)).toEqual(["ok", "wms_unavailable", "wms_timeout", "wms_reservation_not_found"]);
  });

  it("jobb efter total budget får wms_timeout utan WMS-anrop", async () => {
    let t = 0; let calls = 0;
    const res = await resolveWmsBatchWithBudget([1, 2, 3], async () => { calls++; t += 100; return { ok: true }; },
      { concurrency: 1, totalBudgetMs: 150, now: () => t });
    expect(res.map((r) => r.ok ? "ok" : r.code)).toEqual(["ok", "ok", "wms_timeout"]);
    expect(calls).toBe(2);
  });

  it("scanner-api använder budgeterad batch med abort-signal", () => {
    const src = readFileSync("supabase/functions/scanner-api/index.ts", "utf8");
    const block = src.slice(src.indexOf("case 'list_active_packings'"), src.indexOf("case 'get_packing':"));
    expect(block).toMatch(/resolveWmsBatchWithBudget\(/);
    expect(block).toMatch(/signal/);
    expect(block).not.toMatch(/mapWithConcurrency\(/);
  });
});
