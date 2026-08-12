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

4. **Samma logik finns i två parallella kalenderhookar.**
   `useCalendarEvents` och `useRealTimeCalendarEvents` innehåller var sin kopia av datumankare, fönsterberäkning, pollning och "skyddsfilter". Buggen finns alltså på två ställen och kan komma tillbaka i den ena även om vi lagar den andra.

## Grundprincipen för det här arbetet

Vi lappar inte ovanpå. Reglerna nedan gäller hela arbetet:

- **En datumkälla.** Den vecka/dag användaren tittar på är enda ankaret. Inget parallellt ankare i sessionsminne, ingen egen lokal veckostate som lever vid sidan av datahämtningen.
- **Inga maskerande filter.** Ingen kod får dölja, behålla eller "rätta" ett hämtat resultat. Det som hämtats visas; misslyckas hämtningen syns det som fel, inte som tom kalender.
- **Fullständiga hämtningar.** Varje fråga som kan överstiga 1 000 rader sidindelas eller tas bort. Ingen tyst avkortning tillåts någonstans i kalenderkedjan.
- **En implementation.** Kalenderdatan hämtas genom en gemensam väg; dubbletthooken avvecklas istället för att fixas parallellt.
- **Låst med test.** Reglerna säkras med kontrakts-test så att de inte kan återinföras.

## Vad som ska göras

### 1. En enda datumkälla för kalendern
- Personalkalenderns vecka blir styrande: när användaren byter vecka skickas datumet in i hämtningen och ett nytt fönster laddas vid behov.
- Ta bort sessionssparat datum som ankare helt (inte bara kringgå det).
- Fönstret behåller ±180 dagar runt visad vecka, men laddas om direkt när man bläddrar utanför.

### 2. Radera de maskerande filtren
- "Behåll förra resultatet"-logiken tas bort ur båda hookarna, inte inaktiveras.
- Fel/timeout ger ett synligt feltillstånd i vyn, skilt från "inga bokningar denna vecka".

### 3. Sidindela eller ta bort alla stödfrågor
- Sidindela bemanning, projekt­kopplingar, team-tilldelningar och bokningsdetaljer (1 000 per sida tills sista sidan).
- Ta bort bemanningshämtningen i kalenderhärledningen som redan är oanvänd, istället för att hämta 38 000 rader i onödan.

### 4. Konsolidera till en kalenderhook
- `useCalendarEvents` avvecklas och dess anropare flyttas till `useRealTimeCalendarEvents` (efter att den städats), så att ankare/fönster/pollning bara finns på ett ställe.
- Görs som ett separat sista steg efter att beteendet verifierats, så vi inte blandar ihop buggfix och flytt.

### 5. Diagnostik + test
- Logga vilket fönster som laddats och hur många rader varje delfråga gav, med varning när en fråga träffar sidgränsen.
- Nya tester: veckobyte ger nytt fönster; hämtning utanför fönstret laddar om; tomt resultat visas som tomt (inte gammal data); sidindelning returnerar alla rader över 1 000; kontraktstest som förbjuder `sessionStorage`-ankare och shrink-guard i kalenderkoden.


## Tekniska detaljer

- `src/pages/PersonalkalendernPage.tsx`: `handleDateSet` är en no-op och `weekStart` är lokal — koppla den till hookens `currentDate`/`handleDatesSet`.
- `src/hooks/useRealTimeCalendarEvents.tsx`: initialt `currentDate` läses från `sessionStorage('calendarDate')`; `setEvents`-guarden ("Ignoring empty reload" / "suspicious shrink") tas bort; realtidsomladdning ska använda aktuellt ankare.
- `src/services/eventService.ts`: `fetchCalendarEvents` sidindelar redan `calendar_events`, men `bookings`-fallback, `large_project_bookings`, `booking_staff_assignments` och `large_project_team_assignments` gör det inte. `bookingAssignments` skickas in i `buildPlannerCalendarEvents` men `void`:as där — hämtningen kan tas bort helt.
- `useRealTimeCalendarEvents` batch-hämtar bokningar via `.in(uniqueBookingIds)` utan sidindelning — samma 1000-tak.
- Inga databas- eller RLS-ändringar behövs; `organization_id`-policyn är korrekt och identisk för de berörda användarna.
