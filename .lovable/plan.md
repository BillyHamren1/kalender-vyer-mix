

## Plan: Lager som permanent projekt med tidregistrering

### Sammanfattning
Skapa ett permanent "Lager"-projekt i projektlistan som visar tid registrerad via lagerplatsen. Lager ska alltid synas i tidappen (fungerar redan via "Fasta platser") och ska INTE synas i personalkalendern.

### Nuläge
- `organization_locations` har redan en "Lager"-plats (id: `0b9d94df-...`)
- Tidappen visar redan "Lager" under "Fasta platser" via `useGeofencing` → `orgLocations`
- Det finns inget projekt kopplat till Lager i `projects`-tabellen
- Tidsloggar från Lager sparas i `location_time_entries`, inte i `time_reports`

### Ändringar

#### 1. Databasändring: Lägg till `is_internal`-kolumn på `projects`
Ny kolumn `is_internal BOOLEAN DEFAULT false` — markerar att projektet inte ska synkas till kalendern eller tas bort av sync-logik. Lagerprojektet ska inte kunna raderas.

#### 2. Skapa Lager-projektet automatiskt
En migration som skapar ett permanent "Lager"-projekt per organisation (med `is_internal = true`, `status = 'active'`, `client = 'Intern'`). Använder befintlig `organization_id` från `organization_locations`.

#### 3. Projektlistan: Visa Lager bland projekten
**`src/components/project/UnifiedProjectList.tsx`**: Interna projekt visas i listan med en distinkt markering (t.ex. "Intern"-badge). De ska INTE filtreras bort av `all_active`.

#### 4. Projektdetaljsidan: Visa lagertid
**`src/pages/project/ProjectDetail.tsx`** (eller motsvarande): För interna projekt, hämta tid från `location_time_entries` istället för `time_reports` och visa det i en enkel tidöversikt.

#### 5. Blockera kalendersynk för interna projekt
**`src/services/calendarSyncService.ts`** (eller motsvarande): Kontrollera `is_internal` och hoppa över kalendersynk. Lagerprojektet ska aldrig generera kalenderhändelser i personalkalendern.

#### 6. Skydda mot radering
Interna projekt ska inte kunna tas bort via UI — göm "Ta bort"-knappen för `is_internal = true`.

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| Migration (ny) | `ALTER TABLE projects ADD COLUMN is_internal BOOLEAN DEFAULT false`, INSERT Lager-projekt |
| `src/components/project/UnifiedProjectList.tsx` | Visa intern-badge, behåll i `all_active` |
| `src/pages/project/ProjectDetail.tsx` | Hämta `location_time_entries` för interna projekt |
| `src/services/projectService.ts` | Skydda mot radering av `is_internal`-projekt |
| Kalendersynk-logik | Hoppa över `is_internal`-projekt |

### Vad som INTE ändras
- Tidappen (Lager syns redan som fast plats)
- Edge functions (ingen sync-påverkan)
- Personalkalendern (Lager synkas inte dit)

