## Mål

Slå ihop 2+ projekt (små/medel/befintliga stora) till ETT nytt stort projekt. All data ska följa med. Två ingångar: projektsidan och högerklick i personalkalendern.

## Användarflöde

**Från projektsidan** (medel- eller stort projekt)
1. "..." → ny rad **"Konsolidera med andra projekt..."**
2. Dialog öppnas med det aktuella projektet förvalt + sökbar lista över övriga projekt (medel + små + andra stora, exkl. avbokade/raderade).
3. Multi-select, skriv namn för det nya stora projektet (förifyllt med första projektets namn), klicka **Skapa**.
4. Vid succé: navigera till `/large-project/<nya id>`.

**Från personalkalendern** (`/calendar`)
1. Högerklick på ett event → ny ContextMenu med bl.a. **"Konsolidera till stort projekt..."** (övriga befintliga åtgärder från `QuickTimeEditPopover` finns kvar via vänsterklick).
2. Eventet matchas mot sitt projekt (medel/litet/stort) via `booking.assigned_project_id` eller `large_project_bookings`. Saknas projekt-koppling visas info-toast.
3. Samma dialog öppnas, samma flöde.

## Datasammanslagning (server-side, transaktionellt)

Ny edge function **`consolidate-projects`** (verify_jwt = false, validerar JWT i kod, org-isolering enligt RESTRICTIVE RLS-policy):

Input:
```ts
{
  name: string,                      // användarvalt
  sources: Array<{
    type: 'small' | 'medium' | 'large',
    id: string,
  }>
}
```

Steg:
1. Slå upp alla källor + deras org. Avbryt om de tillhör olika orgs eller om någon är raderad.
2. Samla bokningar:
   - `small` → `jobs.booking_id` (1 st)
   - `medium` → `projects.booking_id` (1 st)
   - `large` → `large_project_bookings.booking_id` (n st)
   - Dedupera.
3. Skapa nytt `large_projects` med:
   - `name` = input
   - `description` = första icke-tomma `description` bland källorna
   - `internalnotes` = sammansatt med rubrik per källa, t.ex. `\n\n--- Från "Projekt A" ---\n<text>`
   - `project_leader` = första icke-null
   - `delivery_*` (adress, lat, lng, radius, geofence) = första källan som har giltiga koordinater
   - `start_date / event_date / end_date` = unionen av datum från källorna (befintlig pattern är arrays)
4. Flytta länkat material (källa-id → nytt large_project_id):
   - `project_files` → `large_project_files`
   - `project_tasks` → `large_project_tasks` (mappar fältnamn; bibehåller skapare/förfallodatum)
   - `large_project_*` (files/tasks/budget/cost_lines/purchases/staff/team_assignments/gantt_steps) från ev. stora källor → re-pekas till nya id:t
5. `large_project_bookings`-rader för varje booking (eller upserta om de redan låg i en stor källa).
6. Uppdatera `bookings.assigned_project_id`/`assigned_project_name` till det nya stora projektet.
7. Soft-delete källorna (samma pattern som `cancelProject`/`deleteLargeProject`):
   - `projects.deleted_at = now()`
   - `large_projects.deleted_at = now()` (om kolumnen finns; annars hård delete via befintlig service-logik)
   - `jobs` → motsvarande befintliga delete.
8. Logga i `project_audit_log` per källa: `action='consolidated_into'`, `target_large_project_id=<nytt id>`.
9. Returnera `{ largeProjectId }`.

Allt körs med service-role inom edge function. Vid fel: rollback genom att radera nyskapad large_project + relaterade rader (kompensering, eftersom Postgres saknar transaktion över flera REST-anrop).

## Frontend

**Nya filer**
- `src/services/projectConsolidationService.ts` — `consolidateProjects({ name, sources })` som anropar edge function.
- `src/components/project/ConsolidateProjectsDialog.tsx` — sökbar Command-lista med kryssrutor, namnfält, validering (≥2 källor), submit.
- `src/components/Calendar/CalendarEventContextMenu.tsx` — wrapper som ger högerklick-meny på events i personalkalendern.

**Ändrade filer**
- `src/components/project/ProjectActionMenu.tsx` — ny rad "Konsolidera...".
- `src/pages/project/ProjectLayout.tsx` + `LargeProjectLayout.tsx` — skickar in `onConsolidate` som öppnar dialogen med aktuellt projekt förvalt.
- `src/components/Calendar/CustomEvent.tsx` (eller motsvarande wrapper i `CustomCalendar`) — wrappa i `ContextMenu` med "Konsolidera...".
- `src/pages/CalendarView.tsx` (eller där CustomCalendar mountas i `/calendar`) — host för dialogen + state.

Efter succé: invalidera `['projects']`, `['large-projects']`, `['bookings-without-project']`, `['planner-events']` och navigera till nya stora projektet.

## Begränsningar / antaganden

- Tidsrapporter, GPS-pings och övriga `*_id`-pekare på `bookings.id` påverkas inte (de följer med bokningen som är kvar).
- Stora projekt som källor: deras egna `large_project_team_assignments` kopieras till nya id:t (planeringsenhet enligt minnet).
- Om en bokning redan ligger i ett stort projekt som INTE är källa → fail med tydligt felmeddelande (kräver att användaren först tar bort den).
- Avbokade/raderade projekt visas inte i sökbara listan.
- Namn obligatoriskt, min 2 källor.

## Migration

Inget nytt schema. Reuse av befintliga tabeller. (Om `large_projects.deleted_at` saknas lägger jag till den i en mini-migration.)
