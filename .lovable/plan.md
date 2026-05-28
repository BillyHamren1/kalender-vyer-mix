# Plan: låt Placera-dialogen läsa alla riggdagar enhetligt

## Mål
När en bokning har flera riggdagar ska **alla** visas i Placera-dialogen. En riggdag är en riggdag — ingen särskild logik för ”första”, ”extra” eller någon annan variant.

## Vad som ska ändras

1. **Gör en gemensam läsmodell för bokningens dagar**
   - Bygg en helper som läser bokningens planeringsdagar som **en enda lista per fas** (`rig`, `event`, `rigDown`).
   - Den ska slå ihop:
     - bokningens datumfält
     - motsvarande dagar som redan finns i `calendar_events`
   - Resultatet ska vara en enhetlig lista där varje dag behandlas likadant oavsett varifrån den kom.

2. **Använd den gemensamma modellen i `BookingPlacementDialog`**
   - Seedningen i dialogen ska inte längre bara läsa `rigdaydate/eventdate/rigdowndate`.
   - Den ska använda den gemensamma helpern så att alla riggdagar, eventdagar och nedmonteringsdagar kommer med direkt när man öppnar Placera.

3. **Behåll samma regler för alla riggdagar**
   - Samma sortering, samma tidslogik, samma teamlogik.
   - Ingen specialbehandling för en viss riggdag beroende på om den ligger i `bookings` eller i `calendar_events`.
   - Ingen ändring av personalkalenderns logik.

4. **Lägg till tester som låser beteendet**
   - Bokning med flera riggdagar ska ge flera riggdagar i seed-listan.
   - Samma dag får inte dubblas om den finns i båda källorna.
   - Flera `rigDown`-dagar och eventdagar ska också komma med korrekt.
   - Test som säkerställer att dagarna behandlas enhetligt oavsett källa.

5. **Verifiera i preview och med tester**
   - Öppna samma typ av bokning i preview och kontrollera att båda riggdagarna syns i Placera-dialogen.
   - Kör riktade Vitest-tester efter ändringen.

## Berörda filer
- `src/components/project/bookingPlacementSeed.ts`
- `src/components/project/BookingPlacementDialog.tsx`
- `src/components/project/__tests__/bookingPlacementSeed.test.ts`

## Tekniska detaljer
- Ingen ny datamodell i databasen.
- Ingen skillnad mellan ”huvud-riggdag” och ”extra riggdag”.
- `bookings` och `calendar_events` används bara som två läskällor till **samma** daglista i UI:t.
- Deduplikering ska ske på kombinationen `kind + date` så att samma dag inte visas två gånger.
- Sortering ska fortsätta vara kronologisk med fasordning inom samma datum.

## Resultat
Placera-dialogen visar alla bokningens riggdagar korrekt, utan att införa olika logik för olika riggdagar.