
## Workday-implementation — pragmatisk filstruktur

**Princip:** En fil per ansvar, men inte mikro-splittring. Splitta först när filen närmar sig ~500 rader eller blandar tydligt olika ansvar.

### Filer som skapas

**Backend (Edge Functions)**
- `supabase/functions/workday/index.ts` — en funktion som hanterar `start`, `end`, `current` via `?action=` eller path. Delad auth, org-isolation, validering på ett ställe. (Hellre än tre nästan-identiska funktioner.)

**Frontend**
- `src/hooks/useWorkDay.ts` — en hook med `start()`, `end()`, `current`, `isLoading`, realtime-sub. Förväntad storlek ~150–250 rader, helt OK i en fil.
- `src/services/workdayApi.ts` — tunna fetch-wrappers mot edge-funktionen (om hooken börjar svälla, annars inline).

**Integration (ändringar i befintliga filer)**
- `src/hooks/useTimerStartFlow.ts` — anropa `workday.start()` vid första timer-start om ingen aktiv workday finns.
- `src/components/mobile-app/GlobalActiveTimerBanner.tsx` — anropa `workday.end()` när EOD-kön är dränerad (ersätter/komplementerar `workday-ended`-eventet).
- `src/hooks/useWorkDayTimer.ts` — läs server-state via `useWorkDay` istället för (eller som primär källa över) localStorage. localStorage blir offline-fallback.
- `src/components/mobile-app/WorkDayHeaderTimer.tsx` — ingen ändring behövs (den läser via useWorkDayTimer).

### Tester
- `src/test/workday/` — en fil per scenario-grupp:
  - `workdayLifecycle.test.ts` (start/end/current)
  - `workdayConcurrency.test.ts` (dubbel-start, end utan start, rollover)
  - `workdayIntegration.test.ts` (timer-start triggar workday-start, EOD triggar workday-end)
- Lägg till i `src/test/timeReporting.manifest.ts` så `bash scripts/test-time-reporting.sh` täcker det.

### Memory som uppdateras
- `mem://features/field-staff/workday-timer-v1.md` — utöka med server-anchor.
- `mem://preferences/file-size-and-modularity.md` — justera till "pragmatisk modularitet, riktmärke 500 rader, splitta vid blandade ansvar — inte vid 200".
- `mem://index.md` Core-rad uppdateras motsvarande.

### Leveransordning (en loop)
1. Edge function `workday` + memory-uppdatering.
2. `useWorkDay` + `workdayApi` (om behövs).
3. Integration i `useTimerStartFlow` + `GlobalActiveTimerBanner` + `useWorkDayTimer`.
4. Testfiler + manifest-uppdatering, kör `scripts/test-time-reporting.sh`.

Allt levereras i en loop. Säg kör så sätter jag igång.
