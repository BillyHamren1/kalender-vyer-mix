

## Mål

**EN start-funktion. ETT regelverk.** Manuell knapp, ankomst-popup ("Starta dagen?") och auto-geostart vid geofence-enter ska alla gå genom **exakt samma kodväg** — `requestStart() → evaluateStartConflict() → startSession()`. Ingen får längre ringa `startTimer()` direkt eller `startSession()` förbi konflikt-utvärderingen.

## Vad som händer idag (problemet)

Tre parallella vägar in i timer-systemet:

```text
                         ┌──────────────────────────┐
Manuell knapp i jobblistan┤ requestStart →           │
                         │ evaluateStartConflict →   │  ← konflikt-dialog OK
                         │ startTimer(rå)            │  ← använder INTE startSession
                         └──────────────────────────┘

Ankomst-popup            ┌──────────────────────────┐
("Starta dagen?")        │ startSession(workTarget)  │  ← INGEN konflikt-eval
                         └──────────────────────────┘

Geofence-enter           ┌──────────────────────────┐
(passivt, ingen popup)   │ startTimer(rå, system=true)│ ← INGEN konflikt-eval
                         └──────────────────────────┘
```

Resultat: lager-timer kan ticka medan en booking startas; arrival-popup ignorerar redan aktiv timer; geofence kan starta projekt-timer mitt i en annan utan switch-dialog.

## Vad som ska gälla efter fixen

```text
Alla tre källor → ett enda call:
   requestStart(target, label, doStart)
       │
       ├─ evaluateStartConflict(target, activeTimers)
       │     ├─ duplicate → no-op
       │     ├─ allow     → distance-check (om GPS) → startSession(target)
       │     └─ switch    → TimerConflictDialog → stopSession(gamla) → startSession(nya)
       │
       └─ startSession() är ENDA sättet att skapa en timer
            (raw startTimer() blir ett internt API)
```

## Vad användaren upplever

**Användaren kommer till Projekt eller Lager:**

1. **GPS upptäcker att de är inom geofence.** Background-positioning skickar position; arrival-state på servern flaggar `should_prompt = true`.
2. **EN popup visas: "Starta dagen?"** (`UnifiedArrivalPrompt`) — exakt samma dialog för Lager / Projekt / Booking, bara ikonen skiljer.
3. Användaren väljer **"Starta från {arrivaltid}"**, **"Starta nu"**, **"Anpassa tid"** eller **"Inte nu"**.
4. **Vid Starta** → går genom `requestStart()`:
   - Finns ingen aktiv timer → starta tyst.
   - Finns en annan timer → samma `TimerConflictDialog` som vid manuell start öppnas: *"Du har redan {X} igång. Stoppa och byt?"*
   - Användaren bekräftar → den gamla stoppas via `stopSession()` (inkl. break-dialog vid behov, save-then-stop), den nya startas.
5. **Om användaren stänger ankomst-popupen** ("Inte nu") och sedan trycker manuellt på Lager- eller Projekt-kortet → **samma flöde igen**, samma konflikt-regler, samma resultat.
6. **Bakgrundsstart utan popup** (om vi behåller passiv geo-start för t.ex. testning) **avlägsnas**. Geo-enter triggar bara arrival-prompten — start sker aldrig utan användarens medgivande. Det löser problemet med "fantom-timers" som dyker upp.

## Tekniska ändringar

**Fil 1: `src/components/mobile-app/MobileGlobalOverlays.tsx`**
- Importera `evaluateStartConflict` + `TimerConflictDialog`.
- Ersätt direkt `startSession(workTarget, …)` i `handleArrivalConfirm` med samma `requestStart()`-helper som MobileJobs använder.
- Lägg till lokalt `pendingStart` + `conflictEval` state och rendera `TimerConflictDialog` här när arrival-flödet kolliderar med befintlig timer.

**Fil 2: `src/pages/mobile/MobileJobs.tsx`**
- I `handleTimerToggle`, `handleProjectTimerToggle`, `handleLocationTimerToggle`: byt `startTimer(...)` inuti `doStart`-callbacken till `startSession(target, { startedAtIso? })`. Idag startar de via `startTimer` rått, vilket skippar break-policy och target-mappning som finns i `startSession`.
- I `handleGeofenceEvent` (rad ~40–80): **ta bort** den passiva auto-starten. Ersätt med en no-op + console-log; allt geo-styrt går nu via arrival-popup (servern flaggar `should_prompt`, popupen renderas av `MobileGlobalOverlays`).

**Fil 3 (extrahera helper): `src/lib/requestStart.ts` (ny)**
- Flytta `requestStart` + `confirmSwitch` + `cancelConflict`-logiken till en ren funktion / liten hook (`useTimerStartFlow`) så både `MobileGlobalOverlays` och `MobileJobs` använder identisk logik. Inga regelduplikat.

**Fil 4: `src/lib/timerConcurrency.ts`**
- Inga ändringar i regelmatrisen (den unified-regeln "en aktiv timer åt gången" från förra rundan står kvar).
- Lägg till en JSDoc-mening överst: *"Anropas från EN central plats (`useTimerStartFlow`). Direkta calls till startTimer/startSession utan konflikt-eval är förbjudet — fångas av kontraktstest."*

**Fil 5 (kontraktstest): `src/test/timerStartUnification.contract.test.ts` (ny)**
- Statisk grep-test: ingen fil utanför `useTimerStartFlow.ts` / `useWorkSession.tsx` får anropa `startTimer(` direkt eller `startSession(` utan att gå genom `requestStart`. Misslyckas builden om någon framtida kod försöker ta en genväg.
- Funktionell test: arrival-confirm med en aktiv lager-timer → `TimerConflictDialog` triggas (inte tyst start).

**Inga DB-ändringar. Inga edge-function-ändringar.** Servern (`getArrivalState` / `markArrivalResolved` / `startLocationTimer`) är redan unified.

## Filer som rörs
- `src/components/mobile-app/MobileGlobalOverlays.tsx` (omdirigera arrival → requestStart)
- `src/pages/mobile/MobileJobs.tsx` (byt `startTimer` → `startSession`, ta bort passiv geo-start)
- `src/lib/requestStart.ts` eller `src/hooks/useTimerStartFlow.ts` (NY — delad start-flödeshook)
- `src/lib/timerConcurrency.ts` (endast doc-uppdatering)
- `src/test/timerStartUnification.contract.test.ts` (NY — låser regeln)

## Validering efter implementation
- Scenario A: tom dag, kommer till Lager → arrival-popup → "Starta från 07:42" → en (1) location-timer skapas, ingen dubbel.
- Scenario B: lager-timer redan igång, kommer till projektplats → arrival-popup → "Starta nu" → konflikt-dialog → bekräfta → lager stoppas (save-then-stop), projekt-timer startar.
- Scenario C: lager-timer igång, trycker manuellt på projektkort i listan → exakt samma konflikt-dialog som B.
- Scenario D: avvisar arrival-popup ("Inte nu") → ingen timer startar; popupen kommer inte tillbaka samma minut (`markResolved` håller den tyst).
- Scenario E: kontraktstestet failar om någon framtida PR lägger till `startTimer(` eller `startSession(` utanför de vita listade filerna.

