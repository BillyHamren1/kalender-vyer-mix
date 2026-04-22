

# Fix: Travel-timern stannar inte när du redan är på lagret

## Vad som hände
- 09:40 startade restimern (Bauhaus-ish → mot lagret).
- 09:43 anlände du till FA Warehouse (du är ~40m från lagrets centrum, geofence-radie 200m).
- Restimern fortsatte ändå att ticka — den står på 00:43:38 fast du sitter still på lagret.

## Rotorsak (verifierat mot DB + kod)
I `useGeofencing.ts` skickas `STOP_TRAVEL_EVENT` (signalen som stoppar `travel_time_logs`) bara i en mycket smal ENTER-gren:

```text
om (inom radie) OCH (ingen aktiv timer för platsen) OCH (inte redan triggrat ENTER i minnet)
   → emitStopTravelOnArrival()
```

Det betyder att travel-raden bara stängs om geofencen "transitionar" från ute → inne **just i den browsersession** travel startades. Allt annat tystar stoppet:
- App omstartad / fliken refreshad medan du redan var inne → ingen ENTER-transition → travel stannar inte.
- Lager-/projekt-timer redan aktiv (`hasTimer = true`) → hela ENTER-blocket hoppas över → travel stannar inte.
- ENTER triggrades en gång tidigare i sessionen (`triggeredEnterRef.current.has(key)`) → resan startar igen senare, du kommer tillbaka till lagret, ingen ny ENTER fyras → travel stannar inte.

DB bekräftar: din travel-rad `7a9c…b38` är öppen (end_time = NULL) och du har ingen `location_time_entries`-rad för lagret idag, men `staff_locations` visar att du är 40m från FA Warehouse-centrum sedan 09:25.

## Fix

Bryt ut "är jag inne i en känd geofence?" till en separat, **timer-oberoende** check som körs varje GPS-tick **så länge en travel-rad är öppen**:

1. Ny effekt i `useGeofencing.ts` (eller direkt i `useTravelDetection.ts`):
   - Om `travelState.activeTravelLogId` finns OCH `userPosition` ligger inom någon känd geofence (org_location ELLER booking ELLER large_project som du är assigned på)
   - → fyra `STOP_TRAVEL_EVENT` med din nuvarande position, oberoende av `hasTimer` / `triggeredEnterRef` / accuracy-gating.
2. Behåll befintlig ENTER-logik för UI-prompten ("Du är på X — vill du klocka in?"). Bara stop-signalen frikopplas.
3. Lägg till en watchdog: när `useTravelDetection` mountar och en öppen travel-rad finns i state, gör en engångskoll mot senaste GPS-position direkt — så ett app-reload på lagret stänger raden inom sekunder istället för att vänta på en transition som aldrig kommer.
4. Logga tydligt i konsolen: `[TravelDetection] Stopping travel — user already inside <name> geofence`.

## Tekniska detaljer

Filer som ändras:
- `src/hooks/useGeofencing.ts` — ny "presence stop"-effekt som löper parallellt med ENTER-logiken.
- `src/hooks/useTravelDetection.ts` — vid mount, om `activeTravelLogId` finns och vi har en GPS-position, dispatch:a `STOP_TRAVEL_EVENT` för att utvärderas av geofencing-hooken (eller direkt om vi vet att vi är inne).

Vad som **inte** ändras:
- ENTER/EXIT-promptar, anomaly-tracking, arrival-prompt-flödet, klassificeringsdialog.
- Backend (`mobile-app-api.handleStopTravelLog`) — anropas via befintlig `mobileApi.stopTravelLog`.
- Restimerns auto-START-logik (15s sustained speed). Den är OK.

## Engångsstädning
Din nuvarande öppna rad (`7a9c8eb2-f9bf-48ff-9726-19a7e8789b38`) stängs automatiskt så fort fixen är live och appen tar nästa GPS-tick på lagret. Vill du att jag även stänger den manuellt i samma deploy med end_time = nu och to_address = FA Warehouse? (Default: ja, så slipper du jaga den.)

## Resultat
- Restimern stannar inom någon sekund efter att du anländer till lagret/projektet/bokningen — även om appen startats om eller en lager-timer redan körde.
- "På resa" försvinner från headern direkt och dagen visar korrekt **23:53 → 09:43 = Resa**, sedan **09:43 → pågår = Lager**.

