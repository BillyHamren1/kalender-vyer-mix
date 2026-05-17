## Mål
Göra mobilen till en ren spegling av `/staff-management/time-reports` så att Billys dag visas identiskt i app och webb, inklusive när dagen ska sluta renderas när personen åkt hem och inte fortsätter till ny target.

## Rotorsak
Idag finns flera konkurrerande läsmodeller i mobilen:

1. `useStaffDayStatusViaMobileReport` / `get-mobile-staff-day-report` bygger snapshot/segment från cache.
2. `DisplayTimelineV2Card` läser direkt från `get-staff-presence-day`.
3. `StaffGanttMirrorTimeline` bygger en separat mobil spegling av admin-Ganttens block.

Det betyder att mobilen kan visa block från en källa medan Gantt visar block från en annan. För Billy blir det därför olika trots att underliggande signaler avser samma dag.

## Plan

### 1. En enda kanonisk mobilkälla: Gantt-mirror
- Göra mobilens dagvy beroende av samma blockurval som admin-Gantt använder.
- Låta `StaffGanttMirrorTimeline` / `buildStaffGanttMirrorBlocks` vara enda renderingskälla för block i mobilen.
- Sluta rendera parallella blocklistor från `DisplayTimelineV2Card` där de överlappar Gantt-vyn.

### 2. Sluta låta mobilen "räkna själv"
- Ta bort mobil logik som bygger eller väljer alternativa blockkedjor när Gantt redan har ett explicit beslut.
- Säkerställa att totals/summeringar i relevanta mobilvyer härleds från samma speglade dagsmodell, inte från annan blocklista.
- Behålla möjligheten att skicka in/justera tid, men utan att UI visar en annan tidslinje än admin.

### 3. Flytta hemkomst/slut-på-dag-logik till den servermodell som Gantt använder
- Identifiera och justera serverdelen kring `get-staff-presence-day` + Ganttens blockbyggare så att "lämnat arbete och åkt hem, ingen ny target" klampar/sätter slut på synliga block konsekvent.
- Se till att samma regel används både för admin-Gantt och mobil spegling.
- Målet är: appen ska inte behöva förstå hemfärd själv; serverns Ganttmodell ska redan ha fattat beslutet.

### 4. Rensa mobil UI från dubbla sanningar
- Ta bort eller neutralisera komponenter/headers/status som visar andra blockantal eller andra block än Gantt.
- Säkerställa att dagdetalj, Today-tab och eventuell attest/justering läser samma dagsutfall visuellt.

### 5. Lås beteendet med tester
- Utöka parity-tester för mobil vs admin-Gantt.
- Lägga till testfall för exakt scenariot:
  - arbete på target
  - transport därifrån
  - hem / ingen ny target
  - ingen fortsatt renderad arbetskedja efter hemkomst
- Lägga till regressionsskydd så V2-tomt beslut och Gantt-spegel inte divergerar igen.

### 6. Validering efter ändring
- Köra relevanta tester.
- Verifiera i preview att mobilens tidslinje och admin-Gantt visar samma blockkedja för samma dag.
- Kontrollera särskilt att Billy/Pavel-liknande kvällsfall inte fortsätter rendera tid efter hemfärd.

## Tekniska detaljer
- Berörda delar kommer sannolikt att vara:
  - `src/components/mobile-app/time/TodayTab.tsx`
  - `src/components/mobile-app/time/DisplayTimelineV2Card.tsx`
  - `src/components/mobile-app/time/StaffDayDetailSheet.tsx`
  - `src/components/mobile-app/time/StaffGanttMirrorTimeline.tsx`
  - `src/hooks/useDisplayTimelineV2.ts`
  - `src/hooks/useStaffGanttMirror.ts`
  - `src/lib/staff/buildStaffGanttMirrorBlocks.ts`
  - `supabase/functions/get-staff-presence-day/index.ts`
  - relevanta tester i `src/test/*`

## Förväntat resultat
- Appen visar exakt samma block som Gantt.
- Ingen separat mobiltolkning av "när Billy åker hem".
- När systemet bedömer att dagen ska sluta renderas, slutar både webb och app rendera samtidigt.