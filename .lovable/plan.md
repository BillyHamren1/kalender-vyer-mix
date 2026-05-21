
# Tidrapporter — premium-tabbad vy

Vi behåller all befintlig logik och routing (attest, månadsvy, dag-drilldown, payroll, GPS-karta) helt orörd. Endast `src/pages/StaffTimeReports.tsx` byggs om till en tabbad shell. Inga edge functions, ingen DB-ändring.

## Designreferens (premium)

Snabb research på hur ledande tidrapporteringssystem visar samma data:

- **Harvest / Toggl Track / Clockify "Team"-vyer**: vänsterlista med personer (avatar, namn, roll, status-dot), högerpanel med dagens timmar staplade per projekt, veckosumma + utilization-ring, "needs approval"-badge. Vi tar avatar+status-dot, projektstaplar och utilization-ring.
- **Hubstaff "Activity"**: per person en horisontell mini-timeline (24h) med färgade block per projekt + last-seen + battery + version. Vi tar mini-timelinen.
- **Deputy / When I Work "Approvals"**: kort-baserad kö med "Approve" / "Approve & next" + diff (planerat vs faktiskt). Vi tar kort-kön och en-klicks-attest.
- **Linear / Vercel-känsla**: tät typografi, mono för tider, mjuka separators, hover reveals actions, ingen "tabell-i-tabell". Vi följer den visuella tonen (Card, Badge, semantiska tokens, ingen tabell-zebrastil).

Allt byggs med befintliga shadcn-komponenter (`Tabs`, `Card`, `Badge`, `Avatar`, `Button`, `ScrollArea`) och semantiska tokens — inga hårdkodade färger.

## Tabb-struktur

```text
PageHeader: Tidrapporter
┌─────────────────────────────────────────────┐
│ [ Översikt ]  [ Personal ]  [ Att attestera ]│
└─────────────────────────────────────────────┘
```

### Tabb 1 — Översikt (dagens dashboard)

Nuvarande layout (karta + "Planerade idag" + snabblänkar) flyttas oförändrad hit. Inget logikbyte.

### Tabb 2 — Personal

Master/detail i samma vy, ingen sidnavigering.

```text
┌──────────────────────┬────────────────────────────────────────┐
│ Sök personal…        │  Anna Andersson · Tekniker             │
│ ─────────────────    │  ● online · 2 min sedan · 87% · v1.4.2 │
│ ● Anna A.   2 min ●  │  ─────────────────────────────────────  │
│   87% v1.4.2         │  [ Vecka 21 ‹ › ]  total 38h 12m       │
│ ● Björn K.  14 min   │                                         │
│   42% v1.4.0 ⚠       │  Mån 19/5   8h 04m   ▓▓▓▓▓▓▓░          │
│ ○ Cecilia   3 tim    │     Projekt Alpha   5h 30m              │
│   — v1.4.2           │     Projekt Beta    2h 34m              │
│ …                    │  Tis 20/5   7h 58m   ▓▓▓▓▓▓▓           │
│                      │  Ons 21/5   pågående ▓▓▓▓▓░ (öppen)    │
│                      │  …                                      │
│                      │  [ Öppna dagsvy → ]  (deep link)        │
└──────────────────────┴────────────────────────────────────────┘
```

Varje person i listan (vänster):
- Avatar/färgprick + status-dot (online/offline från `staff_locations.updated_at`, 10 min-tröskel)
- Senaste ping (relativ tid)
- Batteri-% + laddningsikon, varning om <20% och inte laddar
- App-version, ⚠-badge om < senaste kända version idag
- Söktfält + sortering (online först, sedan namn)

Detaljpanelen (höger):
- Veckonavigation (prev/next, default innevarande vecka)
- En rad per dag: datum, total tid, mini-stapel (sektioner per projekt-färg), expanderbar lista per projekt med h/m via `formatHoursMinutes`
- "Öppna dagsvy →" länkar till befintliga `/staff-management/time-reports/:staffId/:date` (logik orörd)
- Källa: `time_reports` (filter staff_id + date range), join på `bookings` för label/färg. Ingen ny tabell, ingen mutation.

### Tabb 3 — Att attestera (snabbattest)

Kort-kö med senast inskickade ej-attesterade rapporter.

```text
┌──────────────────────────────────────────────────────────────┐
│ Anna Andersson · Tis 20/5 · 7h 58m · Projekt Alpha           │
│ 07:32 → 16:30  (rast 30m)   ”Riggning + scen-check”          │
│ planerat 08–16  · diff +0h 28m                               │
│ [ Godkänn ]  [ Godkänn + nästa ]  [ Öppna ]  [ Avvisa ]      │
├──────────────────────────────────────────────────────────────┤
│ Björn Karlsson · Tis 20/5 · 5h 12m · Projekt Beta            │
│ …                                                            │
└──────────────────────────────────────────────────────────────┘
```

- Källa: samma query som `TimeReportApprovals` redan använder (`time_reports` där `approved = false`, sortera `created_at desc`, limit 50).
- "Godkänn" / "Godkänn + nästa" återanvänder befintlig attest-mutation från `TimeReportApprovals` (lyfts till en delad hook `useApproveTimeReport` om den inte redan finns). Ingen ny edge function.
- "Öppna" deep-länkar till `/staff-management/time-approvals` (full vy) eller `/time-reports/:staff/:date` — vi rör inte den sidan.
- Realtime via `useRealtimeInvalidation` på `time_reports`.

## Filer som ändras / skapas

- ✏️ `src/pages/StaffTimeReports.tsx` — wrappa nuvarande innehåll i `<Tabs>`; tab 1 = nuvarande innehåll utbrutet till `TimeReportsOverviewTab`.
- ➕ `src/components/staff-time-reports/TimeReportsOverviewTab.tsx` — innehållet som ligger i StaffTimeReports.tsx idag (karta + presence-lista).
- ➕ `src/components/staff-time-reports/StaffPresenceCard.tsx` — befintliga `StaffPresenceCard` (utbruten, oförändrad).
- ➕ `src/components/staff-time-reports/StaffListTab.tsx` — vänsterlista + detaljpanel-shell.
- ➕ `src/components/staff-time-reports/StaffWeekPanel.tsx` — veckovy per person (hämtar `time_reports` för vald staff + vecka).
- ➕ `src/components/staff-time-reports/PendingApprovalsTab.tsx` — kort-kö + snabbattest.
- ➕ `src/hooks/useStaffWeekReports.ts` — `time_reports` per staff_id + vecka, grupperat per dag/projekt.
- ➕ `src/hooks/useApproveTimeReport.ts` — om inte redan finns; återanvänd logiken från `TimeReportApprovals` (annars importera den).
- ➕ `src/test/staffTimeReportsTabs.test.tsx` — smoke-tester: tabbar renderar, listan filtreras på sök, attest-knapp triggar mutation (mockad).

Filstorleksregel: varje fil < ~200 rader (memory: file-size-and-modularity).

## Constraints som respekteras

- **No Workday Logic / Single Timer Policy / Time Data Authority** — vi läser bara `time_reports` (sanning för rapporterad tid) och `staff_locations` (signal). Vi summerar inte workday som projektkostnad och visar inte GPS som rapporterad tid.
- **Project Status Vocabulary** — inga statusord utöver det som redan visas.
- Inga DELETE/migrationer, ingen ny edge function.

## Verifiering

1. `bash scripts/test-time-reporting.sh` — fortsatt grön (vi ändrar inte write-path).
2. Ny vitest: `bunx vitest run src/test/staffTimeReportsTabs.test.tsx`.
3. Manuell preview-check: tabbar växlar, personal-listan visar status, vecka för en testperson laddar, snabbattest-knappen markerar raden attesterad och tar bort den ur listan.
