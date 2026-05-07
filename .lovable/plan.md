## Mål

`src/pages/mobile/MobileTimeReport.tsx` ska bara vara en tabbskal (Idag / Kalender / Tidrapport). Alla gamla rådata-listor, lokala totalsummor och inline-formuläret tas bort så snapshot blir enda synliga tidssanning.

## Vad som tas bort

Från `MobileTimeReport.tsx` (466 → ~65 rader):

- `mobileApi.getTimeReports()` + `fetchReports()` + `useEffect`
- State: `timeReports`, `loadingReports`, `selectedBookingId`, `reportDate`, `startTime`, `endTime`, `breakTime`, `overtime`, `description`, `validationError`, `showForm`, `isSaving`
- `calculateHours()`, `getValidationError()`, `isNightShift`, `jobOptions`, `handleSubmit`
- Hela inline-formuläret "Lägg till manuell korrigering" + "Rådata · mina rapporter"-listan
- `useStaffDayStatus` import (refresh används bara av borttagen form)
- `useNavigate`, `mobileApi`, `MobileTimeReportType`, `parseISO`, `Check, Send, Plus, ChevronRight, FileText, Info`, `Button/Input/Label/Textarea/Select*`, `toast`, `formatHoursMinutes`, `useInvalidateMobileData`-imports

## Vad som blir kvar

```tsx
const MobileTimeReport = () => {
  const { t } = useLanguage();
  const { staff } = useMobileAuth();
  const { data: bookings = [], isLoading } = useMobileBookings();
  const { dialogs } = useWorkSession(bookings, staff?.id); // bara för rast/EOD/switch-dialogs
  const [activeTab, setActiveTab] = useState<TimeTabId>('today');

  if (isLoading) { /* loader */ }

  return (
    <div className="flex flex-col min-h-screen bg-card pb-24">
      <MobileHeroHeader … />
      <div className="flex-1 px-5 pt-5 pb-28 space-y-4 …">
        <MobileTimeTabs value={activeTab} onChange={setActiveTab} />
        {activeTab === 'today' && <TodayTab />}
        {activeTab === 'calendar' && <TimeCalendarTab />}
        {activeTab === 'report' && <TimeReportTab />}
      </div>
      {dialogs}
    </div>
  );
};
```

## Manuell korrigering

Befintlig redigerings-route `/m/report/:id/edit` finns kvar för befintliga rader. Att **skapa** en ny manuell rapport från Time-sidan är inte längre exponerat — flödet är: timer (auto), eller TimeReportTab/admin för rättning. Om vi senare behöver "ny manuell korrigering utan projekt" → ny separat sub-route (t.ex. `/m/report/new`) som inte kräver booking_id, men det är out-of-scope här (ingen sådan vy finns idag).

## Filer som ändras

- ✏️ `src/pages/mobile/MobileTimeReport.tsx` (kraftigt nedbantad)

Inga andra filer rörs. Inga nya beroenden, ingen DB-ändring.

## Acceptans

- Time-sidan renderar utan `mobileApi.getTimeReports()`-anrop
- Inga `time_reports`-rader visas på sidan
- Inga lokala summeringar (`calculateHours`, `formatHoursMinutes` på r.hours_worked) finns kvar i filen
- TodayTab/TimeCalendarTab/TimeReportTab är de enda kortvisningar
- Dialogs (rast/EOD/switch) renderas fortfarande via `useWorkSession`
