## Mål

I `BookingPlacementDialog` ska BÅDE personalkalendern (CustomCalendar med team-kolumner) OCH månadsväljaren (PhaseDatesEditor) synas samtidigt — så användaren ser vilka team som är lediga medan hen väljer datum.

Layout i dialogen:

```text
┌───────────────────────────────────────────────────────────────┐
│ Kundinfo · leveransadress · produkter (BookingInfoHeader)     │
├──────────────────────────────────────────┬────────────────────┤
│                                          │ Datum & tider      │
│   PERSONALKALENDERN                      │ (PhaseDatesEditor) │
│   (team-1…team-N, alla planerade dagar)  │ ─ Rigg             │
│   read-only, samma look som              │ ─ Event            │
│   /personalkalendern                     │ ─ Rigg ner         │
│                                          │                    │
│                                          │ + Stort projekt-   │
│                                          │   sektionen        │
└──────────────────────────────────────────┴────────────────────┘
```

## Ändringar

### 1. `src/components/project/PlacementDayCalendar.tsx`
- Byt prop `date: string` → `dates: string[]` (eller acceptera båda för bakåtkompatibilitet).
- Bygg `daysOverride` från alla unika datum sorterade stigande. Tom array → fall tillbaka till `[new Date()]` så CustomCalendar alltid har minst en dag.
- `currentDate` = första datumet.
- Allt övrigt (read-only, transport-filter, internal lager-events) oförändrat.

### 2. `src/components/project/BookingPlacementDialog.tsx`
- I huvudgriden inne i `{isLoading || !booking ? … : …}`-grenen:
  - Behåll `BookingInfoHeader` överst.
  - Ersätt nuvarande 2-kolumners grid `[minmax(0,1fr)_320px]` med en 2-kolumners grid `lg:grid-cols-[minmax(0,1fr)_380px]` där:
    - **vänster** = `<PlacementDayCalendar dates={…} />` när vi INTE länkar till befintligt stort projekt. När vi länkar till befintligt LP visas existerande "Ärvs från det stora projektet"-rutan i vänster kolumn istället.
    - **höger** = `PhaseDatesEditor` PLUS "Detta är ett stort projekt"-rutan staplade vertikalt.
- Härled `calendarDates` med `useMemo`: unika `day.date` från `days` (alla faser). Om listan är tom, använd bokningens eventdatum/rig-datum som fallback så kalendern öppnas på rätt vecka direkt.

### 3. Visuella detaljer
- Vänster kolumn får `min-w-0` så CustomCalendar kan krympa utan att spränga griden.
- Höger kolumn behåller `space-y-3` för att stapla PhaseDatesEditor + Stort projekt-rutan.
- Ingen ny CSS behövs utöver befintlig `PlacementDayCalendar.css`.

### 4. Test
- Öppna en bokning utan dagar → vänster visar personalkalendern för bokningens eventvecka, höger visar tomma fasrutor.
- Lägg till en rig-dag via månadsväljaren → kalendern uppdateras till den dagen och visar team som har annat bokat.
- Länka till befintligt stort projekt → vänster byter till "Ärvs från…"-rutan, höger döljer fasrutorna (oförändrat beteende).

## Inget annat rörs
- `PhaseDatesEditor.tsx` är oförändrad.
- Spara-flöde, validering, large-project-logik oförändrad.
- Inga DB-skrivningar, edge functions eller hooks rörs.
