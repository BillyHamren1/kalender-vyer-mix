
## Mål
Lagerprojekt blir den nya **paraply-entiteten** för lagerverksamhet — exakt som Projekt är paraplyet på Planning-sidan. Packningar (`packing_projects`) skapas inte längre automatiskt vid bokningsbekräftelse, utan **manuellt inifrån lagerprojektet** (precis som moment/tasks skapas inuti ett projekt).

## Ny arkitektur

```text
Planning sida                    Lager sida
─────────────                    ──────────
projects / large_projects   →    warehouse_projects (NY paraply-entitet)
  ├─ tasks (moment)              ├─ packings (packing_projects, manuellt skapade)
  ├─ products                    ├─ free tasks (t.ex. "Tvätta dukar")
  └─ team                        └─ team / notes / files
```

### Flöde

1. **Projekt skapas på Planning** → notis till lager (via `warehouse_project_inbox`).
2. **Lageranvändaren klickar "Skapa lagerprojekt"** → `warehouse_projects`-rad skapas med projektnummer `Lager-{ursprungligt nr}`.
3. **Inuti lagerprojektet** kan användaren skapa moment:
   - **Packning** (knyts till en bokning som ingår i källprojektet — skapar `packing_projects`-rad med `warehouse_project_id` länk)
   - **Fritt moment** (t.ex. "Tvätta dukar" — egen task-tabell, valfria datum, hamnar i lagerkalendern)

## Datamodell

### Ny tabell: `warehouse_projects`
```sql
CREATE TABLE warehouse_projects (
  id uuid PK,
  organization_id uuid NOT NULL,
  project_number text NOT NULL UNIQUE,    -- "Lager-260417-Projekt01"
  name text NOT NULL,
  source_project_id uuid,                  -- FK -> projects.id (nullable)
  source_large_project_id uuid,            -- FK -> large_projects.id (nullable)
  source_project_number text,              -- snapshot för stabil numrering
  status text DEFAULT 'planning',          -- planning | in_progress | completed | cancelled
  start_date date,
  end_date date,
  manager_id uuid,
  notes text,
  created_at, updated_at, created_by
);
```

### Ny tabell: `warehouse_project_inbox`
Triage-inkorg — fylls automatiskt när projekt skapas i Planning.
```sql
CREATE TABLE warehouse_project_inbox (
  id uuid PK,
  organization_id uuid,
  source_type text,                        -- 'project' | 'large_project'
  source_id uuid,
  source_project_number text,
  client_name text,
  event_date date,
  status text DEFAULT 'new',               -- new | converted | dismissed
  warehouse_project_id uuid,
  created_at, processed_at
);
```

### Ny tabell: `warehouse_project_tasks`
Fria moment inuti ett lagerprojekt.
```sql
CREATE TABLE warehouse_project_tasks (
  id uuid PK,
  warehouse_project_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  title text NOT NULL,                     -- "Tvätta dukar"
  description text,
  start_date date,
  end_date date,
  assigned_to uuid,
  status text DEFAULT 'planning',
  sort_order int DEFAULT 0,
  created_at, updated_at
);
```

### Ändringar i `packing_projects`
- Ny kolumn: `warehouse_project_id uuid` (FK → `warehouse_projects.id`, nullable för bakåtkompatibilitet).
- **Trigger `sync_packing_on_booking_change` modifieras**: Tar bort `INSERT`-blocket i slutet (ingen automatisk skapelse vid CONFIRMED). Behåller UPDATE-logiken för befintliga packlistor (synk av namn/datum/status).

## Triggers

1. **`projects` AFTER INSERT** → infoga rad i `warehouse_project_inbox` (status `new`).
2. **`large_projects` AFTER INSERT** → infoga rad i `warehouse_project_inbox`.
3. **`warehouse_projects` BEFORE INSERT** → generera `project_number`:
   - Om `source_project_number` finns → `Lager-{source_project_number}`
   - Annars → `Lager-YYMMDD-FrittNN`
4. **`warehouse_project_tasks` AFTER INSERT/UPDATE** → spegla till `warehouse_calendar_events` (för lagerkalendern).

## UI-ändringar

### Nya filer
- `src/types/warehouseProject.ts`
- `src/services/warehouseProjectService.ts`
- `src/hooks/useWarehouseProjectInboxRealtime.ts`
- `src/components/warehouse/WarehouseProjectInbox.tsx` — highlightad triage-lista överst
- `src/pages/WarehouseProjectDetail.tsx` — detaljsida (flikar: Översikt, Packningar, Moment, Team, Filer)
- `src/components/warehouse/CreateWarehousePackingDialog.tsx` — välj bokning från källprojekt
- `src/components/warehouse/CreateWarehouseTaskDialog.tsx` — fritt moment

### Ändrade filer
- `src/pages/PackingManagement.tsx` — visar `<WarehouseProjectInbox />` överst + lista över `warehouse_projects`.
- `src/pages/WarehouseDashboard.tsx` — knapp "Skapa lagerprojekt" + badge med antal nya i inbox.
- `src/components/packing/CreatePackingWizard.tsx` — utfasas (ersätts av flödet ovan), eller behålls som "skapa fristående packning" för edge-case.
- Routes: `/warehouse/projects/:id` → `WarehouseProjectDetail`.

### Borttaget beteende
- Auto-skapande av `packing_projects` vid `CONFIRMED`-bokning tas bort.
- `IncomingPackingInbox` (gamla bokning-inkorgen) ersätts av `WarehouseProjectInbox`.

## Migrationsstrategi för befintlig data

- Befintliga `packing_projects` lämnas orörda (`warehouse_project_id = NULL`). De fortsätter fungera fristående.
- **Ingen backfill** av `warehouse_project_inbox` — bara framtida projekt notifierar (annars översvämmas vyn).
- Befintliga `large_projects` med konsoliderade packningar lämnas orörda.

## Frågor att bekräfta

1. **Inkorg-källa**: Ska BÅDE `projects` (medelstora) OCH `large_projects` skapa inbox-rader? Förslag: **Ja**.
2. **Befintliga packningar**: Ska gamla auto-skapade packningar (utan `warehouse_project_id`) visas i lager-UI? Förslag: **Ja**, i en separat sektion "Fristående packningar (legacy)".
3. **`IncomingPackingInbox`** (gamla bokning-inkorgen): Behåll eller ta bort? Förslag: **Ta bort** — ersätts helt av nya flödet.

## Filer som ändras (sammanfattning)

**Migration**: 1 ny migration med 3 nya tabeller + 4 triggers + RLS + realtime publication.

**Nya komponenter**: 6 filer (types, service, hook, 3 UI-komponenter).

**Ändrade**: `PackingManagement.tsx`, `WarehouseDashboard.tsx`, route-tabell, `sync_packing_on_booking_change`-funktion.
