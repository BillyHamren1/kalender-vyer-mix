## Time Registration Segments — Build Plan

Time Engine får ett nytt skikt: när en `active_time_registrations` är aktiv ska GPS-tidslinjen brytas ned i segment som beskriver **vad timern faktiskt har bestått av över tid** (arbetsplats, transport, okänd plats, GPS-glapp).

Ingen befintlig data flyttas. Inga skrivningar till `workdays`, `time_reports`, `location_time_entries`, `travel_time_logs`.

---

### 1. Datamodell — ny tabell `time_registration_segments`

| Kolumn | Typ | Beskrivning |
|---|---|---|
| `id` | uuid PK | |
| `registration_id` | uuid FK → `active_time_registrations(id)` ON DELETE CASCADE | |
| `staff_id` | text | redundant för snabb filter |
| `organization_id` | uuid | RLS-isolering |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz NULL | NULL = pågår |
| `kind` | text CHECK IN (`'work_target'`, `'transport'`, `'unknown_place'`, `'gps_gap'`) | |
| `label` | text | t.ex. "Swedish Game Fair", "Transport", "Okänd plats", "GPS-glapp" |
| `target_kind` | text NULL | `project / booking / warehouse / organization_location` när `kind='work_target'` |
| `target_ref_id` | uuid NULL | |
| `target_key` | text NULL | normaliserad nyckel (`project:<uuid>` etc.) |
| `source_gps_segment_id` | text NULL | spårar tillbaka till GpsSegment.id |
| `confidence` | numeric(3,2) | 0–1 |
| `created_at` / `updated_at` | timestamptz | |

**Index**: `(registration_id, started_at)`, `(organization_id, staff_id, started_at)`.
**RLS** (RESTRICTIVE): `organization_id = get_user_organization_id(auth.uid())`. Service-role bypass för edge functions.
**CHECK**: `ended_at IS NULL OR ended_at >= started_at`.
**Constraint**: max ett segment per registration utan `ended_at`.

---

### 2. Kontrakt — uppdatera `TimeRegistrationSegmentKind`

I `src/lib/time-engine/contracts.ts` och `supabase/functions/_shared/time-engine/contracts.ts` (speglade):

```ts
export type TimeRegistrationSegmentKind =
  | 'work_target'
  | 'transport'
  | 'unknown_place'
  | 'gps_gap';
```

Lägg `targetKind`/`targetRefId` på `TimeRegistrationSegment`. (Ersätter de gamla `project/booking/warehouse` som separata kinds — work_target + targetKind är samlande.)

---

### 3. Pure builder — `buildTimeRegistrationSegments()`

Ny fil: `supabase/functions/_shared/time-engine/buildTimeRegistrationSegments.ts` (+ frontend-spegling i `src/lib/time-engine/`).

**Input**:
- `activeRegistration: ActiveTimeRegistration` (krävs — annars returnera `[]`)
- `gpsTimeline: GpsDayTimeline`
- `targetMatches: TargetMatch[]` (per gps segment)
- `now: Date`

**Output**: `TimeRegistrationSegment[]`

**Regler**:
1. Klipp GPS-tidslinjen till intervallet `[registration.startedAt, registration.endedAt ?? now]`.
2. För varje (klippt) gps-segment, mappa via target match outcome:
   - `inside_known_target` → `work_target` (label = target.label, targetKind/targetRefId fryses från target)
   - `transport` (movement) → `transport` (alltid tillåtet INOM aktiv registration)
   - `unknown_place` → `unknown_place` (tillåtet INOM aktiv registration)
   - `gps_gap` / `insufficient_signal` → `gps_gap`
3. **Slå ihop angränsande segment** med samma `kind` + `targetKey`.
4. **GPS-glapp drar inte av arbetstid** — det är ett signalstatus-segment som ligger sida vid sida med övriga (timern fortsätter att tickka). Ingen segment-typ "paus" eller "subtract".
5. Bygg aldrig segment som börjar före `startedAt` eller slutar efter `endedAt/now`.
6. Builder är ren — inga DB-anrop, ingen tid läses från legacy-källor.

**Auto-start-policy oförändrad**: builder kallas ENDAST när registration redan finns. Den kan aldrig själv starta en timer — det är fortfarande `evaluateAutoStart`/`AutoStartPolicy`s ansvar. Transport och unknown_place får alltså aldrig starta timer; men när en timer redan lever blir de legitima segment.

---

### 4. Edge function — utöka `debug-time-intelligence`

Lägg till action `build_segments`:
- Input: `staffId`, `organizationId`, `date`, `registrationId` (valfri — annars senaste aktiva för dagen)
- Hämtar `active_time_registrations` + `gpsDayTimeline` (befintlig `buildGpsDayTimeline`) + `targetMatches`
- Anropar `buildTimeRegistrationSegments`
- **Persisterar** via diff-upsert mot `time_registration_segments` (radera segment för registreringen som inte längre finns + insert nya). Service-role.
- Returnerar `{ segments, persisted: { inserted, deleted, kept }, leakCheck }`
- Leak-detector (samma proxy som existerande actions) säkerställer att ingen läsning/skrivning sker mot `workdays/time_reports/location_time_entries/travel_time_logs`.

---

### 5. UI — Time Intelligence Debug

I `src/pages/admin/TimeIntelligenceDebug.tsx`, lägg till en sektion **"Segment för aktiv registrering"**:
- Knapp "Bygg segment" som anropar `build_segments`
- Tabell med: `started_at | ended_at | kind (badge) | label | confidence | source_gps_segment_id`
- Färg per kind: work_target = grön, transport = blå, unknown_place = amber, gps_gap = grå/randig
- Visar tydligt: "GPS-glapp drar inte arbetstid — timern tickar vidare under glappet"

---

### 6. Tests

Ny vitest: `src/test/timeRegistrationSegments.contract.test.ts`:
- Ingen aktiv registration → `[]`
- Aktiv timer + 3 gps-segment (inside, movement, gps_gap) → 3 segment med rätt kinds
- gps_gap drar inte arbetstid (registreringens längd = `endedAt - startedAt` oavsett gap)
- Transport/unknown_place utanför aktiv timer → ignoreras (klippt bort)
- Angränsande work_target med samma targetKey → mergas
- Builder läser INTE från legacy-tabeller (statisk import-check, samma stil som `assertNoLegacySources`)

---

### 7. Filer som skapas/ändras

**Ny tabell**: migration för `time_registration_segments` + RLS + index + constraints.

**Ny kod**:
- `supabase/functions/_shared/time-engine/buildTimeRegistrationSegments.ts` (pure)
- `src/lib/time-engine/buildTimeRegistrationSegments.ts` (frontend-spegel)
- `src/test/timeRegistrationSegments.contract.test.ts`

**Ändringar**:
- `supabase/functions/_shared/time-engine/contracts.ts` + `src/lib/time-engine/contracts.ts` — nya segment-kinds + targetKind/targetRefId-fält
- `supabase/functions/_shared/time-engine/index.ts` + `src/lib/time-engine/index.ts` — re-export
- `supabase/functions/debug-time-intelligence/index.ts` — `build_segments`-action med persist + leak-check
- `src/pages/admin/TimeIntelligenceDebug.tsx` — UI-sektion + knapp

---

### 8. Hård gräns

- Builder kallar inga DB-funktioner och importerar inga legacy-typer.
- Edge function-action kör bara select på `active_time_registrations` + GPS-pings + targets, och insert/delete på `time_registration_segments` — proxy-leak-detector blockerar/loggar allt annat.
- Time Engine v2 förblir isolerat. TimeReport (attestable artifact) är fortfarande ett senare steg — ingenting i denna leverans skapar lönegrundande/attesterbara rader.

Säg till om du vill att jag ändrar något (t.ex. behålla `project/booking/warehouse` som distinkta kinds istället för samlande `work_target` med `targetKind`), annars kör jag enligt planen.