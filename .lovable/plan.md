# Sammanslå daglig analys i samma container som personens rader

## Mål
Användaren vill att panelerna **Tolkning**, **Åtgärdsförslag** och **Notiser & svar** ligger på samma höjd som personens rader, längst till höger (bredvid Varaktighet) — inte som en separat full-bredd rad under personen.

Tabellraderna (Beskrivning/Plats/Klockslag/Varaktighet) **är** i praktiken redan "Händelseloggen", så den separata Händelselogg-kolumnen i summary tas bort.

## Layout (efter)

```text
┌─────────┬─────────────────────────────────────────────────┬────────────────────────────────────────┐
│ Namn    │ Beskrivning · Plats · Klockslag · Varaktighet   │  TOLKNING │ ÅTGÄRDSFÖRSLAG │ NOTISER  │
│         │ (flera rader per person — day-start, sessions,  │  (spänner över alla personens rader,   │
│         │  day-end)                                       │   rowSpan = antalet rader)             │
└─────────┴─────────────────────────────────────────────────┴────────────────────────────────────────┘
```

- Sidopanelen renderas **bara** på personens första rad med `rowSpan={antalRaderFörPersonen}`.
- Header-tabellen får en ny kolumn längst till höger: **"Daglig analys"** (~520 px).
- Den befintliga `<StaffDaySummaryRow>` som renderas som egen tabellrad efter sista raden tas **bort**.

## Tekniska ändringar

### `src/components/staff/StaffTimeReportsTable.tsx`
1. Lägg till `<th>` "Daglig analys" sist i `<thead>` (`w-[520px]`). Uppdatera `colSpan` på tomma-rad-cellen från 6 → 7 och i loading-paddingen.
2. Räkna ut `staffRowCount` per `staffId` (en gång före map, t.ex. via `useMemo`).
3. På varje rad där `r.isFirstForStaff === true`, rendera ny `<td rowSpan={staffRowCount[r.staffId]} className="align-top p-0 border-l border-border/40 bg-muted/20 w-[520px]">` med en ny komponent `<StaffDayAnalysisPanel staffId date staffName />`.
4. På övriga rader läggs **ingen** `<td>` till för den kolumnen (rowSpan täcker dem).
5. Ta bort blocket `{isLastForStaff && summarySessions && ... <StaffDaySummaryRow .../>}`.
6. Den expanderade `DayFactsPanel`-raden (`day-start`/`day-end`) får `colSpan={5}` (oförändrad — den ligger inom de vänstra cellerna; ingen kollision med rowSpan-cellen eftersom den nya kolumnen ligger längst till höger). Verifiera att `colSpan` på `DayFactsPanel`-raden täcker exakt de 5 vänstra `<td>` som inte är rowSpan-täckta.

### `src/components/staff/StaffDaySummaryRow.tsx`
1. Exportera ny komponent `StaffDayAnalysisPanel` (samma fil, eller bryt ut till `StaffDayAnalysisPanel.tsx` om filen blir >200 rader). Den:
   - tar `staffId`, `staffName`, `date`
   - använder `useStaffDayReality` + `useDayWorkdayFlags` + `buildDayEventLog` precis som idag
   - renderar ett `<div>` (inte `<tr>/<td>`) med 3-kolumns inre layout: **Tolkning | Åtgärdsförslag | Notiser & svar** — dvs `Händelselogg`-kolumnen tas bort.
   - struktur: `divide-x divide-border/40` runt 3 lika breda kolumner, varje med samma `<Column>`-stil (uppercase header, ikon, count, max-h scroll).
   - inre padding `p-2`, ingen yttre border (cellen i tabellen står för avgränsningen via `border-l` + bakgrund).
2. `<StaffDaySummaryRow>` (gamla `<tr>`-varianten) kan tas bort helt eftersom inget annat ställe använder den (verifiera med `rg "StaffDaySummaryRow"`).

### Responsivt
- Vid smala viewports (<1280 px) blir 520 px för mycket. Ge tabellen en min-bredd-strategi: behåll `overflow-x-auto` på containern (redan på plats). Inom panelen: `xl:grid-cols-3` → vid `md` blir det `grid-cols-1` med scroll inom cellen.

## Effekt
- En person = en tabellrad-grupp med all info samlad horisontellt.
- Inga full-bredd-rader som "skär av" mellan personer.
- Matchar Excel/grid-stilen i resten av appen.
