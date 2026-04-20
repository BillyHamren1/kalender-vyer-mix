

## Mål
"Är du säker?"-frågan vid timer-start utanför geofence ska **alltid** trigga, oavsett startyta — inte bara i två av tre filer.

## Status idag
| Yta | Distance-warning |
|---|---|
| MobileJobs (jobblistan) | ✅ Finns |
| MobileJobDetail (jobbsidan) | ✅ Finns |
| MobileLocationDetail (lagersidan: lager-task + general timer) | ❌ Saknas |
| Övriga `startSession`-anrop (banner, assistent, framtida ytor) | ❌ Inget skydd |

Logiken är dessutom **kopierad** i de två befintliga ytorna → svår att underhålla, lätt att glömma.

## Fix (3 små steg)

### 1. Centralisera i `useWorkSession`
Lägg till en gemensam helper i `useWorkSession.tsx`:

```ts
// Returnerar coords för ett target genom att slå upp i bookings/orgLocations.
// startSessionWithDistanceCheck(target, opts, onNeedConfirm) →
//   • inom radien eller utan koordinater eller utan GPS → startar direkt
//   • utanför radien → kallar onNeedConfirm({ placeName, distance, confirm })
//     istället för att starta. Konsumenten visar dialogen och kallar confirm().
```

`useWorkSession` har redan `bookings` + tillgång till `geo.userPosition`. Lägg till `orgLocations` från `useGeofencing` (finns redan internt) i exponerad form, så vi kan slå upp coords för alla tre target-typer:
- `booking` → `bookings.find(b.id===…).delivery_latitude/longitude`
- `project` → första underliggande booking med coords (samma logik som idag i MobileJobs)
- `location` → `orgLocations.find(l.id===…).latitude/longitude`

### 2. Använd i alla startytor
- **MobileJobs**: ersätt lokala `checkDistanceAndStart` → använd `startSessionWithDistanceCheck`. Behåll `requestStart` (concurrency), kalla nya helpern inuti `doStart`.
- **MobileJobDetail**: ersätt inline `if (dist > ENTER_RADIUS)` → samma helper.
- **MobileLocationDetail**: lägg till `DistanceWarningDialog` + använd helpern både i `handleStartTaskTimer` och `handleStartGeneralTimer`.

Resultatet: dialogen renderas där (1 instans per sida räcker, identiskt med idag), men beslutet att visa den fattas på ett enda ställe.

### 3. Försiktig fallback
- Om `userPosition` saknas (GPS av) → starta direkt utan dialog (oförändrat beteende — vi kan inte gissa).
- Om target saknar coords → starta direkt (oförändrat).
- Radie = `getGpsSettings().radius || ENTER_RADIUS` (samma som geofence-detektorn använder, så frågan kommer i samma takt som geofence inte triggar enter).

## Filer som ändras
- `src/hooks/useWorkSession.tsx` — ny exporterad helper + expose coords-uppslag.
- `src/pages/mobile/MobileJobs.tsx` — ta bort lokal `checkDistanceAndStart`.
- `src/pages/mobile/MobileJobDetail.tsx` — ta bort inline distance-check.
- `src/pages/mobile/MobileLocationDetail.tsx` — lägg till `DistanceWarningDialog` + använd helpern (huvudfix för användarens scenario om det handlar om lagerstart).

## Test (utöver din quality gate)
Lägg till ett kontraktstest i `src/test/`:
- Start utanför radien → helper returnerar `needsConfirm` med rätt distance/placeName, ingen `startTimer`-call.
- Start innanför radien → ingen confirm, `startTimer` anropas direkt.
- Saknad GPS / saknade coords → ingen confirm, startar direkt.
- Test för alla tre target-typer (booking, project, location).

## Vad som INTE ändras
- `DistanceWarningDialog`-komponenten (oförändrad UI).
- Geofence auto-enter-prompt (orörd).
- Concurrency-flöde (`evaluateStartConflict`/`TimerConflictDialog`) — kompletterar fortfarande, distance-check körs *efter* concurrency-OK precis som idag.

