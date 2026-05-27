## Mål
När du sparar flera datum i stora projekt-planeraren ska alla dagar faktiskt sparas, exakt som i personalkalendern.

## Lösning
1. Bryt ut personalkalenderns flerdagslogik till en gemensam helper/service.
   - Samma beteende som `AddRiggDayDialog`:
     - loopa alla valda datum
     - skapa/uppdatera `calendar_events` per dag
     - bevara befintlig `resource_id` om dagen redan finns
     - skriva endast första datumet till `bookings.rigdaydate/eventdate/rigdowndate`
     - köra `recompute_booking_staff_for_day` för varje ny/sparad dag

2. Byt stora projekt-panelens `handleUpdateBookingSchedule` till den gemensamma helpern.
   - Ta bort nuvarande felaktiga logik som bara sparar `dates[0]`
   - Ingen ny tabell, inga nya datumkolumner, inga arrays på `bookings`

3. Håll läslogiken oförändrad där den redan är rätt.
   - `largeProjectPlannerService` fortsätter att härleda flerdagar från `calendar_events` + primärdatumet på `bookings`
   - UI:t ska därför direkt visa 3 dagar efter save, inte 1

4. Lägg till testskydd så detta inte händer igen.
   - Enhetstest för den gemensamma flerdags-helpern:
     - flera datum => flera `calendar_events`
     - första datumet speglas till `bookings`
     - befintlig dag uppdateras utan att byta team
   - Om lämpligt: ett mindre kontraktstest för stora projekt-panelens save-väg

5. Verifiering efter implementation.
   - Kör tester
   - Kontrollera i preview att vald fas visar alla sparade datum
   - Bekräfta att “Planera hela bokningen” räknar rätt antal dagar efter save

## Tekniska detaljer
- Källa att spegla: `src/components/Calendar/AddRiggDayDialog.tsx`
- Felaktig väg idag: `src/components/project/large-planner/LargeProjectPlannerPanel.tsx` där `dates` kapas till första datumet
- Målet är att ha en enda implementerad skrivlogik för flerdagar, inte två nästan-lika versioner

## Ingen scope-creep
- Jag ändrar inte datamodellen igen
- Jag skapar inga nya tabeller eller kolumner
- Jag ändrar bara datum-sparvägen så den matchar personalkalendern 1:1