## Mål

Tidslinjen i mobilappen (/m/report) ska visa **exakt samma block** som administrativa /staff-management/time-reports gör för inloggad personal+datum — samma källval, samma fas-färgning, samma absorberade chips, samma rubriker/tider.

## Var diskrepansen ligger idag

| Steg | Admin (StaffGanttView) | Mobil (TodayTab/DisplayTimelineV2Card) |
|---|---|---|
| Källval | `reportCandidateBlocks` först om de finns → annars V2/allocation | `displayTimelineBlocksV2` först (även tom!) → fallback candidate |
| Fas-prefix (RIGG/EVENT/RIGDOWN) | applyPlanningPhaseToGanttBlocks via calendar_events | saknas helt |
| Visuell merge + chips | applyGanttVisualPipeline (merge + absorbera korta transport/granska som chips) | ingen — råblock visas |
| Tickande aktiv timer | nej | ja (TimelineSection ActiveSegmentRow) |

Resultatet: olika antal block, olika titlar, olika färger.

## Plan

### 1. Bryt ut admin-byggaren till en delad ren funktion
- Ny fil `src/lib/staff/buildStaffGanttBlocks.ts` med `buildStaffGanttBlocksFromCandidate({ staffName, cand, dateStr, bookingPhaseByDate, largeProjectPhaseByDate })` → `{ blocks: GanttBlock[]; source; counts; visualDiag }`.
- Innehåller exakt samma steg som dagens useMemo i `StaffGanttView.tsx` rad 903–1000: map V2/alloc/legacy → planning phase → suppression-guard → `selectGanttSourceFromMapped` → `applyGanttVisualPipeline` (eller legacy `blocksFromStaff`).
- `StaffGanttView` refaktoreras att kalla samma helper (ingen beteendeändring).

### 2. Ny hook för en enskild staff i mobilen
- `src/hooks/useStaffGanttMirror.ts` (mobile-context):
  - Anropar `get-staff-presence-day` direkt (samma motor admin använder).
  - Hämtar fas-map från `calendar_events` på dagen (samma query som StaffTimeReports).
  - Bygger `GanttBlock[]` via helpern från steg 1.
  - Returnerar `{ blocks, source, isLoading, error }`.
- Detta är fortfarande "mirror only" i andan av memory-regeln — vi hämtar från samma server-källa och kör samma deterministiska klient-pipeline som admin.

### 3. Ny mobil-tidslinjekomponent
- `src/components/mobile-app/time/StaffGanttMirrorTimeline.tsx`:
  - Vertikal lista av `GanttBlock[]` (en rad per block).
  - Återanvänder `resolveGanttBlockTitle`, fas-färg, chip-rendering, `attachedChips` från `visualGanttBlocks`.
  - Render-format: ikon + tid (HH:mm–HH:mm) + titel + chips + duration. Identisk semantik som admin-raden, men staplat istället för horisontellt.
  - Den senaste pågående raden får pulserande indikator (motsvarar admin "isOpen").

### 4. Wire-in i TodayTab
- Byt ut `TimelineSection` (snapshot.segments-baserad) mot `StaffGanttMirrorTimeline` när dagen inte är inskickad. Den nya komponenten är primär tidslinje.
- Ta bort `DisplayTimelineV2Card` från icke-submitted-läge (V2-flödet återanvänds bara för "godkänn/redigera"-flödet vilket vi behåller separat när submission startar).
- Behåll redan implementerad döljning av Arbetsdag-kortet + Totaler-kortet.

### 5. Tester
- `src/test/staffGanttMirrorParity.contract.test.ts`: matar samma `cand`-fixture (display V2, candidate, allocation, mixed) genom helpern och säkerställer att utvärden matchar dagens admin-output (`buildStaffGanttBlocksFromCandidate` vs nuvarande inline useMemo via snapshot-fixture).
- Snapshot-test för 3 representativa dagar: stor projekt-rigg med absorberad transport, ren lager-dag, dag med "Osäker period".
- Behåll befintliga gantt-tester gröna (visualGanttBlocks, applyPlanningPhaseToGanttBlocks, ganttSourceSelection).

### 6. Riskhantering
- Refaktoreringen av `StaffGanttView` rör en stor useMemo — vi gör den till ett rent funktionsanrop med oförändrad signatur så att admin-rendering inte ändras.
- Vi tar **inte** bort `staff_day_report_cache`-vägen — den används fortfarande av `useStaffDayStatusViaMobileReport` för status/totaler (Arbetsdag-banner när dag är inskickad).
- Memory-regeln "Mobile Time App Mirror Only" uppdateras: mobilen får läsa `get-staff-presence-day` direkt så länge den kör exakt samma deterministiska klient-pipeline som admin.

## Tekniska detaljer

```text
/m/report (TodayTab)
 ├── StaffDayRemindersBanner
 ├── [isSubmitted] WorkdayStatusCard + TotalsCard      (oförändrat)
 ├── StaffGanttMirrorTimeline  ◄── NY
 │      useStaffGanttMirror(staffId, date)
 │        ├── supabase.functions.invoke('get-staff-presence-day')
 │        ├── supabase.from('calendar_events') för phase
 │        └── buildStaffGanttBlocksFromCandidate(...)  (delad helper)
 ├── ActionsNeededSection
 ├── PrimaryAction (Starta/Avsluta arbetsdag)
 └── DisplayTimelineV2Card  (bara om submission påbörjad — godkänn/redigera)
```

Filer som ändras eller läggs till:
- `src/lib/staff/buildStaffGanttBlocks.ts` (ny, ren helper)
- `src/components/staff/StaffGanttView.tsx` (kallar helpern)
- `src/hooks/useStaffGanttMirror.ts` (ny)
- `src/components/mobile-app/time/StaffGanttMirrorTimeline.tsx` (ny)
- `src/components/mobile-app/time/TodayTab.tsx` (byt timeline)
- `src/test/staffGanttMirrorParity.contract.test.ts` (nya tester)
- `mem://constraints/mobile-time-app-mirror-only-v1` (uppdaterad — tillåter direktanrop av `get-staff-presence-day` så länge samma klient-pipeline används)

## Vad jag INTE rör

- Tidsmotorn själv (`get-staff-presence-day`, `time-engine`) — ingen logikändring.
- Submission/AI-validering — `DisplayTimelineV2Card` lever kvar för det flödet.
- Admin-sidans visuella beteende — refaktorn är ren extraktion.
- Andra appar (Scanner, Time-appens andra flikar).
