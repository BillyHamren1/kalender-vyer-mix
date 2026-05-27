## Diagnos — rätt nu

På `/large-project/:id/establishment` → fliken **Kalender** renderas `LargeProjectBookingPlannerCalendar` (den nya isolerade "bokningsplaneraren" med rad-per-dag och "Ingen bemannad personal denna dag"). Det är inte personalkalendern.

Personalkalendern är `CustomCalendar`, och projektsidan har redan en tunn wrapper kring den: **`ProjectCalendarView`** (`src/components/project/ProjectCalendarView.tsx`).

Den wrappern:
- använder samma `CustomCalendar`
- filtrerar events till projektets bokningar
- begränsar till projektets faktiska dagar via `useProjectCalendarDays` / `daysOverride`
- ärver alla team-kolumner, drag/drop, +-knapp, dag-expansion

Det är exakt det du ber om: "exakt samma utseende och funktion som personalkalendern".

## Plan — en enda växel

### Ändring 1: `src/pages/project/LargeEstablishmentPage.tsx`
Byt rendreringen i `pageMode === "calendar"`-grenen:

```diff
-import LargeProjectBookingPlannerCalendar from '@/components/project/large-planner/LargeProjectBookingPlannerCalendar';
+import ProjectCalendarView from '@/components/project/ProjectCalendarView';
...
-{pageMode === "calendar" ? (
-  <LargeProjectBookingPlannerCalendar largeProjectId={project.id} />
-) : ...
+{pageMode === "calendar" ? (
+  <ProjectCalendarView projectId={project.id} isLargeProject />
+) : ...
```

Det är hela kodändringen.

### Ändring 2: lämna kvar som backup (ingen kod-borttagning)
`LargeProjectBookingPlannerCalendar` + `large_project_booking_plan_items`-tabellen lämnas orörda (raderar inget enligt "Never Delete DB Rows"-policyn). De är bara inte längre monterade.

### Verifiering
1. Navigera till `/large-project/5c94ebcc…/establishment` → klicka **Kalender** → ska visa samma CustomCalendar-rigg som personalkalendern, men begränsad till projektets rig/event/rigDown-dagar.
2. Drag/drop av personal, "+"-knapp, team-kolumner ska fungera (de ärvs från CustomCalendar).
3. Inga skrivningsregler bryts — `ProjectCalendarView` är samma som används för vanliga projekt idag.

### Vad jag inte ändrar
- Personalkalendern (`CustomCalendar`) — orörd.
- Mobilkalendern, time-engine, GPS, time_reports — orörda.
- Planera- och Excel-flikarna — orörda.
- Inga DB-migrationer, inga DELETE.

### Risk
Mycket låg — ProjectCalendarView används redan i samma roll för vanliga projekt och har `isLargeProject`-flagga sedan tidigare. Vi tar bara bort en ompoint-routing som bytte till en alternativ komponent.
