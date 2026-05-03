## Mål

På `/staff-management/time-reports` ska den **nya tidrapport-tabellen** (`TimeReportReviewTable`) visas direkt i listan — en per person — istället för den nuvarande GPS-spårade tabellen (`JournalTable` / `StaffTimeReportsTable`). Samma payroll-vy som syns i `DailyOverviewDialog` idag.

## Ändringar

### 1. `src/components/staff/StaffTimeReportsList.tsx`
- Ta bort import av `JournalTable` / `buildStaffBlock`.
- Importera `TimeReportReviewTable` + typer från `timeReportReviewEntry`.
- För varje person i `filtered`: rendera ett kort med
  - Klickbar rubrik (namn) som öppnar `DailyOverviewDialog` via `onSelectStaff(id, name)`.
  - `<TimeReportReviewTable date staffName work travel />` byggd från `staff.journal.sessions`:
    - `work` = sessions med `kind ∈ {booking, large_project, location}` mappade till `ReviewWorkInput` (id = första `sourceIds`, source = `time_report` om prefix `tr:`, annars `location_entry`; `approved` från `editTimeReport.approved`).
    - `travel` = sessions med `kind === 'travel'` mappade till `ReviewTravelInput` (adresser/koordinater saknas på journal-nivå idag → tomma fält; tabellen visar då varning "Ingen adress på resan" som idag i dialogen).
  - Ingen `onEditTimeReport` här (öppnas via dialogen för att inte krocka med listvyn) — eller propagera till befintlig EditTimeReportDialog senare.
- Behåll datumnav, sök och summering (totala timmar / pågående / tappad signal).

### 2. Inga andra filer ändras
- `DailyOverviewDialog` fortsätter visa exakt samma tabell som detaljvy.
- `StaffTimeReportsTable.tsx` (gamla `JournalTable`) blir oanvänd från listsidan men lämnas kvar tills vi vet att inget annat importerar den. (`rg` bekräftar att endast `StaffTimeReportsList` importerar `JournalTable` → kan raderas i ett senare städsteg.)

## Resultat

Listsidan visar samma tidrapport-tabell per person som dialogen — projekt/plats, start, slut, tid, typ, status, åtgärd + totalsumma. Klick på namnet öppnar fortfarande detalj-dialogen för djupanalys (GPS, kartor, anomalier, godkännande).