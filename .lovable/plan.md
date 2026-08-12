# Personalkalendern: bokningar försvinner / olika per användare

## Vad kontrollen visar

Ranjan och Joel ligger i samma organisation och har samma behörighet i databasen (kontrollerat: alla inloggade konton utom två externa hör till samma org, och samtliga 468 bokningar + alla kalenderrader tillhör den orgen). Skillnaden ligger alltså inte i data eller rättigheter — den ligger i hur klienten bestämmer vilket datumintervall som hämtas och i "skydden" som filtrerar bort resultat efter hämtning.

Tre konkreta fel hittades:

1. **Veckonavigeringen är frånkopplad från datahämtningen.**
   Personalkalendern har sin egen vecka (Föregående/Nästa/Idag), men den skickas aldrig vidare till hämtningen — datumåterkopplingen är en tom funktion. Hämtningen använder istället ett datum som sparats i webbläsarens sessionsminne från en tidigare vy. Två personer får därför olika hämtningsfönster i samma vy, och den som har ett gammalt datum sparat ser en tom eller ofullständig kalender. Bläddrar man långt bort laddas aldrig den perioden om.

2. **"Skyddsfiltren" gömmer riktiga resultat.**
   Efter varje omladdning kastas resultatet bort om det är tomt, eller om det innehåller mindre än hälften så många poster som förra gången. Det gör att skärmen kan visa gammal data som inte längre stämmer, eller vägra uppdatera till korrekt data — olika för olika användare beroende på vad de laddade först.

3. **Tysta 1000-radersgränser i stödfrågorna.**
   Flera följdfrågor (bemanning per bokning, projekt­kopplingar, bokningsdetaljer) hämtas utan sidindelning. Bemanningsfrågan omfattar idag ca 38 900 rader men kan som mest få tillbaka 1 000 — resten försvinner utan felmeddelande, och vilka 1 000 som kommer tillbaka är inte garanterat samma mellan två anrop.

## Vad som ska göras

### 1. En enda datumkälla för kalendern
- Personalkalenderns vecka blir styrande: när användaren byter vecka skickas datumet in i hämtningen och ett nytt fönster laddas vid behov.
- Ta bort beroendet av sessionssparat datum som ankare vid start; utgå från den vecka som faktiskt visas.
- Fönstret behåller ±180 dagar runt visad vecka, men laddas om direkt när man bläddrar utanför.

### 2. Ta bort de maskerande filtren
- Ett tomt eller mindre resultat efter en färdig hämtning ska visas som det är.
- Ersätt "göm resultatet"-logiken med en synlig indikator när en hämtning misslyckas (fel/timeout), så att tom vy aldrig kan förväxlas med lyckad hämtning.

### 3. Sidindela alla stödfrågor
- Sidindela hämtning av bemanning, projekt­kopplingar, team-tilldelningar och bokningsdetaljer på samma sätt som kalenderraderna redan är (1 000 per sida tills sista sidan).
- Ta bort den bemanningshämtning i kalenderhärledningen som redan är oanvänd, istället för att hämta 38 000 rader i onödan.

### 4. Diagnostik + test
- Logga tydligt vilket fönster som laddats och hur många rader varje delfråga gav, med varning när en fråga träffar sidgränsen.
- Nya tester: veckobyte ger nytt fönster; hämtning utanför fönstret laddar om; tomt resultat visas inte som gammal data; sidindelning returnerar alla rader över 1 000.

## Tekniska detaljer

- `src/pages/PersonalkalendernPage.tsx`: `handleDateSet` är en no-op och `weekStart` är lokal — koppla den till hookens `currentDate`/`handleDatesSet`.
- `src/hooks/useRealTimeCalendarEvents.tsx`: initialt `currentDate` läses från `sessionStorage('calendarDate')`; `setEvents`-guarden ("Ignoring empty reload" / "suspicious shrink") tas bort; realtidsomladdning ska använda aktuellt ankare.
- `src/services/eventService.ts`: `fetchCalendarEvents` sidindelar redan `calendar_events`, men `bookings`-fallback, `large_project_bookings`, `booking_staff_assignments` och `large_project_team_assignments` gör det inte. `bookingAssignments` skickas in i `buildPlannerCalendarEvents` men `void`:as där — hämtningen kan tas bort helt.
- `useRealTimeCalendarEvents` batch-hämtar bokningar via `.in(uniqueBookingIds)` utan sidindelning — samma 1000-tak.
- Inga databas- eller RLS-ändringar behövs; `organization_id`-policyn är korrekt och identisk för de berörda användarna.
