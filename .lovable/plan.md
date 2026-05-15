## Mål

När en bokning kommer in i `IncomingBookingsList` ska användaren klicka **Placera** och få EN dialog som både visar all bokningsinfo, låter användaren välja typ (medel / stort) och planera in rig + rigDown direkt mot personalkalenderns dagvy — i ett svep. Eventet placeras inte i personalkalendern.

## UX-flöde

1. **Inkommande bokning → Placera-knapp** öppnar `BookingPlacementDialog` (ny komponent).
2. Dialogen körs som en wizard, **en dag i taget** (rig-dagar + rigDown-dagar, kronologiskt; eventdagen hoppas över).
3. Per steg/dag visas:
   - **Övre sektion (bokningsinfo)** för hela bokningen, alltid synlig:
     - Kund, bokningsnummer, leveransadress
     - Kontaktperson + telefon + e-post
     - Bokningens fasta tider (rig/event/rigDown med "Fast tid"-badge när låst)
     - Produktlista (kollapsbar)
     - Bilagor (kollapsbar, länkar)
     - Internalnotes
     - **Checkbox "Detta är ett stort projekt"** (synlig på första steget; låser typ för hela flödet).
   - **Nedre sektion (dagens planering)** sida vid sida:
     - **Vänster:** läsbar dagvy från personalkalendern för aktuellt datum (samma `TimeGrid` som personalkalendern, men read-only) — så användaren ser vem som är upptagen i vilket team.
     - **Höger:** formulär för dagen — Datum (låst om bokningens tid är låst), Start, Slut, Team-dropdown.
4. **Navigering:** `Tillbaka` / `Nästa` mellan dagar. Sista steget visar `Slutför planering`.
5. **Commit på sista steget:** alla rig/rigDown-dagar skrivs i ett svep:
   - Medel: skapa `projects`-rad + `calendar_events` per planerad dag.
   - Stort: lägg till bokning i (ev. nytt) large project + `large_project_team_assignments` per dag.
6. Toast + invalidate, dialog stänger.

## Borttaget

- Den fristående **`ProjectPlanningSheet`** behövs inte längre som separat dag-för-dag-flöde efter att projektet skapats — innehållet flyttar in i den nya wizarden. Tas bort från `ProjectLayout` / `JobDetail` / `UnifiedProjectList` / `PlanningDashboard` / `UnplannedProjectsBanner`.
- `IncomingBookingsList` kollapsar sina två knappar ("Skapa projekt" + "Stort projekt") till en enda **Placera**-knapp som öppnar nya dialogen.

## Tekniska komponenter

```
src/components/project/BookingPlacementDialog.tsx         (ny — wizard-skal + commit)
  ├─ BookingInfoHeader.tsx                                (ny — översta info-block)
  ├─ BookingPlacementDayStep.tsx                          (ny — dag + sida-vid-sida)
  └─ ReadOnlyStaffDayView.tsx                             (ny — wrappar TimeGrid read-only)
```

- Återanvänd `TimeGrid` från `src/components/Calendar/` med en `readOnly`-prop (eller wrapper som inaktiverar drag/klick).
- Återanvänd seed-logik (`trimSec`, `FIELD_MAP`, `isPhaseLocked`) från nuvarande `ProjectPlanningSheet` — lyft ut i `src/components/project/bookingPlacementSeed.ts` och dela mellan ny dialog och tester.
- Commit-logik:
  - Medel: `createProjectFromBooking` (befintlig `createJobFromBooking`-stil) + `syncStandaloneProjectToCalendar` per dag.
  - Stort: `addBookingToLargeProject` + `large_project_team_assignments` upsert.
- Datakällor i dialogen (en `useQuery` per bokning):
  - `bookings` (kund/adress/tider/notes/kontakt/låsflaggor)
  - `booking_products` (produktlista)
  - `attachments` filtrerade på `booking_id`
  - `calendar_events` för dagens datum (för dagvyn)
  - `staff_assignments` + `staff_directory` (för dagvyns kolumner)

## Tester (vitest)

- `bookingPlacementWizard.test.tsx` — wizard navigerar rig → rigDown → slutför, hoppar event, respekterar låsta tider, commitar både medel- och stort-läge i ett svep.
- Behåll `projectPlanningSheetSeed.test.ts` men byt namn/import till nya `bookingPlacementSeed.ts`.

## Riskpunkter

- `TimeGrid` används idag i interaktivt läge — read-only-wrapper får inte trigga drop-handlers.
- Stort-projekt-flödet måste kunna både skapa nytt large project och bifoga till befintligt (samma val som dagens `AddToLargeProjectDialog`); behåll det valet i wizard-headern.
- Commit-on-finish måste vara transaktionellt nog: om calendar_events-skrivning faller, rulla tillbaka projektet eller markera som ofullständigt och visa felet utan att stänga dialogen.
