## Mål

I vänsterpanelens dagsrader (vecka för vecka) ska:
1. **Boende** (organization_locations med `isPrivateResidence=true`) inte räknas eller visas.
2. Varje dag visa **Starttid → Sluttid – Arbetstid**, där:
   - Starttid = tiden personen anlände till jobbet (första ping som ligger **utanför** ett Boende-geofence).
   - Sluttid = tiden personen lämnade jobbet (sista ping som ligger **utanför** Boende).
   - Arbetstid = Sluttid − Starttid.

Inga nya tolkningsregler – fortfarande bara råpings + befintliga geofences via `buildExactGeofenceVisits`. Boende filtreras bara bort.

## Ändringar

### `src/hooks/staff/useStaffGpsWeekSummary.ts`
- Behåll `useOrganizationLocations` men markera Boende-platser: bygg en `Set<string>` med `loc.id` för platser där `isPrivateResidence === true`.
- I `geofences`-arrayen: tagga eller hoppa över. Vi **behåller** dem i geofence-listan så vi kan identifiera vilka pings som ligger i Boende, men markerar dem som `isPrivate` via en sido-Set på `GeofenceSite.id` (t.ex. `loc:<id>`).
- Per dag:
  - Kör `buildExactGeofenceVisits` som idag.
  - Dela upp visits i `workVisits` (knownSite ej privat) och `privateVisits`.
  - Bygg `nonPrivatePings`: pings som **inte** ligger inom någon `privateVisit` (filtrera på tid-intervall `[visit.start, visit.end]`).
  - `firstIso` = första ping i `nonPrivatePings` (fallback: null om endast Boende-pings).
  - `lastIso` = sista ping i `nonPrivatePings`.
  - `durationMin` = `(lastIso − firstIso)` i minuter, 0 om saknas.
  - `placeNames` byggs nu **endast** från `workVisits` (Boende dyker aldrig upp).
  - `visits`-fältet i summary returneras också utan privata (så ev. framtida UI inte råkar visa Boende).

### `src/components/staff/StaffGpsDayRow.tsx`
- Etiketterna förtydligas:
  - Översta raden visar fortsatt veckodag + duration som "Arbetstid" (samma plats, samma formattering).
  - Andra raden: `Start HH:MM → Slut HH:MM` (oförändrad layout).
  - Tredje raden: platser (utan Boende, redan filtrerat i hooket).
- När `firstIso/lastIso` är null men det finns pings (bara Boende-pings) visa "Endast hemma" i stället för "Ingen GPS-data".

### `StaffGpsWeekPanel.tsx`
- Footer-texten uppdateras: "Start = första GPS utanför Boende, Slut = sista. Boende räknas inte som arbetstid."

## Vad ändras inte

- Kartan, `GeofenceVisitsTable`, `PingTimelineTable` i högerkolumnen lämnas helt orörda – Boende får fortsatt visas där (det är kartans rådata).
- Inga DB-anrop, inga edge functions, ingen ny tolkningslogik utöver "Boende = privat".
- Ingen 16h-cap eller annan begränsning.
