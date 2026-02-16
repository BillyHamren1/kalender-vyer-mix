
# Visa individuella tidrapporter istället för ihopklumpade per person

## Problem
Idag aggregeras alla tidrapporter per person till en enda rad i tabellen (t.ex. "Billy Hamren - 17.0h - 5 950 kr"). Användaren vill se varje rapport separat med datum och tider.

## Lösning
Ändra datahämtningen och tabellvisningen så att varje tidrapport visas som en egen rad med datum, start/sluttid, timmar och kostnad. Personens namn visas som en grupperingsrubrik.

## Visuell struktur (före och efter)

**Före:**
```text
Personal       Timmar    Kostnad    Status
Billy Hamrén   17.0 h    5 950 kr   Väntar
```

**Efter:**
```text
Personal          Datum        Tid           Timmar   Kostnad    Status
Billy Hamrén
  2026-02-14      08:00-17:00   8.5 h    2 975 kr   Väntar
  2026-02-15      07:30-16:00   8.5 h    2 975 kr   Väntar
TOTALT                          17.0 h   5 950 kr
```

## Tekniska ändringar

### 1. `src/services/projectEconomyService.ts` -- `fetchProjectTimeReports`
- Hämta även `report_date`, `start_time`, `end_time` från databasen
- Returnera en ny lista med individuella rapporter **utöver** den aggregerade per-person-listan
- Lägga till ett nytt interface `DetailedTimeReport` med fälten: `id`, `staff_id`, `staff_name`, `report_date`, `start_time`, `end_time`, `hours_worked`, `overtime_hours`, `hourly_rate`, `cost`, `approved`

### 2. `src/types/projectEconomy.ts`
- Lägga till `DetailedTimeReport`-interface
- Lägga till `detailed_reports: DetailedTimeReport[]` i `StaffTimeReport` (varje aggregerad personrad bär sina underliggande rapporter)

### 3. `src/components/project/StaffCostTable.tsx`
- Expandera varje personrad till att visa underliggande rapporter
- Visa datum, start-/sluttid, timmar, kostnad, och godkännandestatus per rad
- Personnamnet visas som en grupperingsrubrik (vänsterindenterad rad utan bakgrund)
- Individuella rapporter visas indenterade under varje person
- Behåll TOTALT-raden längst ner
- Godkännandeknappen visas per individuell rapport (inte per person)
