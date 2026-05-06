# Stort projekt äger ALLA datum — sub-bokningens datum är "frusen referens"

## Regel (ny invariant)

När en bokning har `large_project_id IS NOT NULL`:
- Sub-bokningens egna `rigdaydate / eventdate / rigdowndate` och `*_start_time / *_end_time` får **stå kvar och visas** i UI som referens.
- De **påverkar inte**: kalender (calendar_events), BSA, planering, mobil, packning, ekonomi.
- De **skrivs aldrig tillbaka** till externa Booking-systemet per sub-bokning.
- Reconciler ignorerar datum-/tid-fält för sub-bokningar i stora projekt (skriver inte över lokalt, flaggar inte som drift).

Datum för stora projektet ägs av `large_projects` (samt `large_project_phases` om det används) + de calendar_events som projektkalendern producerar.

---

## Vad detta löser

Bug just nu: när du flyttar en rigdag i personalkalendern för en bokning i Swedish game fair, hoppar den tillbaka. Orsak: olika delar av systemet försöker hålla sub-bokningens `rigdaydate` i synk med eventet, och `import-bookings` skriver tillbaka det externa värdet → eventet "spöker tillbaka". Med nya regeln slutar det här bråket helt.

---

## Implementation

### 1. `src/services/timeSync.ts`
- I `syncPhaseTime`: om bokningen tillhör ett stort projekt → **skippa `bookings.<phase>_*_time`-update** (både för primär bokning och syskon). Skriv bara `calendar_events`. Logga `[timeSync] skipping bookings update — large project owns dates`.

### 2. `src/components/Calendar/AddRiggDayDialog.tsx`
- Ta bort blocket som skriver `bookings.rigdaydate / *_start_time / *_end_time` när bokningen har `large_project_id`.
- Behåll `calendar_events`-insert + BSA-recompute.
- Bonus-fix: midnatts-överlapp. Om `endTime <= startTime`, lägg `+1 dag` på `endDateTime` så vi aldrig får negativ varaktighet i databasen.

### 3. `src/components/Calendar/MoveEventDateDialog.tsx`, `useEventDragDrop.ts`, `useEventOperations.tsx`
- Samma princip: flytta bara `calendar_events`-rader. Rör inte `bookings.*_date / *_time` när `large_project_id` finns.

### 4. `src/services/planningApiService.ts → updateBookingDatesViaApi`
- Lägg till early-return: om bokningen har `large_project_id`, returnera success utan att anropa planning-api-proxy. Logga `skipped: dates owned by large project`. Hindrar att äldre kod råkar pusha datum till externa Booking-systemet.

### 5. `supabase/functions/import-bookings/*` + `supabase/functions/sync-reconciliation/*`
- I upsert-loopen: om bokningen har `large_project_id` (eller det remote-värdet säger så) → **uteslut datum-/tid-fält** ur det som skrivs till lokal `bookings`. Övriga fält (kund, produkter, anteckningar, status) synkas som vanligt.
- I reconciliation: rapportera datumavvikelser på sub-bokningar i stora projekt som "informational" (inte drift), och **utför inte** auto-fix på dessa fält.

### 6. UI — visa som "frusen referens" (lätt diff)
- I bokningsdetaljen, när `large_project_id` finns: visa befintliga datum med muted text + badge "Styrs av stort projekt". Datepickers disabled, länk "Ändra i stora projektet →".

### 7. Engångsstädning av databas (migration via insert-tool för UPDATE)
- Reparera alla `calendar_events` där `end_time <= start_time` → `end_time = start_time + interval '4 hours'`.
- Lämna sub-bokningarnas `rigdaydate/eventdate/rigdowndate` orörda (de är nu officiellt frusen referens).

### 8. Memory
Skapa `mem://constraints/large-project-date-authority-v1`:
> Stora projektet äger ALLA datum/tider för sub-bokningar. Sub-bokningens egna `*_date/*_time` är frusen referens — får visas men aldrig påverka kalender/synk/ekonomi/mobil/packning. Reconciler hoppar datum-fält när `large_project_id` är satt. AddRiggDay/MoveEvent/timeSync skriver bara `calendar_events` för sub-bokningar i stora projekt.

Lägg in en kort Core-rad i `mem://index.md`:
> **Large project date authority**: Stora projektet äger alla datum/tider. Sub-bokningens datum visas som referens men påverkar inget.

---

## Tester
- `src/test/largeProjectDateAuthority.contract.test.ts`: 
  - Add rigday i stort projekt skriver INTE `bookings.rigdaydate`.
  - Move event i stort projekt skriver INTE `bookings.rig_start_time`.
  - `updateBookingDatesViaApi` no-op:ar för bokningar med `large_project_id`.
  - `import-bookings` upsert-payload utesluter datum-fält när `large_project_id` finns.

---

## Vad jag INTE rör
- Standalone-bokningar (utan `large_project_id`) fungerar precis som idag.
- `large_projects`-tabellens egna datum hanteras inte av denna ändring.
- Befintliga datum på sub-bokningar rensas inte — de står kvar som referens.
