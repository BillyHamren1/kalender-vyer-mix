## Mål

Ersätt `Skapa nytt projekt`-dialogen med en `Skapa to do`-dialog som skapar fristående uppgifter (upphämtning / leverans / annat / valfri sparad typ), valfritt kopplade till en bokning, som hamnar i en egen ORANGE sektion under "Att planera" och kan dras/placeras i personalkalendern.

To-dos är en helt egen entitet — inte projekt, inte tasks. De använder `calendar_events` för planeringen (orange färg), precis som projekt gör.

## Datamodell (migration)

### Ny tabell `todo_types`
- `id`, `organization_id`, `key` (slug), `label`, `is_builtin` (bool), `created_by`, `created_at`
- Seed per org: `pickup` "Upphämtning", `delivery` "Leverans", `other` "Annat" (is_builtin=true, kan ej raderas).
- Användare kan lägga till nya typer från dropdownen → sparas globalt per org.
- RLS: läs/skriv för medlemmar i samma org.

### Ny tabell `todos`
- `id`, `organization_id`, `type_id` (FK → todo_types), `title`, `booking_id` (nullable FK), `large_project_id` (nullable, för framtid)
- Adress: `address`, `city`, `postal_code`, `latitude`, `longitude`
- Kontakt: `contact_name`, `contact_phone`, `contact_email`, `client`
- Datum/tid: `scheduled_date`, `start_time`, `end_time` (nullable — sätts vid placering i kalender)
- `planning_status` ('needs_planning' | 'planned' | 'completed' | 'cancelled') default 'needs_planning'
- `internal_notes`, `created_by`, `created_at`, `updated_at`
- RLS: org-isolerat (mönster från `projects`).

### `calendar_events` — utökning
- Lägg till `todo_id uuid` (nullable, FK → todos, ON DELETE CASCADE) + index.
- Befintliga `category`/typ-kolumner behålls; to-do-events får t.ex. `category='todo'` så kalendern kan färga ORANGE.
- När `calendar_events.todo_id` finns → flippa `todos.planning_status` till 'planned' via trigger; när alla events tas bort → tillbaka till 'needs_planning'.

## Backend

- **Inga edge functions** behövs (allt via supabase-klienten + RLS). Skapande, ändring och kalenderplacering går direkt mot tabellerna.
- Reuse befintlig `calendar_events`-pipeline för dra-och-släpp i personalkalendern.

## Frontend

### Ny dialog `CreateTodoWizard.tsx`
Ersätter `CreateProjectWizard` på alla call-sites (`ProjectManagement.tsx`, `PlanningDashboard.tsx`).

Fält i dialogen (i denna ordning):
1. **Typ** — Combobox med org:ens `todo_types`. "+ Skapa ny typ…" sista raden öppnar inline-input som sparar ny typ direkt och väljer den.
2. **Koppla till bokning** (valfritt) — samma dropdown som idag.
3. **Titel** — autogenereras från typ + kund/datum, redigerbart.
4. **Ansvarig** (project_leader-motsvarighet, valfritt).
5. **Kund & kontakt** (kund, kontaktperson, telefon, e-post).
6. **Adress** med autocomplete (samma `AddressAutocomplete`).
7. **Datum + tid** — ETT datum + start/sluttid (inte rig/event/rigdown). Tomt → läggs i "Att planera".
8. **Interna anteckningar**.

Spar-flöde:
- Insert i `todos` med insamlade fält.
- Om datum + tider angivna → skapa `calendar_events`-rad direkt (placerad), annars stannar den i "Att planera".
- Toast: "To do skapad".

### Egen sektion i "Att planera"
- Ny komponent `UnplannedTodosBanner.tsx` under `UnplannedProjectsBanner`, identisk struktur men med orange tema (`bg-orange-50`, `text-orange-700`, `border-orange-300` via tokens om finns; annars Tailwind orange).
- Klick → öppnar liten "Planera to do"-sheet (`TodoPlanningSheet.tsx`) med datum/tid + team/resurs → skapar `calendar_events`.

### Hook `useUnplannedTodos.ts`
Spegel av `useUnplannedProjects` mot `todos` + realtime.

### Kalender-färg ORANGE
- Plats: där `calendar_events` renderas i personalkalendern (CustomMonthGrid + relaterade event-pills).
- Logik: om `event.category === 'todo'` (eller `event.todo_id` finns) → orange klass.
- Lägg `--todo: 28 95% 53%` (HSL orange) i `index.css` och `todo` token i `tailwind.config.ts`. Använd semantiskt, inga råa färger.

## Testning

- `src/test/createTodo.contract.test.ts` — insert i `todos`, default planning_status='needs_planning', RLS org-isolering, ny typ skapas och dyker upp.
- `src/test/todoCalendarPlacement.contract.test.ts` — placering skapar calendar_events med todo_id + category='todo', flippar planning_status='planned'; borttagning återställer.
- Snapshot/render-test för `UnplannedTodosBanner` (orange theme).
- Kör hela testsviten med `bash scripts/test-time-reporting.sh` påverkas ej; nya tester via `bunx vitest run`.

## Filer

**Nya**
- `supabase/migrations/<ts>_create_todos.sql` (todo_types + todos + calendar_events.todo_id + RLS + trigger + seed)
- `src/components/todo/CreateTodoWizard.tsx`
- `src/components/todo/TodoPlanningSheet.tsx`
- `src/components/Calendar/UnplannedTodosBanner.tsx`
- `src/hooks/useUnplannedTodos.ts`
- `src/hooks/useTodoTypes.ts`
- `src/test/createTodo.contract.test.ts`
- `src/test/todoCalendarPlacement.contract.test.ts`

**Ändrade**
- `src/pages/ProjectManagement.tsx` — byt CreateProjectWizard → CreateTodoWizard, knapp-text "Skapa to do".
- `src/pages/PlanningDashboard.tsx` — samma byte.
- `src/components/Calendar/UnplannedProjectsBanner.tsx` — montera `UnplannedTodosBanner` under projekt-sektionen.
- `src/components/Calendar/custom/CustomMonthGrid.tsx` (+ event-pill-komponenter) — orange för `category='todo'`.
- `src/index.css` + `tailwind.config.ts` — `--todo` HSL token.

**Borttaget**
- `src/components/project/CreateProjectWizard.tsx` — raderas (inga andra call-sites efter bytet).

## Tekniska anteckningar

- `category='todo'` följer redan befintligt schema-fält i `calendar_events` (om det inte finns: lägg till). Verifieras innan migration skrivs.
- Multi-tenant: `organization_id` sätts från `useCurrentOrg()` på alla inserts; RLS USING/WITH CHECK på `organization_id`.
- Ingen koppling till External Booking system — to-dos är 100% lokala. Bokningskopplingen är bara en referens (FK) och stör inte import-bookings.
- Memory-uppdatering efter implementation: lägg till `mem://features/planning/todos-v1` och `mem://constraints/todo-color-orange` i index.
