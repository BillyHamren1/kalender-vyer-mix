import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * STEG 4R – Contract: ingen kvarvarande tenant-osäker BSA-runtimelogik.
 *
 * Vi läser den SENASTE definitionen av varje BSA-relaterad funktion i
 * migrationshistoriken (senaste migration vinner = runtime-sanning).
 * Historiska migrationer skrivs aldrig om – de får innehålla gammal logik,
 * så länge en senare migration ersätter funktionen.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

const BSA_FUNCTIONS = [
  "sync_booking_staff_assignments",
  "sync_team_pool_to_booking_assignments",
  "sync_task_assignments_to_bsa",
  "cleanup_task_bsa_on_delete",
  "sync_location_project_bsa",
  "sync_bsa_on_new_project_staff",
  "sync_project_staff_on_new_booking",
  "sync_new_staff_to_location_projects",
  "recompute_booking_staff_for_day",
  "recompute_booking_staff_for_day_v2",
] as const;

function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Hämtar senaste CREATE OR REPLACE FUNCTION-blocket för ett funktionsnamn. */
function latestDefinition(fnName: string): string | null {
  let latest: string | null = null;
  for (const file of migrationFiles()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const re = new RegExp(
      `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\s*\\(([\\s\\S]*?)\\$function\\$;`,
      "gi",
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      latest = m[0];
    }
  }
  return latest;
}

function deleteStatements(def: string): string[] {
  const out: string[] = [];
  const re = /delete\s+from\s+(?:public\.)?booking_staff_assignments[\s\S]*?;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(def)) !== null) out.push(m[0]);
  return out;
}

function conflictTargets(def: string): string[] {
  const out: string[] = [];
  const re = /on\s+conflict\s*\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(def)) !== null) out.push(m[1].replace(/\s+/g, " ").trim().toLowerCase());
  return out;
}

describe("STEG 4R – BSA legacy runtime audit", () => {
  it("varje BSA-funktion har en aktuell definition i migrationshistoriken", () => {
    for (const fn of BSA_FUNCTIONS) {
      expect(latestDefinition(fn), `saknar definition för ${fn}`).toBeTruthy();
    }
  });

  it("alla DELETE mot booking_staff_assignments är org-scopade", () => {
    for (const fn of BSA_FUNCTIONS) {
      const def = latestDefinition(fn);
      if (!def) continue;
      for (const stmt of deleteStatements(def)) {
        expect(
          /organization_id/i.test(stmt),
          `${fn}: DELETE mot BSA saknar organization_id`,
        ).toBe(true);
      }
    }
  });

  it("alla ON CONFLICT-identiteter mot BSA innehåller organization_id", () => {
    for (const fn of BSA_FUNCTIONS) {
      const def = latestDefinition(fn);
      if (!def || !/booking_staff_assignments/i.test(def)) continue;
      for (const target of conflictTargets(def)) {
        if (!/booking_id/.test(target) || !/staff_id/.test(target)) continue;
        expect(
          target.includes("organization_id"),
          `${fn}: ON CONFLICT (${target}) saknar organization_id`,
        ).toBe(true);
      }
    }
  });

  it("ingen aktiv funktion anropar legacy recompute_booking_staff_for_day(booking, date) för mutation", () => {
    for (const fn of BSA_FUNCTIONS) {
      if (fn === "recompute_booking_staff_for_day") continue;
      const def = latestDefinition(fn);
      if (!def) continue;
      const callsLegacy = /perform\s+public\.recompute_booking_staff_for_day\s*\(/i.test(def);
      expect(callsLegacy, `${fn} anropar legacy recompute`).toBe(false);
    }
  });

  it("legacy recompute delegerar till v2 och muterar inte BSA själv", () => {
    const def = latestDefinition("recompute_booking_staff_for_day");
    expect(def).toBeTruthy();
    expect(/recompute_booking_staff_for_day_v2/i.test(def!)).toBe(true);
    expect(deleteStatements(def!).length).toBe(0);
  });

  it("legacy sync_booking_staff_assignments läser kalender/staff_assignments org-scopat", () => {
    const def = latestDefinition("sync_booking_staff_assignments")!;
    expect(/ce\.organization_id\s*=/i.test(def)).toBe(true);
    expect(/sa\.organization_id\s*=/i.test(def)).toBe(true);
  });

});
