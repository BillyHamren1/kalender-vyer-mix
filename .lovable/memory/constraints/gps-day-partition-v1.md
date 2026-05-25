---
name: GPS Day Partition
description: Dagsfönstret [firstPing, lastPing] partitioneras till exakt täckande segment (work/private/travel/unknown_place/gps_gap/idle). Summan av segmenten === windowMin. Inga försvunna minuter.
type: constraint
---

## Regel

För varje (staff, dag) MÅSTE GPS-dagspanelen visa varje minut mellan
första och sista ping som tillhörande exakt ETT segment:

- `work` — visit knuten till känd arbetsplats (projekt/lager/booking-geofence)
- `private` — visit inuti privat zon / hem / Boende-polygon
- `travel` — egen GPS-rörelse ≥ 500 m mellan visits
- `unknown_place` — stillastående utan match
- `gps_gap` — > 5 min utan pings
- `idle` — < 2 min mellan visits

## Invarianter (låsta av `src/test/gpsDayPartition.contract.test.ts`)

1. `sum(segments.minutes) === windowMin` (= `Math.round((lastIso − firstIso)/60000)`)
2. Inga overlap: `segments[i].start === segments[i-1].end` för alla i ≥ 1
3. Inga gap: `segments[0].start === firstIso`, `segments[last].end === lastIso`
4. Boundary-ping ägs av nästa visit (visit A:s end = visit B:s start - 1 ms)
5. `workMin + privateMin + travelMin + unknownMin + gapMin + idleMin === windowMin`
6. `workMin <= windowMin` (kan ALDRIG överstigas)

## Implementation

- Pure helper: `supabase/functions/_shared/staff-gps/dayPartition.ts`
- Spegling i frontend: `src/lib/staff-gps/dayPartition.ts` (identisk logik)
- Edge function `get-staff-gps-week-summary` returnerar `segments[]` + alla buckets
- `useStaffGpsWeekSummary` exponerar `segments` + `workMin/travelMin/gapMin/...`
- `StaffGpsDayRow` visar varje segment med klockslag + minuter + färgad punkt

## Varför

Tidigare visade UI total = `lastIso − firstIso` men listade visits separat
(med dubbelräknade boundary-pings + separat rundning per visit). Det gjorde
att `sum(places) > total` kunde uppstå och användaren saknade svar på
"vad gjorde personen mellan visit A och B?". Partition löser båda problemen
matematiskt.
