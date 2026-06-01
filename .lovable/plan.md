## Mål

På `/staff-management/time` lägga till två tabbar högst upp:

- **Tid** — nuvarande veckomatris (`StaffTimeWeeklyGpsReportContent`) — default.
- **Lön** — tidrapportvyn (admin-listan över personalens tidrapporter med korrigera/attestera).

Klick på dagcell i veckomatrisen fortsätter öppna GPS-karta-dialogen (oförändrat) — attestering nås nu via Lön-tabben istället.

## Layout

```text
┌─ Tid & Lön ──────────────────────────────────┐
│ GPS-förslag → Inskickat → Attesterat …       │
├──────────────────────────────────────────────┤
│ [ Tid ] [ Lön ]                              │  ← nya tabbar
├──────────────────────────────────────────────┤
│ (innehåll byts beroende på vald tabb)        │
└──────────────────────────────────────────────┘
```

## Ändringar

### `src/pages/StaffTimeAndPayrollPage.tsx`
- Lägg till shadcn `Tabs` under headern med `defaultValue="tid"`.
- Tabb-state speglas i URL via `?tab=tid|lon` (useSearchParams) så att djuplänkar fungerar och navigering tillbaka behåller vyn.
- `TabsContent value="tid"` renderar `<StaffTimeWeeklyGpsReportContent />` (oförändrat).
- `TabsContent value="lon"` renderar admin-tidrapportlistan.

### Lön-tabbens innehåll
Återanvänder existerande sida `StaffTimeReports` (`src/pages/StaffTimeReports.tsx`) som redan är admin-listvyn för personalens tidrapporter med korrigera/attestera-flöde. Vi extraherar dess huvudsakliga innehållskomponent (utan egen `PageContainer`/`PageHeader`) till `src/components/staff-time/StaffTimeReportsContent.tsx` och importerar i båda ställena:
- `StaffTimeReports.tsx` (oförändrad route `/staff-management/time-reports`).
- Nya Lön-tabben.

Detta undviker att vi dubbel-renderar PageContainer eller bryter befintliga djuplänkar.

### Tester
- Ny test `src/test/staffTimeAndPayrollTabs.test.tsx`:
  - Verifierar att tabbarna "Tid" och "Lön" renderas.
  - Default-tabb = Tid → veckomatrisen syns.
  - Klick på Lön → tidrapportlistan syns och URL får `?tab=lon`.
  - Direktbesök på `?tab=lon` → Lön-tabben aktiv direkt.
- Kör `lovable-exec test` efter implementation.

## Out of scope
- Ingen ändring av klick-beteendet på dagcellen (GPS-karta-dialog kvar).
- Ingen ändring av `/staff-management/time-reports`-routen eller dess komponenter — bara extraktion av innehållet till en återanvändbar komponent.
- Ingen ändring av attestera-flödet i sig.
