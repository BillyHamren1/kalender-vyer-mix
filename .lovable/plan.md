# Projektkalender: kopiera beteende, inte backend

## Vad jag missförstod
Jag bytte ut projektkalendern mot `ProjectCalendarView` (personalkalenderns komponent) och lät `LargeProjectPlannerPanel` skriva via `syncBookingPhaseDays` — det blandar ihop backends. Det är fel.

## Regel (låsa fast)
- **Personalkalendern** skriver till `calendar_events` + `bookings.<phase>_*`.
- **Projektkalendern (large project planner)** skriver till `large_project_booking_plan_items` (+ `large_project_team_assignments` för team).
- De får **aldrig** dela skrivväg. Endast UX/beteende ska vara identiskt.

## Vad som ska göras

### 1. Återställ komponentvalet
- `LargeEstablishmentPage.tsx` ska återgå till att rendera **`LargeProjectBookingPlannerCalendar`** (projektkalenderns egen komponent), inte `ProjectCalendarView`.
- Behåll `LargeProjectPlannerPanel` som högerpanel som tidigare.

### 2. Återställ skrivvägen i panelen
- `LargeProjectPlannerPanel.handlePlanWholeBooking` ska **inte** anropa `syncBookingPhaseDays`.
- Den ska skriva planerade dagar till `large_project_booking_plan_items` via den befintliga planner-servicen (samma väg som tidigare innan jag bröt den).
- Återinför valideringen att man bara kan planera på dagar som finns i projektet (eller ersätt med projektkalenderns egen "lägg till rigdag/nedriggdag"-flöde — se punkt 3).

### 3. Kopiera BETEENDE från personalkalendern till projektkalendern
Detta är det som faktiskt löser användarens problem. Identifiera och spegla i `LargeProjectBookingPlannerCalendar`:

- **Hover/popover**: samma hover-card-komponent som personalkalendern (`StaffCalendarHoverCard` eller motsv.) — visa samma info, samma trigger-delay, samma stil.
- **Klick → redigera rig/event/nedrigg**: samma dialog/flöde som personalkalendern använder för att ändra fas-dagar. I projektkalendern ska den dialogen skriva till **planner-tabellen**, inte till `bookings`/`calendar_events`.
- **Lägg till extra rigg-/nedriggdag**: samma UX som `AddRiggDayDialog`, men sparvägen går till `large_project_booking_plan_items` (eller motsvarande planner-store).
- **Drag/resize, färger, block-layout, badges**: matcha visuellt och interaktionsmässigt.

Konkret: lyft ut den **presentationella** delen av personalkalenderns block/hover/dialog till delade, "dumma" UI-komponenter (props in, callbacks ut) som båda kalendrarna kan rendera. Skrivlogiken stannar i respektive kalenders egen container/hook.

### 4. Fixa "sparade 3 nedriggdagar men inget hände"
- Verifiera att projektkalenderns "spara nedriggdagar"-flöde faktiskt skriver till planner-tabellen och att kalendern läser från samma källa.
- Lägg till en vitest som planerar 3 nedriggdagar via projektkalenderns flöde och asserterar att de dyker upp i `large_project_booking_plan_items` och renderas i kalendern — utan att röra `calendar_events`/`bookings`.

## Tekniskt (filer)
- `src/pages/project/LargeEstablishmentPage.tsx` — återställ till `LargeProjectBookingPlannerCalendar`.
- `src/components/project/large-planner/LargeProjectPlannerPanel.tsx` — ta bort `syncBookingPhaseDays`-anropet, återställ planner-service-skrivning.
- `src/components/project/large-planner/LargeProjectBookingPlannerCalendar.tsx` (+ adapter/service) — addera hover-card, edit-dialog, add-day-dialog som speglar personalkalenderns beteende, men med planner-skrivväg.
- Eventuellt nya delade presentationskomponenter under `src/components/calendar/shared/` (hover-card, phase-day-dialog skal) — inga DB-anrop i dessa.
- Test: `src/components/project/large-planner/__tests__/plannerWriteIsolation.test.ts` — säkerställer att projektkalendern aldrig skriver till `calendar_events`/`bookings`.

## Vad jag INTE rör
- `calendar_events`, `bookings.<phase>_*`, `syncBookingPhaseDays`, personalkalenderns logik.
- Time Engine, BSA, geofence — orelaterat.
