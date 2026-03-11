

# Plan: Utöka testlagret för Planner

## Nuläge

Det finns redan ~112 tester i 5 filer som täcker:
- Event adapters (forward + reverse mapping)
- Planner store (state transitions, dialogs, legacy sync)
- Event utilities (dedup, keys, grouping, display data)
- Planner event helpers (filter, group)
- Edit controller (mutex, dialog handlers, validation)

## Luckor att fylla

| Gap | Vad saknas |
|---|---|
| **dateUtils.ts** | Ingen testfil alls — kritisk för alla tid/datum-operationer |
| **View switching stability** | Inget test att snabb view-switching inte korrupterar state |
| **Resource views med tom/partial data** | Store testar filter men inte rendering-data |
| **useStableEvents hook** | Memoization-beteende (referensstabilitet) otestat |
| **Concurrent edits + dialog isolation** | Inget stresstest av snabb sekventiell edit-request |
| **eventEditHelpers pure functions** | `updateEventTime`/`moveEventToDate` otestade (kräver mock av supabase) |

## Åtgärder

### 1. Ny testfil: `src/utils/__tests__/dateUtils.test.ts`
Testar `convertToISO8601`, `extractUTCTime`, `extractUTCDate`, `buildUTCDateTime` med:
- Supabase-format ("2025-06-10 14:00:00+00")
- ISO-format passthrough
- Null/undefined fallbacks
- Edge cases (midnight, timezone offsets)

### 2. Ny testfil: `src/hooks/__tests__/useMemoizedEvents.test.ts`
Testar `useStableEvents`:
- Returnerar samma referens vid oförändrad data
- Ny referens vid faktisk ändring
- Deduplikerar innan jämförelse
- `useResourceDateEvents` filtrerar korrekt

### 3. Utöka `plannerStore.test.tsx` med snabb view-switching-test
- Rapid `setViewMode` i sekvens → state konsistent
- `setDate` + `setViewMode` i snabb följd → inga konflikter
- Tom event-lista + alla views → ingen krasch

### 4. Utöka `useEventEditController.test.ts` med stresstester
- Rapid requestEdit/endEdit i sekvens → korrekt slutstate
- requestEdit med null/undefined event → hanteras säkert

### 5. Utöka `eventUtils.test.ts` med edge cases
- `getEventDisplayData` med `undefined` extendedProps
- `deduplicateEvents` med events som har identiskt id + resource men different start (edge case)

Totalt: ~2 nya testfiler + ~3 utökade testfiler, ca 40-50 nya tester.

