## Status

- **Personalen är INTE borta från databasen.** `staff_assignments` har t.ex. 22 rader för Sun 7 juni 2026 (team-1: 2, team-2: 1, team-3: 9, team-4: 10) och 5 rader för Sat 6 (team-1: 3, team-2: 2). Alla pekar på aktiv `staff_members.is_active=true` och rätt `organization_id`.
- **RLS är intakt.** En enda PERMISSIVE policy `org_filter_staff_assignments` (`organization_id = get_user_organization_id(auth.uid())`). Inget restrictive på vägen.
- **Inget i senaste migrationen rör staff.** Senaste migrationen (2026-06-01 13:44) skapade `team_vehicle_assignments` — den lägger bara till, rör inte `staff_assignments`.

Slutsats: **Detta är frontend-render eller cache, inte data som "skrivits över".**

## Misstänkta orsaker (i prioritetsordning)

1. **React Query-cachen `['staff-assignments-all']` har en gammal eller tom payload.** `useUnifiedStaffOperations` har `staleTime: Infinity` + `gcTime: Infinity` och invalidate sker bara via realtime. Om ett realtime-event kom in med `event: '*'` och något payload-fel inträffade, kan cachen ha hamnat tom utan att vi vet.
2. **Header-cellens nya `team-vehicle-line` (lagt till i förra uppdraget) ändrar header-radens höjd och knuffar staff-raden (row 3) under viewport eller bakom kort-kant.** Header är `grid-template-rows: auto auto auto` — om CSS skär av kortet vertikalt kan rad 3 döljas.
3. **Realtime-prenumeranten på `unified-staff-assignments-rt` skickar 401/permission denied** efter senaste deployment och invaliderar in i tom payload. Visste inte att vi behövde GRANT-policy för `staff_availability` nyligen — kan ha gått sönder.
4. **`useTeamVehiclesForDay` kraschar inuti TimeGrid** så hela TimeGrid renderar fallback utan staff. Hooken läser `team_vehicle_assignments` med `.eq('date', isoDate)` — om RLS-funktionen `has_planning_access(auth.uid())` returnerar false för aktuell user i den orgen blir det error i hooken men inte cascading. Värt att kolla.

## Plan

**Steg 1 — bekräfta orsaken med användaren (ingen kodändring):**

Be användaren öppna devtools i preview och rapportera:
- Hard reload (Cmd+Shift+R). Kommer personalen tillbaka?
- Console: finns det `[useTeamVehiclesForDay]` eller `staff_assignments`-relaterade error/warnings?
- Network: hitta supabase-anropet `staff_assignments?select=...` — returnerar det 0 rader, 403, eller alla rader?

**Steg 2 — beroende på svar:**

- **Om hard reload löser det** → cache-bug i `useUnifiedStaffOperations`. Lägg till `refetchOnWindowFocus`/`refetchOnMount` eller sänk `staleTime` till några minuter.
- **Om network visar 0 rader** → RLS/auth-issue. Verifiera `get_user_organization_id(auth.uid())` returnerar rätt org för inloggad användare just nu.
- **Om network visar rader men UI tomt** → CSS-regression från `team-vehicle-line`. Inspektera `.staff-assignment-header-row` höjd, kolla om `.team-header-cell` flex pushar bort row 3.
- **Om console-fel från `useTeamVehiclesForDay`** → wrap'a hooken så ett fel inte kan ta ner TimeGrid (defensiv try/catch + tom Map fallback).

**Steg 3 — fixa minimalt:**

Inga skrivningar mot DB. Endast frontend-fix på den faktiska roten. **Ingen rensning/dedup av staff_assignments** — datan är korrekt och får inte röras.

## Vad jag INTE gör

- Ingen DELETE/UPDATE mot `staff_assignments`.
- Inga nya migrationer.
- Ingen ny "städ"-funktion.
- Inga ändringar i fördelnings-/timer-/lönlogik.

## Fråga till dig

Innan jag rör en rad kod: kan du
1. göra **hard reload** (Cmd+Shift+R) i kalendervyn och säga om personalen kommer tillbaka, och
2. öppna devtools → Network, filter "staff_assignments", och säga ungefär hur många rader svaret innehåller (eller om det är 403/401)?

Då vet jag direkt om det är cache, RLS eller CSS, och kan fixa exakt det utan att gissa.
