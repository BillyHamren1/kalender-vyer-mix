## Mål
Övergå från dagens hybrid (auto workday + prompt activity + manuell EOD) till en ren **auto-first**-modell:

| Händelse | Idag | Ny modell |
|---|---|---|
| Geofence ENTER | auto-start workday + visa `UnifiedArrivalPrompt` för activity | auto-start workday **+ auto-start activity** (prompt visas bara vid äkta tvetydighet) |
| Geofence EXIT | endast anomaly + `workplace-exit`-event, timer fortsätter | **auto-stop activity** (samma stop-pipeline som manuell), audit via `assistant_events.departure` |
| Home arrival | `EndDayOnArrivalHomeDialog` föreslår sluttid | **auto-end activity + auto-end workday** (toast i efterhand, review-flagga om stort drift) |
| Review | är huvudvägen för normal in/utlogg | **endast vid osäkerhet/fel** (oklart slut, gap, anomalier, drift > tröskel) |

`assistant_events` behålls som audit/review-underlag. `arrival_prompt_log` degraderas till spegling/audit och driver inte längre normalflödet.

---

## Ändringar per fil

### 1. `src/hooks/useGeofencing.ts`
**Auto-start activity vid ENTER (alla tre kinds: location/booking/project).**

- Ta in `useTimerStartFlow` (eller en enklare variant) som dependency. Exporten av `useGeofencing` behöver inte ändras — vi accepterar en optional `autoStart` callback från caller (`MobileGlobalOverlays` / `useMobileTimers`-wrapper) för att undvika circular hook-deps.
- I varje ENTER-gren (project/booking/location), **efter** `autoStartWorkDay('geofence_enter')` och `reportArrival(...)`:
  - Anropa den injicerade `autoStartActivity({ kind, target_id, label, address?, arrivedAtIso })`.
  - Implementationen i caller använder `tryStartFromArrival()` (samma kontrakt som arrival-promptens "Ja"-knapp använder idag), så break-/conflict-/distance-pipeline återanvänds.
  - Om `autoStartActivity` returnerar `'conflict'` ELLER `'workday-failed'` → faller tillbaka på prompt (sätter `setGeofenceEvent` så `UnifiedArrivalPrompt` visas). Det är då vi har äkta osäkerhet.
- **Exit-grenarna**: bytas från "anomaly + DO NOT stop timer" till **auto-stop**:
  - Anropa en injicerad `autoStopActivity(key, exitedAtIso)` som internt kör `stopSession(target, { stopAtIso: exitedAtIso })` med samma pipeline (incl. break dialog över 5h).
  - Anomaly-spår (`fireAnomalyStart`/`Stop`) tas bort i den normala vägen — det blev dubbelhantering. Behåll bara om stop misslyckas (catch → `fireAnomalyStart` som review-underlag).
  - `dispatchEvent('workplace-exit', …)` behålls för listeners som EOD-reconciliation/`useLastShiftEndDetection`.
  - Kommentarer (rad 186, 668-672, 709, 782) skrivs om: byt "Pure signal — ingen auto-stop" → "Auto-stop via stopSession; departure-event = audit/review".
- `reportArrival` fortsätter kallas (idempotent server-side); `arrival_prompt_log` förblir audit men styr inget på klienten längre.

### 2. `src/hooks/useEndDayOnArrivalHome.ts`
**Byt från "förslagsdialog" till "auto-end day med review-flagga vid drift".**

- Behåll trigger (travel-completed inom hem-radie + cold-start guard + dagsspärr).
- Ersätt `setSuggestion(...)` med direkt körning:
  1. Hämta `lastWorkplaceExit` (samma anrop som idag) för att få `exitedAtIso`.
  2. Stoppa öppen timer via `stopSession(target, { stopAtIso: exitedAtIso, breakChoice: { kind: 'no_break' } })`. Vid pass > 5h: visa break-dialog i samma flöde (det är inte samma som review).
  3. Anropa `syncWorkDayEnd(exitedAtIso)`.
  4. Skriv `workday_flag` typ `home_arrival_auto_ended` (severity=info) som spår — alltid, inte bara vid drift > 30 min.
  5. Toast "Arbetsdag avslutad — du kom hem kl HH:MM. Justera i Översikt om något ser fel ut."
- Returnera bara `{ ranToday: boolean }`. Ta bort `suggestion`, `dismissSuggestion`, `acceptSuggestion`.
- Vid fel (server, inget exit-tidpunkt, etc.) → behåll dagens dialog-fallback men markera tydligt som "review needed". Skapa `assistant_event` typ `home_arrival` med `suggested_action='end_workday'` + `metadata.requires_review=true`.

### 3. `src/components/mobile-app/MobileGlobalOverlays.tsx`
- Plumba in `tryStartFromArrival` som `autoStartActivity` till `useGeofencing` (via en liten wrapper-prop eller en intern hook `useGeofenceAutoActivity`). Eftersom `useGeofencing` redan är centralt monterat någonstans (sannolikt via `useMobileTimers`), gör injektionen där den hooken instansieras — vi pekar bara ut kontraktet här.
- Ta bort renderingen av `EndDayOnArrivalHomeDialog` (hooken kör direkt nu). Behåll `LastShiftEndPrompt` — det är en review-yta, inte normal in/ut.
- `UnifiedArrivalPrompt` renderas fortfarande, men bara som **fallback** när auto-start gett `conflict`/`workday-failed`.

### 4. `supabase/functions/mobile-app-api/index.ts`
- `handleReportArrival` (rad 7599): kommentaren rad 7619-7624 ("Auto-checkin borttagen … Nu: arrival → prompt") **skrivs om** till "Auto-start workday här; activity startas av klienten omedelbart efter — ingen prompt i normalflödet". Ingen funktionsändring behövs server-side eftersom activity-start ändå går via `start_location_timer` / `start_booking_timer`-actions från klienten.
- `handleReportDeparture` (rad 7771): byt `suggested_action: 'end_activity'` → `suggested_action: 'audit_only'` och uppdatera kommentaren till "audit; klienten har redan auto-stoppat timern via stopSession". Ingen behavior-change.
- `handleReportHomeArrival`: behåll, men byt `suggested_action: 'end_workday'` → `'audit_only'` + lägg till `metadata.auto_ended=true` när klienten skickar det. Klienten skickar boolean i payload.
- `handleGetArrivalState` / `handleMarkArrivalResolved`: behåll oförändrade (legacy/audit), men lägg till en kommentarssektion överst:
  > **DEPRECATED FOR NORMAL FLOW (Auto-first 2026-04).** `arrival_prompt_log` används nu endast som audit-spegling och fallback för cron-pushen. Klienten driver normalflödet via auto-start och frågar bara `should_prompt` när auto-start misslyckats (conflict/workday-failed).
- (Inget DB-migration behövs — bara semantik och kommentarer.)

### 5. `src/services/mobileApiService.ts`
- Uppdatera kommentarerna ovanför `getArrivalState`, `markArrivalResolved`, `reportArrival`, `reportDeparture`, `reportHomeArrival`:
  - `reportArrival`: "Idempotent audit + autostartar workday server-side. Klienten startar activity direkt efter."
  - `reportDeparture`: stryk "Pure assistant signal — never stops a timer". Skriv: "Audit-event. Klienten har redan auto-stoppat aktiviteten via stopSession; serverraden är endast review-underlag."
  - `reportHomeArrival`: "Audit-event. Klienten har redan auto-avslutat workday + activity. Endast review-underlag."
  - `getArrivalState`/`markArrivalResolved`: markera som "Legacy/fallback. Normalflödet är auto-first; denna polling används bara av push-cron och som fallback om auto-start failade."

### 6. Day review-relaterade filer
- `src/pages/mobile/MobileDayReview.tsx`: ingen kodändring; lägg en kort kommentar i toppen som klargör att review nu är **undantagsvägen** ("Här hamnar dagar där auto-start/auto-stop inte räckte: oklart slut, drift > tröskel, gap, manuella anomalies").
- `src/test/dayReview/reviewStatus.oracle.ts` & `reviewStatus.scenarios.test.ts`: granska scenarier — ingen logikändring väntad eftersom `review_status` redan baseras på workday-tillstånd, inte på `arrival_prompt_log`. Lägg till ett scenario "auto_first_happy_path" som verifierar att en dag med ENTER+EXIT+HOME utan extra signaler hamnar i `ready` (inte `needs_review`).

### 7. `src/components/mobile-app/EndDayOnArrivalHomeDialog.tsx`
- Filen blir oanvänd i happy path. Behåll som fallback-dialog (renderas av `useEndDayOnArrivalHome` när auto-end day misslyckats). Uppdatera title/copy till "Något gick fel när dagen skulle avslutas — bekräfta sluttid".

---

## Klart när
- ENTER på känd geofence → workday + activity startade utan dialog (loggat i toast).
- EXIT från geofence → activity stoppad utan dialog (toast "Aktivitet avslutad").
- Hemankomst → workday + activity avslutas auto, toast bekräftar.
- `UnifiedArrivalPrompt` / `EndDayOnArrivalHomeDialog` visas endast vid conflict, workday-failed, eller server-fel.
- Inga kommentarer i koden påstår "Pure signal — never stops timer" eller "departure är bara review" om koden faktiskt stoppar.
- `arrival_prompt_log` skrivs fortfarande från `report_arrival` (audit) men driver inte UI:t.
- `assistant_events` fortsätter få arrival/departure/home_arrival som review-underlag.
- `MobileDayReview` visar bara dagar med faktiska review_reasons (inte längre "varje dag som hade en arrival_prompt").

## Vad som INTE ändras
- DB-schema (`arrival_prompt_log`, `assistant_events`, `workdays`, `workday_flags` förblir oförändrade).
- `useTimerStartFlow.tryStartFromArrival` (återanvänds som auto-start-motor).
- `stopSession` / break-dialog / `EndOfDayStopDialog` (återanvänds som auto-stop-motor).
- Push-cron och `arrival-reminder` edge function (fortsätter polla `should_prompt` som fallback).
- `useStaleDayReminder`, `useStaleDayCorrection`, `LastShiftEndPrompt` — review-ytor, ej normalflöde.
