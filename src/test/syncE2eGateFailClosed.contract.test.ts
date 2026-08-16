/**
 * STEG 5B — SQL/E2E release gate är fail-closed.
 *
 * Historical migration replay är diagnostiskt (aldrig blockerande, aldrig PASS).
 * Release readiness avgörs av release_migration_compatibility + övriga
 * fail-closed sync-sektioner.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computeFinalGate, REQUIRED_SECTIONS } from "../../scripts/sync-e2e/gate.mjs";

const allPass = (override: Record<string, string> = {}) => ({
  safe_environment: "PASS",
  historical_migration_replay: { status: "UNVERIFIABLE", blocking: false },
  results: Object.fromEntries(
    (REQUIRED_SECTIONS as string[]).map((k) => [k, override[k] ?? "PASS"]),
  ),
});

describe("STEG 5B – SQL/E2E gate är fail-closed", () => {
  it("ALL PASS → GREEN (exit 0)", () => {
    const r = computeFinalGate(allPass());
    expect(r.final).toBe("GREEN");
    expect(r.exit_code).toBe(0);
  });

  it("historical replay UNVERIFIABLE blockerar inte GREEN", () => {
    const r = computeFinalGate({
      ...allPass(),
      historical_migration_replay: { status: "UNVERIFIABLE", blocking: false },
    });
    expect(r.final).toBe("GREEN");
  });

  it("historical replay får aldrig räknas som blockerande PASS-sektion", () => {
    expect(REQUIRED_SECTIONS).not.toContain("migrations");
    expect(REQUIRED_SECTIONS).not.toContain("historical_migration_replay");
  });

  it("1 FAIL → RED", () => {
    const r = computeFinalGate(allPass({ revision_lease: "FAIL" }));
    expect(r.final).toBe("RED");
    expect(r.exit_code).toBe(1);
  });

  it("1 NOT EXECUTED → aldrig GREEN", () => {
    for (const key of REQUIRED_SECTIONS as string[]) {
      const r = computeFinalGate(allPass({ [key]: "NOT EXECUTED" }));
      expect(r.final, `${key} NOT EXECUTED gav ${r.final}`).toBe("RED");
    }
  });

  it("release_migration_compatibility NOT_EXECUTED/FAIL → RED", () => {
    expect(computeFinalGate(allPass({ release_migration_compatibility: "NOT_EXECUTED" })).final).toBe("RED");
    const r = computeFinalGate(allPass({ release_migration_compatibility: "FAIL" }));
    expect(r.final).toBe("RED");
    expect(r.reasons.join(" ")).toContain("release_migration_compatibility");
  });

  it("Safe environment FAIL → NOT EXECUTED (exit 10), aldrig GREEN", () => {
    const r = computeFinalGate({ ...allPass(), safe_environment: "FAIL" });
    expect(r.final).toBe("NOT EXECUTED");
    expect(r.exit_code).toBe(10);
  });

  it("okänt/tomt sektionsvärde → RED (fail-closed)", () => {
    expect(computeFinalGate(allPass({ worker_jobs: "" })).final).toBe("RED");
    expect(computeFinalGate(allPass({ worker_jobs: "SKIPPED" })).final).toBe("RED");
    expect(computeFinalGate({ safe_environment: "PASS" }).final).toBe("RED");
  });

  it("runnern använder gate.mjs och har ingen egen GREEN-default kvar", () => {
    const sh = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/run-sync-e2e.sh"),
      "utf8",
    );
    expect(sh).toContain("scripts/sync-e2e/gate.mjs");
    expect(sh).not.toContain('FINAL="GREEN"');
    expect(sh).toContain("SAFE TEST CONFIGURATION NOT PROVIDED");
    expect(sh).toContain("NO MUTATIONS EXECUTED");
  });

  it("required sections täcker alla blockerande delar", () => {
    expect(REQUIRED_SECTIONS).toEqual([
      "release_migration_compatibility",
      "bsa_tenant_identity",
      "bsa_v2_rpc",
      "security_definer",
      "revision_lease",
      "worker_jobs",
      "batch_cursor",
      "warehouse_uniqueness",
      "canonical_error_propagation",
      "destructive_cancellation_off",
    ]);
  });
});
