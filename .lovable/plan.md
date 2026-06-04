# Lata in bokningar i stora projekt

Du har rätt — när man öppnar t.ex. Almedalen 2026 körs idag flera tunga queries över ALLA länkade bokningar redan innan något renderats, även om man bara vill se projektsidan:

1. `fetchLargeProject` hämtar projekt + alla `large_project_bookings` + en `bookings`-batch `.in('id', bookingIds)` med en bred kolumnlista (delivery, kontakt, tider, internalnotes, status …).
2. `useBookingPhaseDays(siblingBookingIds)` hämtar ALLA `calendar_events` för alla syskonbokningar + en `bookings`-läsning av låsflaggor, plus en global Realtime-kanal på `calendar_events`.
3. `useEffect` på adress kör en till `bookings`-query.

Med många bokningar (Almedalen) blir det enorma payloads varje gång man bara öppnar projektet — trots att header, anslagstavla, "Följare", filer etc. inte behöver bokningsdata.

## Vad jag vill göra

### 1. Smal initial query, full payload bara på begäran
Splitta `fetchLargeProject` i två lager (i `largeProjectService.ts` + `useLargeProjectDetail.tsx`):

- `fetchLargeProjectCore(id)` — projekt + `large_project_bookings`-listan (id, booking_id, display_name, sort_order). Räcker för layout, header, antal, navigation, Bokningslistan (svepradens titel kommer redan från `display_name` / vi kompletterar lazy).
- `fetchLargeProjectBookingsFull(bookingIds)` — den breda `bookings`-läsningen. Körs ENDAST när användaren behöver den (se nedan).

`useLargeProjectDetail` exponerar:
```
project          // core (utan booking.*-fält)
bookingStubs     // [{ id, booking_id, display_name, sort_order }]
useBookingsFull  // hook som hämtar fulla bokningar batchat när någon vy ber om det
```

### 2. Per-bokning lazy load i listan
I `LargeProjectLayout` Bokningslistan (`linkedView === 'bookings'`):
- Raderna renderas direkt från stubs (titel via `display_name`, ev. fallback "Laddar…").
- `BookingInfoExpanded` mountas redan idag bara när raden expanderas — vi byter dess input från det förladdade `b`-objektet till en egen `useBookingDetail(lpb.booking_id)` så att DEN bokningens fulla data hämtas först vid klick. Inget förändras visuellt.
- Leveransadress-pillen på den kollapsade raden hämtas från en lättviktig batch (`id, deliveryaddress, status`) bara för listan — eller helt enkelt utelämnas tills raden expanderas, om det är OK för dig (jag väljer "lättviktig batch" som default så vyn ser identisk ut).

### 3. Flytta tunga aggregeringar till de vyer som behöver dem
- `useBookingPhaseDays(siblingBookingIds)` och `derivedTimes` (rig/event/rigDown-datum sammanslaget) flyttas in i `LargeProjectScheduleEditable` (Planering-sektionen) som idag är enda konsumenten. Det betyder att den globala Realtime-kanalen på `calendar_events` inte längre öppnas bara för att man öppnar projektsidan.
- Adress-auto-inherit `useEffect` flyttas till en engångsbakgrundsfunktion: kör bara om projektet saknar adress OCH bokningslistan redan är hämtad i sammanhang där den ändå behövs (t.ex. när användaren öppnar Planering eller bokningslistan). Just nu kör den en extra `bookings`-query på mount av varje stort projekt.

### 4. Produkter/Excel/Ekonomi-tabbarna
De är redan tab-gated via `linkedView` / route, så där krävs ingen ändring — men de får nu `bookingStubs` + en intern `useBookingsFull(bookingIds)` i stället för förladdat data. Excel-vyn och `LargeProjectProductsOverview` byter kontrakt: tar `bookingIds` + `largeProjectId` och hämtar själva bokningsmetadata + produkter.

### 5. Verifiering
- Lägg till en liten testfil `src/services/__tests__/largeProjectService.coreVsFull.test.ts` som verifierar att `fetchLargeProjectCore` aldrig läser `bookings`-tabellen och att `fetchLargeProjectBookingsFull` bara körs för uttryckligen begärda ids.
- Manuell kontroll i preview: öppna Almedalen 2026 → Network ska bara visa `large_projects` + `large_project_bookings` + projektets egna queries (followers, files, tasks, gantt). Klicka på en bokningsrad → då ska den enda bokningen laddas. Öppna Planering → då laddas calendar_events.

## Tekniska anteckningar

- Ingen schemaändring krävs.
- Inga UI-ändringar — bara att vissa rader kort visar en skelett-skimmer när man expanderar.
- Effekt på minne/CPU: payload vid öppning sjunker från `O(antal bokningar × ~20 kolumner + alla calendar_events)` till `O(antal bokningar × 4 kolumner)`.
- Realtime-kanaler: en (`large-project-detail`-invalidations) i stället för en global `calendar_events`-kanal vid varje projektöppning.

Säg till om jag ska köra, eller om du hellre vill att jag bara gör steg 1+2 först och låter Planering vara orörd.
