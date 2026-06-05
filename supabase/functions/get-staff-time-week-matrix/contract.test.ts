// Statiska kontraktstester för get-staff-time-week-matrix.
//
// SKYDDAR följande arkitektur-kontrakt:
//   1. Endpoint:n går UTESLUTANDE via den gemensamma staff-day-report-resolvern
//      (resolveStaffDayReportSummariesBatch). Ingen egen GPS-pipeline.
//   2. GPS SAT (get-staff-gps-week-summary) och Tid/Lön (resolvern) använder
//      SAMMA canonical-builder (`buildCanonicalStaffDayGpsResult`). Det får
//      inte finnas två olika GPS-sanningar.
//   3. Endpoint-filen får ALDRIG importera canonical-buildern direkt — det
//      skulle skapa en parallell GPS-väg.
//   4. Endpoint-filen får ALDRIG läsa `staff_location_history` (canonical
//      buildern äger den läsningen, kallad via resolvern).
//   5. Endpoint-filen får ALDRIG läsa eller skriva legacy tidstabeller
//      (time_reports, workdays, location_time_entries, travel_time_logs,
//      day_attestations, active_time_registrations).
//   6. Endpoint-filen får ALDRIG skriva till staff_day_submissions,
//      staff_day_report_cache eller någon av legacy-tabellerna. Tid/Lön är
//      en ren projektion — inga DB-writes.
//
// Kör: deno test supabase/functions/get-staff-time-week-matrix/

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const INDEX_URL = new URL("./index.ts", import.meta.url);
const RESOLVER_URL = new URL(
  "../_shared/staff-day-report/resolveStaffDayReport.ts",
  import.meta.url,
);
const GPS_SAT_URL = new URL(
  "../get-staff-gps-week-summary/index.ts",
  import.meta.url,
);

async function read(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

Deno.test("kontrakt #1: index.ts importerar resolveStaffDayReportSummariesBatch", async () => {
  const src = await read(INDEX_URL);
  assert(
    src.includes("resolveStaffDayReportSummariesBatch"),
    "Tid/Lön måste använda den delade resolvern — får inte bygga egen pipeline",
  );
  assert(
    /from\s+["'][^"']*staff-day-report\/resolveStaffDayReport(?:\.ts)?["']/.test(src),
    "import av resolvern måste gå mot _shared/staff-day-report/resolveStaffDayReport.ts",
  );
});

Deno.test("kontrakt #2: GPS SAT och Tid/Lön delar SAMMA canonical builder", async () => {
  const gpsSat = await read(GPS_SAT_URL);
  const resolver = await read(RESOLVER_URL);
  assert(
    gpsSat.includes("buildCanonicalStaffDayGpsResult"),
    "GPS SAT måste kalla buildCanonicalStaffDayGpsResult",
  );
  assert(
    resolver.includes("buildCanonicalStaffDayGpsResult"),
    "Tid/Lön-resolvern måste kalla buildCanonicalStaffDayGpsResult",
  );
  const importPath = /["']\.\.?\/(?:[^"']+\/)?staff-gps\/canonicalStaffDayGpsResult\.ts["']/;
  assert(importPath.test(gpsSat), "GPS SAT måste importera canonical-buildern från staff-gps/");
  assert(importPath.test(resolver), "Resolvern måste importera canonical-buildern från staff-gps/");
});

Deno.test("kontrakt #3: index.ts importerar INTE canonical-buildern direkt", async () => {
  const src = await read(INDEX_URL);
  assert(
    !src.includes("buildCanonicalStaffDayGpsResult"),
    "endpoint får inte ha en parallell GPS-väg — den ska gå via resolvern",
  );
  assert(
    !/canonicalStaffDayGpsResult/.test(src),
    "endpoint får inte referera canonical-buildern alls",
  );
});

Deno.test("kontrakt #4: index.ts läser INTE staff_location_history", async () => {
  const src = await read(INDEX_URL);
  assert(
    !/\.from\(\s*["'`]staff_location_history["'`]/.test(src),
    "raw GPS ägs av canonical-buildern (via resolvern) — inte av endpoint",
  );
});

Deno.test("kontrakt #5: index.ts läser INGA legacy tids-tabeller", async () => {
  const src = await read(INDEX_URL);
  const forbidden = [
    "time_reports",
    "workdays",
    "location_time_entries",
    "travel_time_logs",
    "day_attestations",
    "active_time_registrations",
  ];
  for (const t of forbidden) {
    assert(
      !new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`).test(src),
      `${t} får inte läsas från get-staff-time-week-matrix`,
    );
  }
});

Deno.test("kontrakt #6: index.ts gör INGA DB-writes (insert/update/upsert/delete)", async () => {
  const src = await read(INDEX_URL);
  const protectedTables = [
    "staff_day_submissions",
    "staff_day_report_cache",
    "time_reports",
    "workdays",
    "location_time_entries",
    "travel_time_logs",
  ];
  for (const t of protectedTables) {
    for (const op of ["insert", "update", "upsert", "delete"]) {
      // Matchar `.from("table")....op(` eller liknande på samma fil.
      // Vi tar en bred ansats: om både from("table") och .op( förekommer i samma fil
      // betraktas det som otillåtet eftersom endpoint:n ska vara ren projektion.
      const hasTable = new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`).test(src);
      const hasOp = new RegExp(`\\.${op}\\s*\\(`).test(src);
      assert(
        !(hasTable && hasOp),
        `get-staff-time-week-matrix får inte ${op} mot ${t} — det är en read-only projektion`,
      );
    }
  }
});

Deno.test("kontrakt #6b: resolvern gör INGA DB-writes mot skyddade tabeller", async () => {
  const src = await read(RESOLVER_URL);
  const protectedTables = [
    "staff_day_submissions",
    "staff_day_report_cache",
    "time_reports",
    "workdays",
    "location_time_entries",
    "travel_time_logs",
  ];
  for (const t of protectedTables) {
    for (const op of ["insert", "update", "upsert", "delete"]) {
      // Resolvern får läsa staff_day_submissions och staff_day_report_cache,
      // men aldrig skriva. Vi söker efter `.from("table")` följt av `.op(`
      // inom en rimlig radlängd för att undvika false positives mot helt
      // andra .update()-kall som inte är supabase-builder.
      const pattern = new RegExp(
        `\\.from\\(\\s*["'\`]${t}["'\`][\\s\\S]{0,400}?\\.${op}\\s*\\(`,
      );
      assert(
        !pattern.test(src),
        `resolveStaffDayReport.ts får inte ${op} mot ${t}`,
      );
    }
  }
});
