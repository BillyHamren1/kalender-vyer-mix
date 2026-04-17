
## Mål
Bygg om "Skapa ny packning"-dialogen till **"Skapa lageruppgift"** som skapar uppgifter på ett tillsvidare-projekt **"Lager"** (default i varje organisation). Här loggas internt arbete: städa, tvätta, inköp, planering m.m. — och tid kan registreras mot dessa uppgifter.

## Bakgrund (verifierat)

- Det finns redan ett koncept för **interna projekt** i `organization_locations` med `show_as_project = true` och en sync-trigger (`sync_location_project_bsa`) som skapar BSA-rader med syntetiskt `booking_id = 'location-{id}'`.
- Det finns redan ett **default warehouse-projekt-system** (`warehouse_projects` + `warehouse_project_tasks`) med kalenderintegration, så vi har en passande hemvist.

## Plan

### Steg 1 — Default "Lager"-projekt per organisation

**Migration:**
- Säkerställ att varje `organizations`-rad har **ett** `warehouse_projects` med:
  - `name = 'Lager'`
  - `project_number = 'LAGER'` (fast, inte sekvens)
  - `status = 'in_progress'`
  - `start_date = NULL`, `end_date = NULL` (tillsvidare)
  - Ny kolumn `is_internal boolean default false` → `true` för Lager
- **Backfill** för alla orgs som saknar det.
- **Trigger** på `organizations` AFTER INSERT som auto-skapar Lager-projektet.
- **Skydd** i `deleteWarehouseProject`: blockera om `is_internal = true`.

### Steg 2 — Ny dialog "Skapa lageruppgift"

Ersätter nuvarande `CreatePackingDialog` (knappen på `/warehouse`).

**Fält:**
- Titel (krav) — t.ex. "Städa lagret"
- Beskrivning (valfri)
- Ansvarig (staff dropdown, valfri)
- Startdatum / Slutdatum (valfria — om tomma = "när som helst")
- Kategori (valfri enum: `cleaning`, `maintenance`, `purchase`, `planning`, `other`)

**Vid Skapa:**
- Skapar rad i `warehouse_project_tasks` länkad till org:s Lager-projekt
- Visas i lagerkalendern (om datum satta) som ny event-kategori "Internt" (neutral grå)
- Annars listas i Lager-projektets vy under "Pågående uppgifter"

### Steg 3 — Tidregistrering

Mest flexibel approach:
- Personal kan välja **uppgiften** i tidrapportering (granulärt, bra statistik)
- Eller välja **"Lager"** generellt om de inte vill specificera
- Mobil tidapp: lägg till "Lager"-projekt som alltid synligt val (oavsett datum, eftersom det är tillsvidare)

### Steg 4 — Lager-projektets vy

I `WarehouseProjectDetail` för Lager-projektet:
- Egen header som markerar att det är **internt/tillsvidare**
- Ta bort "Packningar"-fliken (irrelevant)
- "Uppgifter"-fliken visar interna tasks med kategori-badges
- "Översikt" visar summerad nedlagd tid per uppgift och kategori

### Steg 5 — Kalender

- Ny event-typ `internal` i `WarehouseEventType` (utöver `packing` + `return`)
- Färg: neutral grå
- Resurskolumn: kan dela "Packning"-kolumnen eller få egen "Internt"

## Filer som påverkas

**Migration:**
- Ny `is_internal`-kolumn på `warehouse_projects`
- Backfill + trigger för Lager-projekt per org
- Ev. `category`-kolumn på `warehouse_project_tasks`

**Kod:**
- `src/components/warehouse/CreatePackingDialog.tsx` → byggs om till `CreateInternalTaskDialog.tsx`
- `src/services/warehouseProjectService.ts` → `createInternalTask()`, `getInternalWarehouseProject()`, skydd i delete
- `src/services/warehouseCalendarService.ts` → ny event-typ `internal`
- `src/pages/WarehouseProjectDetail.tsx` → specialvy för internt projekt
- `src/types/warehouseProject.ts` → typer för category och `is_internal`
- Tidrapporterings-UI (mobil + admin) → Lager-projekt som alltid valbart

## Säkerhet
- Lager-projektet kan inte raderas
- RLS följer befintlig org-isolering på `warehouse_projects`
- Migration är idempotent (skapar bara om saknas)

## Inga risker
- Backfill skapar bara nya rader, rör inte befintliga packningar
- Befintlig "Skapa packning"-knapp ersätts — manuella packningar skapas numera bara via inkorgen från Planning (enligt tidigare plan)
