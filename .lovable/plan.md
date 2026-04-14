

## Plan: Projekttilldelning för stora projekt

### Problemet
Idag tilldelas personal till **enskilda bokningar** via kalendern (BSA-tabellen). När någon ska jobba med ett stort projekt som "Swedish Game Fair" måste varje delbokning schemaläggas separat. Nya bokningar som läggs till i projektet efteråt når aldrig den tilldelade personalen automatiskt.

### Lösning: Ny tabell `large_project_staff`

Skapa en ny koppling mellan personal och stora projekt. När en bokning läggs till i ett stort projekt, synkas automatiskt BSA-rader för all projektansluten personal.

### Databasändringar

**1. Ny tabell `large_project_staff`**

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid PK | |
| large_project_id | uuid FK → large_projects | Projektet |
| staff_id | text | Personal-ID |
| role | text | Roll (field, team_leader etc.) |
| created_at | timestamptz | |
| organization_id | text | Org-isolering |

**2. Trigger: auto-synk vid ny bokning i projektet**

När en rad läggs till i `large_project_bookings`:
- Hämta alla staff från `large_project_staff` för det projektet
- Hämta bokningens datum (rigg/event/nedmontering)
- Skapa BSA-rader för varje staff + datum med `team_id = 'project'`

**3. Trigger: auto-synk vid ny staff i projektet**

När en rad läggs till i `large_project_staff`:
- Hämta alla bokningar i projektet via `large_project_bookings`
- Skapa BSA-rader för alla bokningars datum

### Frontend-ändringar

**4. UI i stora projekt-vyn — "Projektteam"-sektion**

I etableringsfliken eller en ny flik, visa vilken personal som är kopplad till hela projektet (inte per bokning). Lägg till/ta bort personal här.

| Fil | Ändring |
|-----|---------|
| `src/services/largeProjectService.ts` | CRUD för `large_project_staff` |
| `src/components/large-project/LargeProjectTeam.tsx` | Ny komponent: visa/hantera projektteam |
| Etablerings-/översiktsflik | Integrera teamkomponenten |

**5. Mobile API — gruppera i `handleGetBookings`**

Berika bokningar som tillhör ett stort projekt med `large_project_id` och `large_project_name` så mobilappen kan gruppera dem visuellt (som i tidigare plan).

### Flöde efter implementation

```text
1. Admin lägger till Billy i "Swedish Game Fair" projektteam
2. Trigger skapar BSA-rader för alla 28 delbokningar
3. Ny bokning #29 läggs till i projektet
4. Trigger skapar automatiskt BSA-rad för Billy + bokning #29
5. Billy ser alla 29 bokningar grupperade under "Swedish Game Fair" i appen
```

### Filer som ändras/skapas

| Fil | Typ |
|-----|-----|
| Migration SQL | Ny tabell + triggers |
| `src/services/largeProjectService.ts` | Staff-CRUD |
| `src/components/large-project/LargeProjectTeam.tsx` | Ny komponent |
| `supabase/functions/mobile-app-api/index.ts` | Berika med projektnamn |
| `src/pages/mobile/MobileJobs.tsx` | Grupperad visning |
| `src/services/mobileApiService.ts` | Utökad typ |

