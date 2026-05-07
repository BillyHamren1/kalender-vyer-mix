## Mål

Ta bort hårdkodad `hasActiveTimer: false` i `useBackgroundLocationReporter.ts` så att `active_timer`-mode i `locationMode.ts` kan väljas på riktigt. Använd backend-driven workday-signal som primär källa, localStorage som fallback.

## Bakgrund

`computeMode()` (rad 257) anropar redan `readHasActiveTimer()` korrekt, men `setDebug()`-objektet på rad 144 (initial state) och rad 233 är frikopplade från den verkliga signalen. Mer kritiskt: själva timer-cachen `eventflow-mobile-timers` skrivs av `useGeofencing.ts`, men det finns ingen workday-signal — så `idle` → `active_timer`-övergång missar fall där workday är öppen utan en aktivitetstimer.

## Plan

### 1. Ny lättviktig store — `src/lib/workday/workdayActiveSignal.ts`

Ren localStorage-spegel av "är workday öppen just nu?":
```ts
const WORKDAY_ACTIVE_KEY = 'eventflow-workday-active';
export function setWorkdayActive(active: boolean): void { … }
export function isWorkdayActive(): boolean { … }
```

Authority = backend `workday/current` via `useWorkDay`. Cachen är bara hint.

### 2. `src/hooks/useWorkDay.ts` skriver till storen

I `setCurrent`-vägarna (refresh, realtime, optimistic start/end-events, `start`/`end`/`ensureActive`) → `setWorkdayActive(!!workday && !workday.ended_at)`. Plus en `useEffect` som speglar `current`-state till storen (en rad).

### 3. `src/hooks/useBackgroundLocationReporter.ts` använder kombinerad signal

```ts
import { isWorkdayActive } from '@/lib/workday/workdayActiveSignal';

function readHasActiveSession(): boolean {
  // Workday öppen ELLER aktivitetstimer igång → vi är "i jobbet" → active_timer mode
  return isWorkdayActive() || readHasActiveTimer();
}
```

- Initial `setDebug({ hasActiveTimer: false })` på rad 144 → `hasActiveTimer: readHasActiveSession()`
- Anropet på rad 233 (`hasActiveTimer: readHasActiveTimer()`) → `readHasActiveSession()`
- `decideLocationMode`-anropet på rad 257 → `hasActiveTimer: readHasActiveSession()`

`hasActiveTimer: false` försvinner som hårdkodning. Falsk endast när både workday och timer-cache verkligen är tomma.

## Filer som ändras/skapas

- ✅ Ny: `src/lib/workday/workdayActiveSignal.ts`
- ✏️ `src/hooks/useWorkDay.ts` — spegla `current` till `setWorkdayActive` (4–5 platser eller en useEffect)
- ✏️ `src/hooks/useBackgroundLocationReporter.ts` — `readHasActiveSession` + 3 ersättningar

## Acceptans

- `rg "hasActiveTimer: false" src/` returnerar inga träffar i `useBackgroundLocationReporter.ts`
- Aktiv workday → `decideLocationMode` får `hasActiveTimer: true` → `active_timer` mode (12s/10m i foreground-varianten, 60s/50m i normalt active_timer)
- Stängd workday + tom timer-cache + långt från target → fortfarande `idle`/`workday_far` low-power tracking
- Cold-boot innan `useWorkDay.refresh()` hunnit svara → fallback till localStorage-cachen från senaste sessionen
