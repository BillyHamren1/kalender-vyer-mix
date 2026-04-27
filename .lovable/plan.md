## Vad är fel

Personalkalendern (bild 1) och mobilappen (bild 2–4) använder två helt olika datakällor för att avgöra vad en användare ska se:

| Vy | Hur den hittar bokningar för en person på datum X |
|----|---------------------------------------------------|
| **Personalkalendern (desktop)** | Bokning visas i kolumnen för team-Y om `calendar_events.resource_id = team-Y` på X. Personen är "med" på team-Y om hen har en rad i `staff_assignments` (staff_id, X, team-Y). |
| **Mobilappen idag** | Bokning visas bara om det finns en `booking_staff_assignments`-rad (staff_id, booking_id, X, team-Y). |

Konsekvens: så fort en bokning byter team i kalendern (drag-and-drop) eller en person flyttas mellan teams en specifik dag, så uppdateras inte alltid `booking_staff_assignments` — och då driftar mobilen från personalkalendern. Det matchar exakt det användaren beskrev tidigare: "Tilldelning av personal sker på TEAM-nivå – INTE per projekt!".

Konkret kontrollerat i databasen:
- Wed 29: `calendar_events` på team-1 = endast Restaurang Josefina #2604-128. Westmans #2604-17 ligger på team-2. Tiomila #2603-9 ligger på team-3. Personalkalendern (bild 1) visar dock alla i team-1-kolumnen → bilden återspeglar faktiskt `booking_staff_assignments` per person, inte `calendar_events`. Det är i sin tur en annan inkonsistens.
- Aleksejs har för Wed 29 bara `team_id='project'` i BSA → mobilen visar Tiomila som projektblock men inget annat (korrekt enligt nuvarande regler, men användaren förväntar sig att se det personalkalendern visar).

Kort: två vyer, två sanningar. Vi behöver **en sanning**.

## Lösning

Gör mobil-API:t (`mobile-app-api → handleGetBookings`) härlett från samma källa som personalkalendern, så att bägge vyerna alltid är 1:1.

**Ny härledningsregel (per staff_id, per datum X):**

1. Läs `staff_assignments` för (staff_id, X) → ger en mängd team-Y som personen är schemalagd på.
2. Läs `calendar_events` där `resource_id ∈ team-Y` och `start_time::date = X` → ger alla bokningar (regular + large-project) som faktiskt ligger på de teamen den dagen.
3. Komplettera med direkta `booking_staff_assignments` (där team_id är ett riktigt team) som "explicit override" — backwards compat och för bokningar som scheduleras direkt på en person.
4. Behåll project-membership-regeln (`team_id='project'`) för synlighet av övriga bokningar i samma stora projekt på dagar då personen är schemalagd på projektet.

Skift (shifts) byggs sedan från unionen ovan, med tider från `calendar_events` (eller fallback från bokningens fas-tider om event saknas).

### Flöde (text-diagram)

```text
staff_assignments(staff_id, date)        →  team-Y
                                            │
                                            ▼
calendar_events(resource_id=team-Y, date) →  bookings för (staff, date)
                                            │
                                            ▼
union med BSA-rows (team_id ≠ project)   →  shifts + bokningskort
                                            │
                                            ▼
+ project-membership (BSA team_id=project) → övriga bokningar i samma stora projekt
                                              för datum personen är schemalagd på projektet
```

### Effekter

- Mobilen visar exakt samma bokningar/datum/tider som personalkalendern.
- När en planerare flyttar en bokning till annat team → mobilen följer med automatiskt (inga BSA-skrivningar krävs).
- När en planerare byter en persons team för en dag → mobilen uppdateras direkt.
- Realtidsabonnemanget i `useScheduledShifts` utökas med `staff_assignments` så att UI invalideras direkt när team-tilldelningar ändras.

### Risker / kanttyper som hanteras

- **Personen är på flera team samma dag** (t.ex. team-2 och team-11): hämta union av events.
- **Bokning ligger i flera team-kolumner samma dag** (rig på team-1, rigdown på team-3): båda dyker upp som separata shifts om personen är på respektive team.
- **Bokningen är en del av ett stort projekt**: konsolideras fortfarande till ett projektkort i mobilen (oförändrad UI-regel).
- **Internt Lager-projekt**: oförändrat, läses som idag.
- **Avbokade bokningar**: filtreras fortfarande på `status='CONFIRMED'`.
- **Tidszoner / nattskift**: vi använder samma `start_time`-fält som planeringen — ingen TZ-justering läggs till.

## Tekniskt

**Ändrade filer**

1. `supabase/functions/mobile-app-api/index.ts` (`handleGetBookings`)
   - Lägg till hämtning av `calendar_events` filtrerade på `resource_id ∈ staffTeamIdsByDate` och `start_time` inom horisonten (today → today+N).
   - Bygg `derivedBookingDateKeys = Set<"booking_id|date">` från (a) calendar_events via team×datum, (b) befintliga BSA-rader med riktigt team_id.
   - Använd `derivedBookingDateKeys` som *både* synlighetsfilter (vilka bookings som returneras) *och* som källa för `shiftDateKeys` i shifts-byggaren.
   - Bevara nuvarande project-membership-expansion (`team_id='project'`) som tilläggssynlighet (men inte shift-källa).
   - Bevara fallback-shift-byggaren (`getBookingShiftWindowForDate`) för bokningar utan `calendar_events`-rad.
   - Uppdatera kommentarsblocket "STRICT SCHEDULING AUTHORITY" → ny dokumentation: "härlett från staff_assignments × calendar_events, samma källa som planeringskalendern".

2. `src/hooks/useScheduledShifts.ts`
   - Lägg till realtime-subscription på `staff_assignments` (filter: `staff_id=eq.${staff.id}`) så att shifts invalideras direkt när planeraren flyttar personen mellan team.

3. *(Valfritt, backwards-compat)* `staffAssignmentService` rörs ej.

**Inga DB-migrationer** krävs — all logik flyttas i edge-funktionen.

**Test**
- Manuell verifiering med Aleksejs (Mon 27, Tue 28, Wed 29) och Billy (samma datum) — mobil ska matcha planeringsvyn 1:1.
- Lägg till en lättviktig sanity-log i `[get_bookings]` som loggar `derivedFromTeamCalendarCount` vs `bsaOnlyCount` för felsökning.

**Migration / utrullning**
- Edge-funktionsändring deployas automatiskt.
- Mobilen behöver inte ny build (bara react-query invalidering — sker via realtime-subscriptionen).
