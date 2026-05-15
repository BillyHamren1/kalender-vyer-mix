## Problem

Förra fixen byggde `sessionPhaseMap` per `targetType:targetId`. Men i Pavels rad har de två "Creative Meetings (#2603-35R1)"-blocken **olika** target-identitet:

- Block 1 (07:53–12:03 → ARBETE): troligen `targetType=project` / annan `targetId` (eller saknar targetId helt) — fasen kan inte slås upp i `bookingPhaseByDate['2603-35R1']`, och `detectPhase("Creative Meetings")` matchar varken rig eller rigdown → `perBlockPhase = null`.
- Block 2 (12:06–14:38 → RIGG): `targetType=booking`, `targetId='2603-35R1'` → får `rig` direkt från `bookingPhaseByDate`.

Eftersom `sessionKeyForBlock` ger två olika nycklar (`project:X` vs `booking:2603-35R1`) ärver inte block 1 fas från block 2. Resultat: ARBETE + RIGG.

## Fix

Lyft bokningsnumret från titel/subtitle som **kanonisk sessionsnyckel** och som **booking-fas-lookup**.

### 1. `src/lib/staff/ganttPhaseColor.ts`
- Ny exporterad helper `extractBookingNumberFromText(text)` med regex `#?\b(\d{3,5}-\w+)\b` (matchar både "#2603-35R1" och "2603-35R1").
- I `sessionKeyForBlock`: om `extractBookingNumberFromText(title || subtitle)` ger träff → returnera `booking#:<num>` *som högsta prioritet* (slår targetType:targetId). Detta unifierar block oavsett om engine taggat dem som project/booking/null så länge titeln nämner samma bokning.
- Ny helper `resolveBookingPhaseFromTitle(b, bookingPhaseByDate)` som plockar booking-nummer ur titel/subtitle och gör samma lookup som targetId-vägen. Används i `resolveBlockPhaseDirect` som ny fallback **före** `detectPhase`.

### 2. `src/components/staff/StaffGanttView.tsx`
- I `resolveBlockPhaseDirect`: om `resolveGanttPhaseKind` ger null, prova `resolveBookingPhaseFromTitle` innan `detectPhase`. Det gör att även block 1 ovan får `rig` direkt utan att behöva sessions-arv — och som backup fångar sessions-arvet fortfarande de fall där bara ett av syskonblocken har bokningsnummer i titeln.
- Inga ändringar i `mapReportCandidateKind`-flödet — bara uppströms data blir bättre.

### 3. Regressionstester `src/test/sessionPhaseInheritance.test.ts`
Lägg till case som speglar Pavels exakta data:
- Block A: `targetType='project', targetId='other-uuid', title='Creative Meetings (#2603-35R1)'`
- Block B: `targetType='booking', targetId='2603-35R1', title='Creative Meetings (#2603-35R1)'`
- `bookingPhaseByDate['2603-35R1'] = 'rig'`
- Förväntar: båda hamnar på `rig` — antingen via direkt booking#-lookup eller via sessions-arv (samma nyckel `booking#:2603-35R1`).

Plus test för:
- "(#2603-35R1)" och bara "2603-35R1" i titel matchas.
- Olika bokningsnummer i samma rad ärver INTE mellan sig.
- Warehouse-block med bokningsnummer i titeln ärver fortfarande inte rig (filtreras bort i pre-pass som idag).
- `targetId='2603-35R1'` utan booking#-text fungerar oförändrat.

## Verifiering
1. Kör `bunx vitest run src/test/sessionPhaseInheritance.test.ts`.
2. Reload preview på `/staff-management/time-reports`, kontrollera att Pavels Creative Meetings-block båda blir RIGG (gröna), inte blandat ARBETE+RIGG.

## Rapport (svaren användaren bad om)
- **A.** Första blocket blev ARBETE för att dess `targetType/targetId` inte pekade på bookingen `2603-35R1` — phase-lookup miss + `detectPhase("Creative Meetings")` matchar ingen rig-regex.
- **B.** Andra blocket använde `bookingPhaseByDate['2603-35R1']` via dess `targetType=booking, targetId=2603-35R1`.
- **C.** Med fixen: båda blocken landar på samma sessionsnyckel `booking#:2603-35R1` (plus direkt fas-lookup via bokningsnummer i titel), och rig vinner.
- **D.** Före: ARBETE 07:53–12:03 + RIGG 12:06–14:38. Efter: RIGG 07:53–12:03 + RIGG 12:06–14:38.
- **E.** ARBETE kvarstår bara om INGET block i sessionen kan resolveras till rig/rigdown via vare sig targetId, bokningsnummer i titel eller text-detektering — alltså rena event-/möten utan rigg-planering.
