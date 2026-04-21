

## Mål

Rest-timern (`travel_time_logs`) ska **inte stoppas** bara för att GPS-hastigheten faller under tröskeln vid en okänd adress (Bauhaus, lunch, tankstation, etc.). Den ska fortsätta rulla tills användaren faktiskt **anländer till en känd arbetsplats** (lager, projekt-geofence, booking-geofence) **eller startar en ny aktivitets-timer manuellt**.

## Problem idag

I `src/hooks/useTravelDetection.ts`:

```text
Speed < 1.0 m/s i 60s  ──►  stopTravel()  ──►  travel_time_logs stängs
```

Det betyder att så fort bilen står still 1 minut (rött ljus räknas inte, men parkering på Bauhaus gör det) → resan avslutas och en `TravelCompletedDialog` poppar upp. Det är fel modell.

## Ny modell: rest-timern stoppas BARA av ankomst eller ny aktivitet

```text
Travel pågår
   │
   ├─ Speed faller → IGNORERAS (timern fortsätter)
   │
   ├─ GPS-position inom känd geofence (lager / projekt / booking)
   │     └─► stopTravel(arrivalLocation)
   │
   └─ requestStart() lyckas starta ny aktivitets-timer (manuellt eller via arrival-popup)
         └─► stopTravel(newTarget) körs FÖRST i useTimerStartFlow
```

Dvs: **endast två giltiga stop-triggers** för en travel-rad:
1. **Geofence ENTER** på en känd arbetsplats (lager / projekt / booking).
2. **Ny aktivitets-timer startar** via `useTimerStartFlow`.

Stillastående utan geofence-träff = användaren är på ett okänt ärende mitt i resan. Timern rullar.

## Tekniska ändringar

**Fil 1: `src/hooks/useTravelDetection.ts`**
- Ta bort hela `STOP_DEBOUNCE`-blocket (raderna ~270–285) som idag stänger travel via låg hastighet.
- Behåll `SPEED_THRESHOLD` + `START_DEBOUNCE` för auto-start.
- `stopTravel(lat, lng)` blir nu en **publik funktion** som ENDAST kallas externt — inte längre internt från speed-loopen.
- Ta bort `TravelCompletedDialog`-triggern på auto-stop (den ska inte längre dyka upp mitt på dagen — klassificering sker vid dagsslut enligt tidigare beslut).

**Fil 2: `src/hooks/useGeofencing.ts`** (eller där geofence-events fångas)
- I geofence-`ENTER`-handlern (för warehouse / project / booking): om `travelDetection.travelState.isMoving === true` → kalla `travelDetection.stopTravel(lat, lng)` med arrivalplatsen som destination.
- Detta gäller alla typer av kända geofences (lager, projekt, booking-adress).

**Fil 3: `src/hooks/useTimerStartFlow.ts`**
- I `startSession()`-flödet, **innan** ny timer startas: om en travel-rad är öppen → kalla `travelDetection.stopTravel(currentLat, currentLng)` så den stängs med den nya aktivitetens position som destination.
- Detta täcker manuell start, arrival-popup-start och alla framtida start-källor (eftersom alla går genom denna hook efter förra rundan).

**Fil 4: `src/components/mobile-app/TravelCompletedDialog.tsx`** (eller där den triggas)
- Skippa rendering helt om `completedTravel` har skapats av auto-flöde (geofence/start). Klassificering skjuts upp till dagsslut (hanteras i nästa skede).
- Manuell stop (om användaren ändå vill avbryta resan) får fortsatt visa dialogen — men det är edge case.

**Fil 5: `src/components/mobile-app/GlobalActiveTimerBanner.tsx`**
- Visa "Resa pågår" hela tiden travel-raden är öppen — även när bilen står still. Ingen ändring behövs, men säkerställ att etiketten inte byter till "Stillastående" eller liknande.

**Inga DB-ändringar. Inga edge-function-ändringar.** All logik ligger i klienten.

## Filer som rörs

- `src/hooks/useTravelDetection.ts` (ta bort speed-baserad auto-stop)
- `src/hooks/useGeofencing.ts` (ENTER på känd plats stänger travel)
- `src/hooks/useTimerStartFlow.ts` (start av ny timer stänger travel först)
- `src/components/mobile-app/TravelCompletedDialog.tsx` (skippa auto-flöden)

## Validering

- **A**: Lämna lager → travel startar (speed > 2 m/s i 15s) → kör till Bauhaus → parkera 30 min → travel **fortsätter rulla**, ingen popup.
- **B**: Kör tillbaka till lager → geofence ENTER → travel stoppas automatiskt med lager som destination, lager-arrival-popup visas (befintligt flöde).
- **C**: Kör direkt från Bauhaus till projekt-X → geofence ENTER på projekt-X → travel stoppas med projekt-X som destination, projekt-arrival-popup visas.
- **D**: Mitt under resan startar användaren manuellt en projekt-timer från listan → travel stoppas via `useTimerStartFlow`, projekt-timern startar.
- **E**: Inga `TravelCompletedDialog`-popups dyker upp under dagen — klassificering sker vid dagsslut (nästa skede).

