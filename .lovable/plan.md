## Mål

Lön-tabben (`StaffPayrollReport` → `StaffPayrollReportSheet`) renderas idag som ett smalt "papper" centrerat i `max-w-[820px]`. Bygg om det till ett brett premiumkort som utnyttjar hela skärmbredden och visar två kolumner: tidslinje vänster, "Tid per projekt och dag" höger. Lägg till badge på varje rese-rad som visar vilket projekt resan belastar.

Endast presentation + en in-memory helper. Ingen Edge Function, ingen DB-skrivning, inga ändringar i Time Engine, GPS, attestlogik eller `useStaffTimeWeekMatrix`-hämtning. Print/PDF behålls intakt via befintlig `payroll-print.css`.

## Filer som ändras / skapas

**Ändras:**
- `src/components/staff-time-approvals/StaffPayrollReportSheet.tsx` — full ombyggnad till premiumkort med grid-layout.
- `src/components/staff-time-approvals/StaffPayrollReportDayRow.tsx` — rendering av rad-badges (resa → projekt, "Ej kopplad").
- `src/components/staff-time-approvals/StaffPayrollReport.tsx` — slopa centrerad `max-w-[820px]`-wrapper, använd full bredd; behåll print-grenen oförändrad.
- `src/styles/payroll-print.css` — säkerställ att print fortfarande kollapsar bred layout till smalt "papper" (`@media print`).

**Skapas:**
- `src/lib/staff-payroll/reportProjectDaySummary.ts` — ren helper `buildReportProjectDaySummary(row: StaffTimeMatrixRow)` som returnerar `{ date, projects: [{ key, label, normal, overtime, travel, total, travelOnly }] }[]`. Bygger gruppen från `row.days[].rows`, mappar `kind=travel` mot resolverad allokering (se nedan), summerar per `label`-nyckel.
- `src/lib/staff-payroll/travelAllocation.ts` — helper `resolveTravelAllocation(row, dayCell, travelItem)` som returnerar `{ kind: "linked" | "unknown", label: string | null, projectKey: string | null }`. Regelordning:
  1. Om `travelItem.toLabel` matchar en `work`-rad samma dag → belastar dit (resa **till** projekt).
  2. Annars om `travelItem.fromLabel` matchar en `work`-rad samma dag och `toLabel` saknar match → belastar `fromLabel` (resa **från** projekt, t.ex. tillbaka till lagret).
  3. Annars `{ kind: "unknown", label: null }`.
  Inga DB-anrop, ingen omklassning av tid — bara presentation.
- `src/components/staff-time-approvals/ReportProjectDayPanel.tsx` — högerpanel som renderar resultatet från helpern.
- `src/components/staff-time-approvals/ReportKpiBadges.tsx` — KPI-pills (Normal / Övertid / Resa / Total) för header.

## Layout

```text
ReportCard  (rounded-2xl, border, shadow-sm, bg-card, w-full, ingen max-width)
├── ReportHeader
│   ├── Namn (text-xl font-semibold) + role
│   ├── Vecka X · datumintervall (uppercase tracking label)
│   ├── StatusBadge ("Delvis attesterad" / "Godkänd" / "Väntar")
│   └── ReportKpiBadges: Normal · Övertid · Resa · Total (pill-stil)
└── ReportBody  (grid lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] gap-6, staplas på mobil)
    ├── DayActivityTimeline (vänster, ~65–70%)
    │   └── DaySection per dag
    │       ├── Datum-pil (vänster kolumn, 96px)
    │       └── Aktivitetslista (Start · Slut · Tim, kompakt)
    │           └── Resa-rad: liten badge "Belastar: <projekt>" eller "Ej kopplad"
    └── ProjectDaySummaryPanel  (höger, ~30–35%, bg-muted/40, rounded-xl, lg:sticky lg:top-4)
        ├── Rubrik "Tid per projekt och dag" (uppercase)
        └── Daggrupp
            ├── Datum
            └── Projektrader: namn · total (· varav resa N:NN)
```

Tomma dagar renderas som en låg rad (`py-1.5`, muted text "—"), inte full datum-sektion.

## Travel-badge

I `StaffPayrollReportDayRow` när `r.kind === "travel"`:
- Anropa `resolveTravelAllocation(row, cell, r)`.
- `linked` → `<Badge>` med pil-ikon: `Belastar: {label}` (truncate, max ~28 tkn).
- `unknown` → neutral outline-badge: `Ej kopplad`.

Samma helper används i högerpanelen så att restidens minuter går in i rätt projektgrupp (eller en `Ej kopplad`-grupp) — siffrorna i vänster och höger blir därmed garanterat konsistenta.

## Sammanställningens regler

`buildReportProjectDaySummary` jobbar uteslutande på data som redan finns i `StaffTimeMatrixRow`:
- Per dag itereras `cell.rows`.
- `work` → läggs på sin `label`-grupp, summerar `normal`/`overtime` proportionellt mot `cell.normalMinutes`/`cell.overtimeMinutes` om radnivå saknas (befintligt mönster: matrixen har totalerna per cell, inte per rad — vi ackumulerar `minutes` per projekt och visar dagens cell-totaler för Normal/Övertid som idag).
- `travel` → läggs på allokerad grupp via `resolveTravelAllocation`, ackumulerar i fältet `travel` samt `total`.
- `private` / `unknown_place` / `gps_gap` → räknas ej in i projektsumman (visas bara i vänsterlistan).

Inga nya queries. Ingen ny edge function. Ingen ändring av `useStaffTimeWeekMatrix`-typer (allokeringen härleds från redan tillgängliga `fromLabel`/`toLabel`-strängar).

## Print / PDF

`payroll-print.css` får en regel som tvingar tillbaka `ReportCard` till en kolumn i print, döljer `ProjectDaySummaryPanel` (eller renderar den under tidslinjen — slutgiltigt val tas vid implementation efter visuell QA). Print-vyn ska se ut som idag.

## Out of scope

- Ingen ändring i Time Engine, GPS-partition, attest, lön, eller `staff_day_submissions`.
- Ingen ny edge function eller migration.
- Ingen ändring i Tid-tabbens veckomatris.
- Ingen omtolkning av restidens minuter — bara visuell badge + sammanställning.

## Verifiering efter implementation

1. `/staff-management/time?tab=lon` på desktop (1605 px): kortet fyller bredden, vänsterkolumn ~65%, högerkolumn ~35%.
2. En rese-rad visar `Belastar: <projekt>` när `toLabel` matchar dagens work-rad; annars `Ej kopplad`.
3. Högerpanelens summor per projekt matchar summan av rader i vänsterkolumnen (manuell stickprov + ett enkelt vitest på `buildReportProjectDaySummary`).
4. Tomma dagar tar ≤ 32 px höjd.
5. Resize till 640 px: kolumnerna staplas, högerpanelen hamnar under.
6. `window.print()` ger samma utseende som idag (smalt A4-papper, ingen högerpanel synlig).
