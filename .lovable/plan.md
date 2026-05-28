## Mål

Samma `staffId + date` ska visa exakt samma rad, status, tid och rapportförslag i **admin (Tid & Lön)** och i **personalappen** — alltid läst via en gemensam week-flow-modell. GPS-motor, Time Engine, legacy time_reports/workdays/LTE/travel rörs INTE.

## Befintlig infrastruktur (återanvänds som-den-är)

| Lager | Fil | Roll |
|---|---|---|
| GPS-förslag (dag, mobil) | `supabase/functions/get-mobile-gps-day-view` | Bygger GPS-segment + manualTargets för en dag |
| GPS-vecka (admin) | `supabase/functions/get-staff-gps-week-summary` | Veckosummering från GPS-pings |
| Submit | `supabase/functions/submit-mobile-gps-day-v2` | Skriver `staff_day_submissions` (status `submitted`/`edited`) |
| Approve / Begär komplettering | `supabase/functions/update-staff-day-submission-status` | Sätter `approved` / `needs_control` / `correction_requested` |
| Status-tabell | `staff_day_submissions` | Sanning för allt som är inskickat/attesterat |
| GPS-radbygge (frontend) | `src/lib/staff-gps/reportRowFilter.ts` (`toReportRows`/`summarizeReportRows`) | Förslagsrader från GPS-segment |

Vi bygger **inget nytt under huven** — vi adderar en tunn gemensam mappar + ny vy.

## A. Gemensam week-flow view model

**Ny fil:** `src/lib/staffTimeFlow/weekFlow.ts`

Ren TypeScript-mapper utan IO. Tar:
- `weekDates: Date[]` (mån-sön)
- `gpsSummaries: StaffGpsDaySummary[]` (från `useStaffGpsWeekSummary`)
- `submissions: StaffDaySubmissionRow[]` (från `staff_day_submissions` för veckan)
- `viewer: 'admin' | 'staff'`

Returnerar:

```ts
interface WeekFlowDay {
  date: string;
  status: 'gps_proposal' | 'submitted_waiting_approval' | 'correction_requested' | 'approved';
  startTime: string | null;          // HH:mm Stockholm
  endTime: string | null;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  rows: WeekFlowRow[];               // platsarbete / resa / dolt underlag
  source: 'gps_proposal' | 'submission_snapshot';
  submissionId: string | null;
  gpsAvailable: boolean;
  canSubmit: boolean;                // viewer==='staff' && status==='gps_proposal'|'correction_requested'
  canApprove: boolean;               // viewer==='admin' && status==='submitted_waiting_approval'
  canRequestCorrection: boolean;     // viewer==='admin' && status==='submitted_waiting_approval'
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  reviewComment: string | null;
}
```

**Statusmappning från DB → flow:**
- `approved` / `payroll_approved` → `approved` (låst)
- `submitted` / `edited` / `needs_control` → `submitted_waiting_approval`
- `correction_requested` → `correction_requested`
- ingen rad → `gps_proposal` (rader byggs av `toReportRows(gpsSummary.segments)`)

För `submitted/approved`-dagar tas rader från `submission.display_timeline_snapshot_json` (det som faktiskt skickades in) → admin och app ser identiska rader.

**Ny hook:** `src/hooks/staffTimeFlow/useStaffTimeWeekFlow.ts`
- Wrappar `useStaffGpsWeekSummary` + en query mot `staff_day_submissions` för (staffId, weekRange) + kör `buildWeekFlow`. Realtime-invalidering på `staff_day_submissions`.

## B. Ny Tid & Lön-huvudvy

**Ny fil:** `src/components/staff-time/StaffTimeWeeklyGpsReportContent.tsx`

Layout:
```
┌─────────────────────────────────────────────────┐
│  [Personalväljare ▾]  [● Personalvy] [○ Väntar godkännande]   ←→ vecka  │
├─────────────────────────────────────────────────┤
│  Mån 26/5   08:58–17:00  Arbete 8h · Resa 0h    │
│  Status: Förslag från GPS         [Öppna GPS]   │
│  • FA Warehouse 08:58–09:49  51m                │
│  • Resa → Swedish game fair 09:49–11:00  1h 11m │
│  • Swedish game fair 11:00–17:00  6h            │
├─────────────────────────────────────────────────┤
│  Tis 27/5  ...                                  │
└─────────────────────────────────────────────────┘
```

**Toggleläge "Väntar godkännande":**
- Använder `useAllPendingSubmissionsThisWeek` (enkel query: alla submissions med status `submitted`/`edited`/`needs_control` i org för veckan)
- Renderar samma `DayCard`-komponent grupperad per personal
- Klick → fäller ut samma personalvy

Komponenter:
- `WeekFlowDayCard.tsx` — visar status-pill, rader, knappar
- `WeekFlowWeekHeader.tsx` — personalväljare, toggle, veckonavigering
- `WeekFlowApproveButtons.tsx` — Godkänn / Begär komplettering (med dialog för kommentar)

**Ändrad fil:** `src/pages/StaffTimeAndPayrollPage.tsx`
- Default-tab blir den nya `StaffTimeWeeklyGpsReportContent`
- Gamla tabbar (Attest legacy, Rapporter, Lön/Månadsrapport/Löneperioder) flyttas bakom en diskret "Avancerat ▾"-meny — INTE raderas (per krav K)

## C. Mobilappen läser samma model

`src/pages/mobile/MobileTimeReport.tsx` (eller `MobileTimeHistory`) byts till att läsa `useStaffTimeWeekFlow({ staffId: me, viewer: 'staff' })` och rendera samma `WeekFlowDayCard` (mobil-variant). Submit-knapp triggar befintliga `submit-mobile-gps-day-v2`. Status-pill, knappar och rader är identiska med admin-vyn — bara CTA-knapparna skiljer.

`MobileDayReview.tsx` behåller submit-flödet, men efter submit invalideras week-flow-cachen → vyn visar direkt "Väntar godkännande".

## D. Submit / Approve — inga ändringar i edge functions

- Submit: redan klar via `submit-mobile-gps-day-v2`
- Approve / Correction: redan klar via `update-staff-day-submission-status`
- ✅ Båda rör redan endast `staff_day_submissions` (+ cost lines för approved)

## E. Kontraktstester

**Ny fil:** `src/lib/staffTimeFlow/__tests__/weekFlow.contract.test.ts`

Låser:
1. Samma input (gpsSummary + submission) → samma `WeekFlowDay` oavsett `viewer`
2. Ingen submission → `status='gps_proposal'`, rader från `toReportRows`
3. Submission `submitted` → `status='submitted_waiting_approval'`, rader från `display_timeline_snapshot_json`
4. Submission `approved` → `status='approved'`, `canApprove=false`, `canSubmit=false`
5. Submission `correction_requested` → app får `canSubmit=true`, admin får inga knappar
6. `viewer='staff'` får aldrig `canApprove=true`
7. `viewer='admin'` får aldrig `canSubmit=true`
8. Dagar utan submission visas alltid (inte filtreras bort)
9. `payroll_approved` mappas till `approved` (låst)

**Ny fil:** `src/components/staff-time/__tests__/StaffTimeAndPayrollPage.contract.test.tsx`
10. Tid & Lön default-tab renderar `StaffTimeWeeklyGpsReportContent`, INTE `StaffTimeApprovalsPageContent`

(Statiskt grepp-test, kör i vitest. Inga DB-anrop.)

## F. Filer som ändras / skapas

**Skapas:**
- `src/lib/staffTimeFlow/weekFlow.ts`
- `src/lib/staffTimeFlow/types.ts`
- `src/lib/staffTimeFlow/__tests__/weekFlow.contract.test.ts`
- `src/hooks/staffTimeFlow/useStaffTimeWeekFlow.ts`
- `src/hooks/staffTimeFlow/usePendingWeekSubmissions.ts`
- `src/components/staff-time/StaffTimeWeeklyGpsReportContent.tsx`
- `src/components/staff-time/week-flow/WeekFlowDayCard.tsx`
- `src/components/staff-time/week-flow/WeekFlowApproveButtons.tsx`
- `src/components/staff-time/week-flow/WeekFlowHeader.tsx`
- `src/components/staff-time/__tests__/StaffTimeAndPayrollPage.contract.test.tsx`

**Ändras:**
- `src/pages/StaffTimeAndPayrollPage.tsx` — ny default-vy, gamla tabbar bakom "Avancerat"
- `src/pages/mobile/MobileTimeHistory.tsx` (eller motsv.) — byter till `useStaffTimeWeekFlow`

**Rörs INTE:**
- Alla GPS-functions, Time Engine, `submit-mobile-gps-day-v2`, `update-staff-day-submission-status`, `get-mobile-gps-day-view`, `get-staff-gps-week-summary`
- `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `staff_day_report_cache`, `payroll-export`, Fortnox
- Gamla komponenter (`StaffTimeApprovalsPageContent`, `PayrollMonthReportPageContent`, `StaffTimeReportsContent`, `StaffPayrollPeriodsContent`) — bara gömda bakom Avancerat

## G. Plan-validering & risker

- **Status-mappning**: DB använder redan `submitted`/`edited`/`needs_control`/`correction_requested`/`approved`/`payroll_approved`. Vi inför INGA nya DB-statusar — mappar bara i view-modellen. ✅ Ingen migration.
- **Rader för submitted/approved**: Tas från `display_timeline_snapshot_json`. Om snapshot saknas (gamla rader) faller vi tillbaka till GPS-förslag med varning "Underlag saknas".
- **Mobile Time v2-policy**: Vi bryter inte den — appen fortsätter vara dum renderer av samma payload. ✅
- **Multi-tenancy**: Alla queries filtrerar på `organization_id` via befintlig RLS + explicit `.eq()`. ✅

## H. Slutleverans

Efter implementation rapporteras enligt punkt N:
- Week-flow source: `src/lib/staffTimeFlow/weekFlow.ts`
- GPS-källa: `useStaffGpsWeekSummary` + `toReportRows`
- App och admin läser samma hook `useStaffTimeWeekFlow`
- Submit: oförändrat `submit-mobile-gps-day-v2`
- Approve: oförändrat `update-staff-day-submission-status`
- Gamla vyer: bakom "Avancerat ▾" i Tid & Lön

Säg till om du vill att jag justerar något i planen — annars sätter jag igång och bygger.
