# Fix: GPS-veckovyn hämtar inte längre allt om och om igen

## Problem
`StaffGpsWeekList` triggar idag `get-mobile-staff-day-pings` **per person × per dag** (upp till 50+ parallella anrop). Varje anrop laddar dessutom om alla org-geofences, projekt och locations från scratch. Historiska pings (som aldrig ändras) hämtas om varje gång. Det är detta som ger BOOT_ERROR / IDLE_TIMEOUT / schema cache-fel — inte badge-borttagningen.

## Lösning
1. **Ny batch-endpoint** som returnerar hela veckans summary för alla synliga personer i **ett** anrop.
2. **Aggressiv React Query-cache**: historiska dagar = `staleTime: Infinity`, bara idag refetchas.
3. **Detaljvyn vid klick** fortsätter använda `get-mobile-staff-day-pings` oförändrat (en person × en dag = OK).

## Filer

**Nya:**
- `supabase/functions/get-staff-gps-week-summary/index.ts` — batch-endpoint. Body: `{ staffIds: string[], fromDate, toDate }`. Returnerar `{ summaries: Record<staffId, Record<dateKey, DaySummary>> }` med `pingsCount`, `firstIso`, `lastIso`, `durationMin`, `placeNames[]`. Geofences/projekt/locations laddas EN gång per request. En query mot `staff_location_history` med `.in('staff_id', staffIds)` + tidsrange.
- `supabase/functions/_shared/staff-gps/buildVisits.ts` — extraherad gemensam helper (visit-grupperingslogik från befintliga day-endpointen).
- `src/hooks/staff/useStaffGpsWeekSummaryBatch.ts` — ett batch-anrop, per-dag cache-policy (idag: 60s staleTime; tidigare dagar: Infinity, gcTime 24h).
- `supabase/functions/get-staff-gps-week-summary/index.test.ts` — Deno-test: auth, org-isolering, batch-respons-shape, tom input.
- `src/hooks/staff/__tests__/useStaffGpsWeekSummaryBatch.test.ts` — vitest: cachenycklar, staleTime-policy per dag.

**Editeras:**
- `supabase/functions/get-mobile-staff-day-pings/index.ts` — importerar shared `buildVisits`-helper. Beteende oförändrat.
- `src/components/staff/StaffGpsWeekList.tsx` — ett `useStaffGpsWeekSummaryBatch`-anrop för alla synliga staffIds + veckorange. Skickar `summariesByStaff` som prop till varje rad.
- `src/components/staff/StaffGpsWeekListRow.tsx` — tar emot `summaries` som prop istället för att hämta själv. Ingen egen fetch.

## UI
Ingen visuell ändring. Listan ser likadan ut. Detaljpanel öppnas fortfarande on-demand vid klick.

## Verifiering (körs automatiskt efter implementation)
1. `supabase--test_edge_functions` för nya batch-endpointen.
2. `bunx vitest run` på nya hook-testet.
3. `supabase--curl_edge_functions` mot `get-staff-gps-week-summary` med en liten staffId-lista för att verifiera respons-shape live.
4. Öppna preview `/staff-management/gps-satellite-map`, kontrollera nätverksfliken: **ett** batch-anrop istället för 50+.

## Risker
- Edge function returnerar stor payload vid många personer × 7 dagar. Lindras genom att bara skicka summary-fält (inga raw pings, inga polygoner).
- Multi-tenancy: batch-endpointen verifierar att alla `staffIds` tillhör samma org som callern innan query (RESTRICTIVE-style guard).
