## Mål
Se till att dagar i `/staff-management/time-reports` faktiskt slutar i adminvyn och inte kan rulla vidare till `now` när dagsslutsreglerna redan borde kapa dem.

## Vad jag kommer att ändra
1. Uppdatera live-endpointen `supabase/functions/get-staff-presence-day/index.ts` så att den kör samma sista steg som cache/backfill redan gör:
   - `computeDayEndDecision(...)`
   - `clampBlocksToDayEndDecision(...)`
2. Se till att det klampade resultatet returneras till admin-sidan i `reportCandidateBlocks`, så att UI:t inte längre får okapade block från live-vägen.
3. Synka diagnostics i live-svaret så att `dayEndDecision`, clamp-diagnostics och relaterade clarity-fält finns med även där, inte bara i `staff_day_report_cache`.
4. Säkerställa att summary-värdena som adminvyn visar bygger på de klampade blocken, så att minuter och status inte längre speglar pre-clamp-läget.
5. Lägga till/uppdatera tester för live-flödet runt dagsslut och öppna timers, så att historiska dagar och dagar som slutat inte kan fortsätta till nu.
6. Validera i preview direkt efter ändringarna och köra relevanta automatiska tester.

## Varför detta är rätt fix
Jag har verifierat att:
- `backfill-staff-day-report-cache` redan beräknar `dayEndDecision` och klampar blocken.
- adminsidan `src/pages/StaffTimeReports.tsx` anropar live-funktionen `get-staff-presence-day` direkt.
- `get-staff-presence-day` bygger report blocks men verkar inte köra samma slutliga dagssluts-klamp innan svaret returneras.

Det betyder att samma Time Engine används delvis, men adminvyn missar sista skyddslagret som stoppar dagar från att fortsätta.

## Tekniska detaljer
- Berörd backendkod:
  - `supabase/functions/get-staff-presence-day/index.ts`
  - ev. delad pure-helper-användning i `_shared/time-engine/*`
- Berörda tester:
  - Deno-tester för edge/shared Time Engine
  - ev. riktade frontend-/kontraktstester om summary/diagnostics-konsumtion påverkas
- Ingen ny appvy, ingen mobiländring, inga writes till legacy-tabeller.
- Ingen ändring av Time App, submission, attest, projektvy eller export.

## Validering efter implementation
- Kontrollera att historiska dagar inte längre har synliga block som slutar vid `now`.
- Kontrollera att öppna timers efter `endedAt` ignoreras/kapas.
- Kontrollera att diagnostics i live-svaret visar `dayEndDecision` och clamp-resultat.
- Köra relevanta tester och sedan verifiera beteendet i preview på `/staff-management/time-reports`.