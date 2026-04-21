

## Mål

När användaren lämnar dagens **sista planerade pass**: behandla det precis som vilken EXIT som helst (stoppa aktivitetstimer, starta restimer), MEN skicka dessutom en push + visa en in-app-prompt: *"Det ser ut som att du avslutat dagens sista uppdrag. Vill du avsluta dagen?"*. Användarens svar avgör vad som händer med den nystartade restimern.

## Flödet

```text
EXIT från sista pass
   ├─► Aktivitetstimer stoppas (befintligt save-then-stop)
   ├─► Restimer startar (befintligt useTravelDetection — INGEN ändring)
   └─► NEW: useLastShiftEndPrompt detekterar "sista pass idag" och triggar:
          • Push (Capacitor LocalNotifications + ev. FCM om appen är bakgrundad)
          • In-app dialog: LastShiftEndPrompt
```

**LastShiftEndPrompt — tre val:**

| Val | Vad händer |
|---|---|
| **Ja, avsluta dagen** | 1) Stoppa restimern direkt (`stopTravel` med nuvarande GPS som dest, klassas som `personal` → ingen arbetstid). 2) Dispatch `request-end-day` → befintligt EOD-flöde stänger ev. kvarvarande timers. 3) Skriv `workday_flag: ended_after_last_shift` (info, ej allvarlig). |
| **Nej, jag jobbar vidare** | Ingen ändring. Restimer fortsätter rulla. Prompten tystas resten av dagen. Nästa geofence-ENTER fungerar som vanligt. |
| **Påminn senare (15 min)** | Snooze. Restimer rullar. Ny prompt om 15 min om inget hänt. |

Om användaren ignorerar prompten helt och en geofence-ENTER på en känd arbetsplats inträffar inom 60 min → prompten dismissas tyst (de jobbar uppenbarligen vidare).

## Detektering — "sista pass idag"

Ny hook: `src/hooks/useLastShiftEndDetection.ts`
- Lyssnar på `eventflow-stop-travel`-event är fel signal — vi behöver istället lyssna på **timer-stopp som triggas av geofence-EXIT**. Lägg in en custom event `activity-timer-stopped-by-exit` som dispatchas från `useGeofencing` när den kallar `saveAndStopTimer` p.g.a. EXIT.
- Hooken hämtar `useScheduledShifts()` och kollar:
  - Var den just stoppade timern kopplad till dagens **senaste** `shift.end_time` (inom ±2h tolerans)?
  - Finns inga fler `shifts` med `start_time > now` idag?
- Om ja båda → öppna prompten + skicka push.

## Push-leverans

- Använd befintliga `pushNotificationService.ts`-infrastrukturen (FCM redan integrerad).
- För lokalt fall (appen i förgrunden): visa bara dialogen, ingen push behövs.
- För bakgrundsfall: skicka via Capacitor `LocalNotifications` (lägga till `@capacitor/local-notifications`) med tap-action som öppnar appen och triggar dialogen.
- Notisen är **lokalt schemalagd** — ingen serverside-edge-function behövs eftersom triggern är klient-side (geofence-EXIT).

## Filer

**Nya:**
- `src/hooks/useLastShiftEndDetection.ts` — lyssnar på exit-event + scheduledShifts, beslutar om prompt.
- `src/components/mobile-app/LastShiftEndPrompt.tsx` — dialogen med tre knappar.

**Ändras:**
- `src/hooks/useGeofencing.ts` — dispatcha `activity-timer-stopped-by-exit`-event efter att EXIT-stoppet sparats (med `{ timerKey, bookingId, stoppedAtIso }`).
- `src/components/mobile-app/MobileGlobalOverlays.tsx` — montera `useLastShiftEndDetection` + rendera `<LastShiftEndPrompt />`.
- `src/services/pushNotificationService.ts` — exponera `scheduleLocalNotification(title, body)` wrapper.
- `package.json` — lägg till `@capacitor/local-notifications`.

**Inga DB-migrationer.** `workday_flag: ended_after_last_shift` använder befintlig tabell.

## Edge cases

- **Restimer redan stoppad** (användaren tappade nät, geofence-ENTER på lager hann före): prompten visas inte, allt är redan reglerat.
- **Användaren har flera pass kvar idag men hoppar över ett**: vi triggar bara på sista `shift.end_time`. Hoppade pass detekteras separat (utanför scope).
- **Ingen `shifts`-data alls** (offline/fel): prompten triggar inte. Befintligt `last_workplace_for_day`-fallback (kvällsfönster) tar vid.
- **Samma pass har flera EXIT/ENTER** (toalettpaus utanför geofence): prompten visas max 1 ggr/dag — `localStorage`-suppress per datum.

## Validering

- **A**: Sista pass slutar 17:00, användaren EXIT 16:50 → timer stoppas, restimer startar, prompt + push visas inom 5 sek.
- **B**: Användaren trycker "Ja, avsluta dagen" → restimer stängs som personal, EOD körs, dagstimer rensas.
- **C**: Användaren trycker "Nej" → restimer rullar, prompten visas inte igen idag.
- **D**: Användaren ignorerar prompten, kör till annat lager (geofence-ENTER) inom 60 min → prompt försvinner tyst.
- **E**: Användaren har två pass kvar — EXIT från det näst sista triggar **inte** prompten.

