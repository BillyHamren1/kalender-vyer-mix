# Plan

## Mål
Fixa den verkliga källan till att samma plats visas som tre hackade rader i stället för ett sammanhängande block, utan att lägga mer arbete i fel vy.

## Vad jag bygger
1. Identifiera exakt vilken vy och komponent som renderar raden i din skärmdump.
   - Spåra renderkedjan från den faktiska route/vyn.
   - Bekräfta om raden kommer från GPS-satellitkartan, dagjournalen eller en annan admin-tidslinje.
   - Sluta felsöka day-inspection-drawern om den inte är källan.

2. Flytta fixen till rätt modell-lager.
   - Om hackningen uppstår i journal-/display-modellen: fixa där.
   - Om hackningen uppstår i blockbyggaren: fixa där.
   - Om hackningen uppstår i ren UI-mappning/rendering: fixa där istället för i motorlogiken.

3. Implementera korrekt merge-regel för just den renderade vyn.
   - Samma plats före och efter ett mellansegment ska kunna kollapsas när mellansegmentet bara är brus/drift och inte verklig resa.
   - Verklig resa eller verkligt platsbyte ska fortsatt visas separat.
   - Ingen scope creep till andra flöden som inte använder samma modell.

4. Låsa beteendet med regressionstester och preview-verifiering.
   - Skapa testfall för mönstret: Åström → okänd/förflyttning → Åström.
   - Verifiera i preview på rätt sida efter ändringen.
   - Säkerställa att vi inte råkar påverka andra dagrader negativt.

## Tekniska detaljer
Jag utgår från att problemet sannolikt ligger i den renderkedja som används för adminens GPS-/dagjournalvy, inte i `StaffDayInspectionDrawer`.

Primära kandidater att verifiera och därefter ändra:
- `src/components/staff/StaffGpsSatelliteMap.tsx`
- `src/components/staff/DayJournalRow.tsx`
- `src/components/staff/StaffTimeReportDetail*`
- `src/lib/staff/buildReportDisplayBlocks.ts`
- `src/lib/staff/dayBlockTimeline.ts`
- eventuella mellanliggande mappare som projicerar block till UI-rader

## Klart när
- Den aktuella vyn som visar Åström-raderna använder rätt merge-logik.
- Mönstret `Åström → Okänd plats/förflyttning → Åström` visas som ett sammanhängande block när det bara är brus.
- Samma scenario är täckt av test.
- Previewn är verifierad på den faktiska sidan där buggen syns.