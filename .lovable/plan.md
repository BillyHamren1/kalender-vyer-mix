# Omprocessa alla personals tid (senaste 30 dagar)

## Bakgrund

- Senaste tidrapporteringsfixen körde engine-version **`large-project-target-fix-v1`** (174 cache-rader, senast 4 juni 20:01). Andis processades, övriga ligger kvar på äldre engine-versioner.
- Edge-funktionen **`backfill-staff-day-report-cache`** finns redan och gör exakt detta:
  - Skriver ENDAST till `staff_day_report_cache` (aldrig time_reports/workdays/LTE/travel/active_time_registrations).
  - Idempotent via `skipExisting=true` + onConflict på `(org, staff, date, engine_version)`.
  - Returnerar `nextBatch.remainingItems` så vi kan loopa tills allt är klart.
  - Skippar automatiskt staff-days utan GPS-pings (`skipped: 'no_pings'`) → matchar "bara de som har GPS/tid".

Inga kodändringar behövs. Det här är en ren ops-körning.

## Steg

### 1. Dry-run per organisation (sanity check)

För varje org (Doomie, Doomie Design AB, Frans August AB, Niklas Viking Production AB) anropa funktionen med:

```json
{
  "organizationId": "<org_id>",
  "dateFrom": "<idag - 30d>",
  "dateTo":   "<idag>",
  "engineVersion": "large-project-target-fix-v1",
  "dryRun": true,
  "batchSize": 25
}
```

Rapportera per org:
- `staffCount`, `dateCount`, `staffDaysCandidates`
- `aggregates.workMinutes`, `unknownMinutes`, `needsReviewMinutes`
- `perItemMs` × återstående = uppskattad total körtid
- Eventuella errors i `sample`

### 2. Godkännande

Stoppa och visa siffrorna. Du säger go innan vi går skarpt.

### 3. Skarp körning per organisation

För varje org, loop:

```json
{
  "organizationId": "<org_id>",
  "dateFrom": "<idag - 30d>",
  "dateTo":   "<idag>",
  "engineVersion": "large-project-target-fix-v1",
  "dryRun": false,
  "skipExisting": true,
  "batchSize": 50
}
```

Anropa upprepat (samma body) tills `nextBatch === null`. `skipExisting=true` gör att redan processade staff-days (t.ex. Andis) inte körs om — vi tar bara det som saknas.

### 4. Verifiering

- `SELECT COUNT(*) FROM staff_day_report_cache WHERE engine_version='large-project-target-fix-v1' AND date >= idag-30 GROUP BY organization_id;` — räkna upp.
- Spot-check: hämta 2–3 staff_day_report_cache-rader (en känd "tung" dag per org) och jämför `summary_json.workMinutes` mot motsvarande Andis-referensdag som vi vet är korrekt.
- Loggar: kontrollera edge function logs för `backfill-staff-day-report-cache` att inga errors smugit in.

## Tekniska detaljer

- Engine-version som används: `large-project-target-fix-v1` (samma som Andis kördes på).
- Funktionen skriver INTE till `time_reports` etc. — endast cache. Lön/projektsiffror i UI som läser cache uppdateras direkt; läsare som går mot `project_staff_time_cost_lines` triggas inte härifrån (det är en separat backfill om det visar sig behövas).
- `enablePeerEvidence` lämnas avstängt (default) — annars sänker det DB.
- Batchstorlek 50 är gentle; per-item ~några hundra ms enligt motsvarande tidigare körningar. Vi kan höja om dry-runen visar att det är snabbt.

## Out of scope

- Ingen DELETE/cleanup av äldre engine-versioners cache-rader (per `never-delete-db-rows`-policyn).
- Ingen rörelse i `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`.
- Ingen ändring i project_staff_time_cost_lines (separat backfill om projektkostnader visar fel efter detta).
