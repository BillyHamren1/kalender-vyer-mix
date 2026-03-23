

## Fix: Visa timmar i format "Xh Ym" istället för decimaltal

### Problem
`hours_worked` lagras som decimaltal (t.ex. 2.48) och visas rakt av som "2.48h" överallt. Användaren vill se "2h 29m" istället.

### Lösning

**1. Skapa hjälpfunktion `src/utils/formatHours.ts`**
```typescript
export function formatHoursMinutes(decimalHours: number): string {
  const h = Math.floor(decimalHours);
  const m = Math.round((decimalHours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
```

**2. Ersätt alla `{report.hours_worked}h` och `{report.overtime_hours}h` med `formatHoursMinutes(...)`**

Filer som uppdateras (~11 filer):
- `TimeReportListView.tsx` — badge-visning + dagssummor
- `TimeReportList.tsx` — badge-visning
- `StaffTimeReportAllMonths.tsx` — badge + månadssummor
- `DailyTimeView.tsx` — summor (beräkningar behålls i decimal, bara visningen ändras)
- `JobTimeTab.tsx` — mobil jobbvy
- `MobileTimeHistory.tsx` — historikvy
- `MobileProfile.tsx` — profilvy
- `StaffCostTable.tsx` — `.toFixed(1) h` → `formatHoursMinutes()`
- `TimeReportApprovalPanel.tsx` — godkännandevy
- `StaffTimeReportsSection.tsx` — projektsida
- `TimeReportForm.tsx` — summor i formulär

Alla beräkningar (kostnader, summor) fortsätter använda decimalvärden — bara **visningen** ändras.

