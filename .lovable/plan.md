
# Lön-tabben → ren tidrapport för ekonomi

## Vad som är fel idag
Lön-tabben visar samma tekniska veckomatris som Tid-tabben (kliniska celler med "Normal/Övertid/Resa"-rutnät, statusetiketter, granskningsknappar). Det ser ut som ett internt verktyg, inte som en lönerapport.

## Vad jag bygger istället
En **tidrapport-vy** som ekonomiavdelningen kan läsa, exportera (PDF/CSV) och skicka vidare. Samma underliggande block som Tid-tabben (`useStaffTimeWeekMatrix` → samma `rows` per dag), men presenterad som rader i en rapport, inte som celler i en matris.

### Layout (per anställd, per vecka)

```text
─────────────────────────────────────────────────────────────
  Anna Andersson                              Vecka 23, 2026
  Personalnr 1042                       1–7 juni              
─────────────────────────────────────────────────────────────
  Datum       Block                        Start  Slut  Tim
─────────────────────────────────────────────────────────────
  Mån 1 jun   Projekt Globen               07:00  12:00  5:00
              Resa → Solna                 12:00  12:30  0:30
              Projekt Solna Arena          12:30  16:00  3:30
                                                  Dag:   9:00
  Tis 2 jun   Projekt Solna Arena          07:00  16:00  9:00
                                                  Dag:   9:00
  Ons 3 jun   —                                                
  ...
─────────────────────────────────────────────────────────────
  Summa vecka                Normal  37:00   Övertid  3:30
                             Resa     2:00   Totalt  42:30
                                          Status: Attesterad
─────────────────────────────────────────────────────────────
```

### Visuell stil
- Vit/papper-bakgrund, svart text, tunna grå linjer. Inga färgglada chips, ingen statusfärg-vänsterkant, inga ikonknappar i rapporten.
- Serif eller neutral sans (samma stack som idag) men med rapport-typografi: tabular siffror, generös radhöjd, tydliga sektionsrubriker.
- Status visas diskret som text längst ner per anställd: "Attesterad 2026-06-08 av Per Larsson" / "Väntar attest" / "Komplettering begärd".
- En anställd per "papper" (kort/sektion). Flera anställda staplas vertikalt, en sida per person vid utskrift (`break-after: page`).

### Funktioner (minimalt, rapportfokus)
- **Veckoväljare** högst upp (samma som Tid).
- **Knapprad ovanför rapporten** (inte inne i den):
  - "Skriv ut / PDF" (browser print, print-CSS dolda kontroller)
  - "Exportera CSV" (en rad per block, kolumner: datum, anställd, projekt/typ, start, slut, minuter, övertid, restid, status)
  - "Godkänn alla väntande" (kvar — men diskret, utanför själva rapportytan)
- Klick på en dag öppnar fortfarande `StaffTimeMatrixDayQuickView` för granskning (admin-funktion, syns inte i utskriften).

### Data
- Återanvänd **exakt** `useStaffTimeWeekMatrix` (samma block som Tid — inget nytt datalager, inga nya edge functions).
- Återanvänd `useApproveStaffDay` för "Godkänn"-flödet.
- Inga ändringar i edge functions, DB, time_reports, workdays, staff_day_submissions.

## Filer

### Nya
- `src/components/staff-time-approvals/StaffPayrollReport.tsx` — container: veckoväljare, toolbar (print/CSV/godkänn), loopar staff-rader.
- `src/components/staff-time-approvals/StaffPayrollReportSheet.tsx` — en anställds "papper": header, datum-rader, summa-footer, status-rad.
- `src/components/staff-time-approvals/StaffPayrollReportDayRow.tsx` — en dag: visar varje block från `cell.rows` som en egen rad (block-namn, start, slut, minuter) + dagssumma.
- `src/lib/staff-payroll/payrollCsvExport.ts` — bygger CSV från matrisen.
- `src/styles/payroll-print.css` — `@media print` regler (dölj toolbar, sidbrytning per anställd, A4-marginaler).

### Ändras
- `src/components/staff-time-approvals/StaffTimeApprovalsPageContent.tsx` — byter ut `StaffPayrollWeekMatrix` mot `StaffPayrollReport`.

### Tas bort (eller lämnas oanvända)
- `StaffPayrollWeekMatrix.tsx`, `StaffPayrollWeekMatrixRow.tsx`, `StaffPayrollWeekMatrixCell.tsx` — den kliniska matrisen som användaren just avvisat. Raderas.

## Vad jag INTE rör
- Tid-tabben och dess matris.
- `useStaffTimeWeekMatrix`, edge function `get-staff-time-week-matrix`.
- Mobil, GPS, time_reports, workdays, staff_day_submissions.
- Godkännandelogik (`useApproveStaffDay`, `update-staff-day-submission-status`).

## Verifiering
- Vitest: ett snapshot/render-test som matar in en mockad `StaffTimeMatrix` med 2 anställda, 3 dagar med block (inkl. resa) och kollar att rapporten renderar rätt rader + summor.
- Manuell preview på `/staff-management/time?tab=lon`: jämför att samma block syns som i Tid-tabben för samma vecka.
- Print-preview (browser) för att se att layout håller A4.

Okej att köra?
