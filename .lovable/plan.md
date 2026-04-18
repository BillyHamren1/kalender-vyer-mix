

Användaren säger:
- Befintliga `source = 'location_auto'`-rapporter får vara (ingen migration för cleanup)
- Push-flöde: direkt vid ankomst, sedan efter 30 min, sedan efter 30 min till (alltså 0 / 30 / 60 min)
- Logiken ska vara densamma oavsett om användaren öppnar appen via push eller manuellt — samma "vill du starta dagen?"-prompt visas alltid när man har varit inom geofence utan aktiv timer

Uppdaterar plan.

## Plan: Audit-fixar + ankomst-prompt-flöde

### Beslut (uppdaterade)
- **Nattskift**: HH:mm < 12:00 → nästa dag
- **Update av rapport**: orphan-strategi (`time_report_id = NULL`)
- **Auto-rapport från geofence**: tas bort framåt. Befintliga `source = 'location_auto'`-rapporter lämnas orörda.
- **Övertids-cap**: ta bort 6h-capen i `update_time_report`
- **Ankomst-prompt**: push direkt vid ankomst, sedan +30 min, sedan +60 min (max 3 prompts). Samma logik visas i appen vid öppning om användaren är inom geofence utan aktiv timer — push är bara en notifiering, inte en separat väg.

### A. Akut
- **A1**: Fixa syntaxfel `})` i `handleCreateEndOfDayAnomaly`
- **A2**: Nattskift i `EndOfDayStopDialog.buildCustomIso`
- **A3**: Migration: inaktivera trigger `sync_location_entry_to_time_report` (skapar inga nya `location_auto`-rapporter). UNIQUE-constraint: max en öppen `time_reports` per `(staff_id, report_date)` där `end_time IS NULL`.

### B. Ankomst-prompt-flöde (gemensam logik för push + appöppning)
- **B1**: Edge function `handleArrivalState` — returnerar `{ should_prompt: bool, arrived_at: ISO, location_id, location_name, prompts_sent: number }`. Avgör samma sak för både push-jobbet och appen.
- **B2**: Mobilappen anropar `handleArrivalState` vid varje öppning + var 60:e sek när öppen. Om `should_prompt === true` → visa `ArrivalPromptDialog`.
- **B3**: `ArrivalPromptDialog` med två knappar ("Starta nu", "Starta från ankomst-tid XX:XX") + liten "Anpassa tid"-länk som öppnar tidväljare.
- **B4**: Cron-jobb (var 5:e min) anropar `handleArrivalReminder` som kollar alla staff inom geofence utan aktiv timer, skickar push enligt schema 0/30/60 min sedan första GPS-ankomst. Räknar prompts via ny tabell `arrival_prompt_log(staff_id, location_id, arrived_at, prompt_count, last_prompt_at)`.
- **B5**: När timern startas → markera `arrival_prompt_log.resolved = true` så cron slutar skicka. Vid nytt geofence-exit → ny rad nästa gång.

### C. Övriga audit-fixar
- **C1**: `update_time_report` orphan-länkar anomalies + GPS-history
- **C2**: `handleCreateEndOfDayAnomaly` filtrerar open-anomaly på `started_at = lastExitIso`
- **C3**: `GlobalActiveTimerBanner.handleStop` anropar `closeOpenAnomalies` i icke-EOD-vägen
- **C4**: Ta bort 6h-cap i `update_time_report`
- **C5**: UNIQUE partial index `location_time_entries(staff_id, location_id) WHERE exited_at IS NULL`
- **C6**: Admin-roll-check i `handleGetMovementForDay`
- **C7**: Server-throttling 15s för `staff_location_history`
- **C8**: Pending-stop-fallback i localStorage
- **C9**: Undvik dubbel paus-deduktion i `handleClassifyAnomaly`

### Filer
- `supabase/functions/mobile-app-api/index.ts` (A1, B1, C1, C2, C6, C7, C9)
- `supabase/functions/arrival-reminder/index.ts` (NY — B4 cron)
- `src/components/mobile-app/EndOfDayStopDialog.tsx` (A2)
- `src/components/mobile-app/ArrivalPromptDialog.tsx` (NY — B3)
- `src/components/mobile-app/GlobalActiveTimerBanner.tsx` (C3, C8)
- `src/hooks/useArrivalPrompt.ts` (NY — B2 polling)
- 3 migrations:
  - Inaktivera `sync_location_entry_to_time_report`-trigger + UNIQUE-constraint på time_reports (A3)
  - Ny tabell `arrival_prompt_log` + UNIQUE-index på `location_time_entries` (B4, C5)
  - Cron-schema för `arrival-reminder` var 5:e min (B4)
- `update_time_report` orphan + remove cap (C1, C4)

