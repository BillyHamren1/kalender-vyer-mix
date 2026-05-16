# Redigera riggdagar i Placera bokning-dialogen

## Vad du saknar idag
Dialogen `BookingPlacementDialog` låter dig redan ändra **datum, starttid, sluttid och team** för varje förvald rig- eller demonteringsdag (formuläret under kalendern). Det går dock INTE att:
- Lägga till en extra riggdag (t.ex. två riggdagar före event)
- Lägga till en extra demonteringsdag
- Ta bort en riggdag/demonteringsdag som inte ska planeras

Det här tillägget åtgärdar exakt det.

## Ändringar

### 1. `src/components/project/bookingPlacementSeed.ts`
Lägg till pure helpers (lätta att enhetstesta):
- `makeExtraDay(kind: 'rig' | 'rigDown', baseDate: string, teamId: string): PlanningDay` — bygger en ny dag med default-tider från `DEFAULTS`, datum = `nextDayIso(baseDate)` för rigDown / `prevDayIso(baseDate)` för rig.
- `prevDayIso(iso: string): string` — spegelvänd `nextDayIso`.
- `insertDaySorted(days: PlanningDay[], day: PlanningDay): PlanningDay[]` — sätter in nya dagen och returnerar kronologiskt sorterad lista (event sist bland samma datum).
- `removeDayAt(days: PlanningDay[], index: number): PlanningDay[]` — tar bort en dag (men aldrig event-dagen).

### 2. `src/components/project/BookingPlacementDialog.tsx`
- Lägg till en kompakt åtgärdsrad ovanför stepperbadgen med två knappar:
  - **+ Lägg till riggdag** (alltid synlig)
  - **+ Lägg till demonteringsdag** (alltid synlig)
- Knapparna kallar `insertDaySorted` med `makeExtraDay(...)`. Datum baseras på första befintliga rig-dag (för rig) eller sista befintliga rigDown-dag (för demont.). Team ärvs från senast valda team. Efter add → `setStepIndex` till nya dagens index.
- Lägg till liten "Ta bort dag"-knapp (rödaktig outline-variant) i steg-formuläret. Inaktiverad när `phaseLockedForCurrent` är true ELLER när det bara finns 1 plan-dag totalt. Efter remove → flytta `stepIndex` till föregående giltiga steg.
- Visa i stepper-badgen "Steg X av Y (Z dagar att planera)" så det syns att Y dynamiskt växer.

### 3. Spara-flödet (`handleFinish`) — minimala ändringar
`planSteps` itereras redan och `upsertar` `calendar_events` per dag. Eftersom upsert-nyckeln är `(booking_id, event_type, source_date)` skapas extra rig/rigDown-dagar automatiskt som nya rader. Inget extra arbete behövs i save-loopen.

OBS: Om en användare lagt till en extra riggdag senare än bokningens fasta `rig_start_time`, så ska `booking.rig_start_time` fortsatt komma från den TIDIGASTE rig-dagen — `handleFinish` använder redan `planSteps.find((d) => d.kind === 'rig')` på den sorterade listan, så detta fortsätter funka.

### 4. Tester
Ny fil `src/components/project/__tests__/bookingPlacementSeed.test.ts`:
- `makeExtraDay('rig', ...)` ger föregående dag med rig-defaults
- `makeExtraDay('rigDown', ...)` ger nästa dag med rigDown-defaults
- `insertDaySorted` håller kronologisk ordning
- `removeDayAt` tar bort rätt dag
- `seedDaysFromBooking` + add + remove är idempotent
- Befintliga vitest-tester körs efteråt för regression.

## Out of scope
- Drag-och-släpp i kalendern (separat).
- Multi-team per dag (kräver redesign).
- Edit-knapp för bokningens fasta tider (de visas read-only i höger panel — låsta tider redigeras i bokningskortet).
