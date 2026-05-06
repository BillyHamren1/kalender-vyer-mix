## Problem

Auto-switch från lager-arrival (location) → stoppar projekt-timer fungerar bara **första gången** personen besöker en plats per session. Andra besöket samma dag triggar ingenting eftersom `triggeredEnterRef` aldrig städas när personen lämnar utan aktiv timer.

Konkret från Nanas dag: FA Warehouse besöktes 05:47 (timer startad+stoppad), och kl 12:28 igen — andra besöket gjorde ingenting eftersom `location-<FA>` låg kvar i `triggeredEnterRef`.

## Lösning

Gör städningen av `triggeredEnterRef` oberoende av om en timer är aktiv. Två kompletterande ändringar i `src/hooks/useGeofencing.ts`:

**1. Stable-EXIT städar alltid `triggeredEnterRef`** — i alla tre EXIT-grenar (project / booking / location), kör en separat "presence-exit" som spårar utflyttning även när `hasTimer === false`. Använder samma `evaluateExit`-tracker; ingen ny logik behövs, bara att gate-villkoret `&& hasTimer` flyttas så att tracker-utvärderingen körs alltid och *bara stop-action* gate:as på `hasTimer`.

```ts
// Före: hela blocket gate:at på hasTimer → ingen städning utan timer.
// Efter: ev. evaluateras alltid; om stable/stale → cleara triggeredEnterRef.
//        Stop-action körs bara om hasTimer.
```

**2. Hard reset vid mycket gammal enter** — `triggeredEnterRef` får också rensas om en timer för key:n stoppats (vi noterar `lastStopAtMs` per key). Failsafe ifall stable-EXIT aldrig hinner triggas (t.ex. snabbt ut-och-in på 10 sek).

## Effekt på Nanas case

- 05:47 ENTER FA Warehouse → location-timer startas, `triggeredEnterRef` får `location-<FA>`.
- 07:00 timer stoppas (auto-switch till projektet).
- 07:00–07:16 stable-EXIT från FA Warehouse → städar `location-<FA>` ur `triggeredEnterRef` (ny ändring).
- 12:28 ENTER FA Warehouse igen → villkoret `!triggeredEnterRef.has(...)` är nu sant → `tryAutoSwitchFromArrival` körs → konflikt med aktiv project-timer (Westers) → switch enligt `timerConcurrency` → projekt-timern stoppas vid 12:28, location-presence-timer startas.

## Filer

- `src/hooks/useGeofencing.ts` — flytta `&& hasTimer`-gaten i tre EXIT-grenar.
- `src/test/` — lägg till regressionstest: andra besöket till samma location startar ny presence-timer / triggar switch.

## Out of scope

- Backfill för Nanas befintliga dag (inget data ändras retroaktivt).
- Ändring av `timerConcurrency`-matrisen (location+project = switch är redan rätt regel).
