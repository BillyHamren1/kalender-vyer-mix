---
name: WorkDay Timer (Day Clock) — server-anchored
description: Header day-timer is now anchored to the `workdays` table via the `workday` edge function; localStorage remains the offline cache.
type: feature
---
EventFlow Time visar en lugn "dagtimer" i headern (`WorkDayHeaderTimer`). Lokal tickning kommer från `useWorkDayTimer` (localStorage-baserad), men sanningen är **server-anchored** sedan v2.

## Server-anchor

- Tabell: `public.workdays` (id, organization_id, staff_id, started_at, ended_at, started_by, ended_by, notes).
- Edge function: `supabase/functions/workday/index.ts` med actions `start | end | current`.
  - Auth: samma custom-token som mobile-app-api (`Authorization: Bearer <token>`).
  - Org-isolation: organization_id slås upp från `staff_members` server-side; klienten kan inte spoofa org.
  - **Idempotent** start: returnerar befintlig open-row om en finns. Tidigare `startedAtIso` (back-date från ankomstpopup) flyttar `started_at` bakåt.
  - **Idempotent** end: returnerar `{ workday: null, alreadyClosed: true }` om ingen open-row finns.

## Klient-API

- `src/services/workdayApi.ts` — tunna fetch-wrappers (`current`, `start`, `end`).
- `src/services/workdayServerSync.ts` — fire-and-forget glue (`syncWorkDayStart`, `syncWorkDayEnd`).
  - `syncWorkDayStart` debouncar lokalt (single in-flight + 1.5s window) — server är ändå idempotent.
  - Soft-fail: nätverksfel loggas men kraschar aldrig timer-start/EOD-flödet.
- `src/hooks/useWorkDay.ts` — React-hook med realtime-sub mot `workdays` filtrerat på `staff_id`. För komponenter som vill läsa server-state direkt.

## Integration

- `useTimerStartFlow.performStart` anropar `syncWorkDayStart(opts.startedAtIso)` efter lyckad timer-start.
- `GlobalActiveTimerBanner.processNextEod` anropar `syncWorkDayEnd()` när EOD-kön drained, parallellt med `markWorkdayEnded()` + `workday-ended`-event. Samma sync görs i no-op-grenen (request-end-day utan aktiva timers).
- `useWorkDayTimer` är fortfarande primär källa för UI-pillen — localStorage funkar offline. Server är reconciliation-källa; nästa iteration kan låta hooken adoptera `current.started_at` om det avviker från lokalt värde.

## Tester

- `src/test/workday/workdayLifecycle.test.ts` — sync-helpers (debounce, soft-fail).
- `src/test/workday/workdayConcurrency.test.ts` — API-kontrakt (idempotent start/end, error-mappning).
- `src/test/workday/workdayIntegration.test.ts` — source-grep att integration-punkterna är inkopplade.
- Alla tre listade i `src/test/timeReporting.manifest.ts` + `scripts/test-time-reporting.sh`.
