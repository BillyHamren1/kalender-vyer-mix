

## Härda tidrapportering med uttömmande scenarie-tester

### Bakgrund
De hängande "Pågående"-raderna kommer från sessioner som startades **innan** dagens stora arbete (work-session-engine, end-day-vs-end-activity, workday_flags, unified-timer, save-then-stop). De nya skrivvägarna stänger redan presence korrekt — men vi har inga tester som bevisar att det funkar för verkliga driftsscenarier i hela kedjan. Imorgon är ett nytt fältdag och vi vill veta att det håller.

### Vad jag bygger
Tre nya kontrakts-test-suiter som kör mot riktiga skrivvägar (mobile-app-api + work-session-engine) och täcker scenarier som faktiskt producerade dagens hängande rader.

**1. `src/test/locationPresenceLifecycle.contract.test.ts` (frontend, vitest)**
Låser fast att location-presence (`location_time_entries`) alltid stängs i alla relevanta vägar:

- A. GPS-enter → GPS-exit (normalt) → `exited_at` sätts
- B. GPS-enter → app dödas mitt i pass → nästa `update_location` (även från annan plats) stänger entryn med `exited_at` = sista kända GPS-tid
- C. GPS-enter → ingen ny puls i 31 min → cron-stängning till sista GPS-tid
- D. **Manuell** location-start ("Starta dag på Lager") → `endDay` → manuell entry stängs i samma anrop (regression-skydd för Ranjan-fallet)
- E. Manuell location-start → booking-timer startas → location stängs ej (parallellt OK enligt timer-concurrency)
- F. Manuell location-start → `stopSession` på *booking* → location ligger kvar (skild signal)
- G. Manuell location-start → `endDay` → BÅDE booking och location stängs
- H. Två location-presence-rader öppna (sällsynt race) → `endDay` stänger båda
- I. Entry från igår fortfarande öppen → cron stänger till `entry_date 23:59`
- J. presenceOnly:false (reportable) → vid stop skapas time_report OCH presence stängs
- K. presenceOnly:true (default) → vid stop INGEN time_report men presence stängs

**2. `src/test/endDayReconciliation.contract.test.ts` (frontend, vitest)**
Kontrakt för EOD-flödet end-to-end:

- L. `endDay` med 1 booking + 1 location → båda får `exited_at`, ett `time_report` skapas, en `workday_flag` (auto_closed_on_day_end) loggas på location
- M. `endDay` när ingen timer är aktiv → no-op, ingen 4xx, EOD-dialog kan stänga rent
- N. `endDay` när save-then-stop misslyckas på sista bokningen → location stängs ändå EJ förrän save lyckats (atomicitet)
- O. `endDay` triggar `request-end-day`-event → `GlobalActiveTimerBanner` stoppar enda aktiva timern via samma flöde (assistent-integration-låsning)
- P. EOD-dialog stänger inte automatiskt vid nätverksfel (regression-skydd från PROMPT 4)
- Q. `endDay` skickad två gånger snabbt → server-side idempotency, ingen dubbelrapport, location stängs en gång
- R. `endDay` när telefon är offline → kö persisterar över reload → vid reconnect stängs location med korrekt tidsstämpel (sista lokala signal, inte `now()`)

**3. `src/test/staleEntryAutoClose.contract.test.ts` (backend, deno)**
Kontrakt för server-side stängningsregler i `mobile-app-api` + ny `close-stale-location-entries`-funktion:

- S. `update_location`-puls > 15 min efter senaste GPS → öppna GPS-entries stängs till `staff_locations.updated_at`
- T. `handleStopLocationTimer` utan `location_id` (= booking/EOD-stop) stänger ALLA öppna location-presence på samma staff/dag, oavsett `source`
- U. Cron med `gps`-entry > 30 min stale → stäng till sista GPS, skapa `workday_flag.auto_closed_stale_entry`
- V. Cron med `manual`-entry > 12h öppen → stäng till `entered_at + 8h`, flagga
- W. Cron med entry från `entry_date < today` → stäng till `entry_date 23:59`, flagga
- X. Auth-guard: cron-endpoint kräver service-role / cron-secret (ingen klient-bypass)
- Y. Idempotens: kör cron två gånger i rad → andra körningen är no-op (inga dubbla flaggor, ingen ändring av redan-stängda entries)
- Z. Multi-tenant: cron stänger BARA inom samma `organization_id`, korsar inte org-gränser

### Manifest + scripts
Lägg till alla tre filer i:
- `src/test/timeReporting.manifest.ts` (frontend-arrayen + en ny `backend`-rad för deno-suiten)
- `scripts/test-time-reporting.sh` (samma)

Så de körs varje gång som del av `npm run test:time-reporting` / `bash scripts/test-time-reporting.sh`.

### Vad jag INTE rör nu
- Ingen ändring av produktionskod (work-session-engine, mobile-app-api, useGeofencing).
- Ingen ny edge function. Om något test röd-flaggar en faktisk bugg så fixar vi det i en separat runda — denna leverans är **bevis-på-att-det-funkar**.
- Ingen DB-migration.

### Berörda filer
- `src/test/locationPresenceLifecycle.contract.test.ts` (ny)
- `src/test/endDayReconciliation.contract.test.ts` (ny)
- `src/test/staleEntryAutoClose.contract.test.ts` (ny — placeras under `supabase/functions/mobile-app-api/` om det är deno-test, alt. som vitest-mock om vi vill köra utan deno; jag kör **deno** för realism)
- `src/test/timeReporting.manifest.ts` (uppdatering)
- `scripts/test-time-reporting.sh` (uppdatering)

### QA efter implementation
1. `bash scripts/test-time-reporting.sh` → alla nya scenarier (A–Z) kör grönt.
2. Granska konsoll-output: varje scenario ska skriva ut sin bokstavskod så det är lätt att se vilken regel som testas.
3. Om någon röd → vi vet **exakt** vilken kombination som hänger imorgon, och kan fixa innan dagstart.
4. Manifest-filen + shell-scriptet listar alla tre nya testfiler.

