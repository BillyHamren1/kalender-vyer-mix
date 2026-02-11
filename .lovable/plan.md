

# Mina projekt -- personlig projektsamlingssida

## Vad vi bygger

En ny sida "Mina projekt" som ger den inloggade anvandaren en samlad oversikt over alla projekt (sma, medelstora och stora) dar hen ar involverad -- antingen som projektledare eller med tilldelade uppgifter. Sidan ger snabb kontroll over status, deadlines och uppgifter utan att behova klicka sig igenom alla projektlistor.

## Hur vi kopplar inloggad anvandare till projekt

Systemet har foljande koppling:
1. Inloggad anvandare har ett `user_id` (Supabase Auth)
2. Tabellen `profiles` kopplar `user_id` till `email`
3. Tabellen `staff_members` har samma `email` -- det ger ett `staff_id`
4. Projekt har `project_leader` = staff_id
5. Uppgifter har `assigned_to` = staff_id

Vi skapar en hook som slar upp den inloggade anvandarens staff_id via email-matchning.

## Sidans uppbyggnad

Sidan visar:
- **Snabbstatistik** -- Antal aktiva projekt, oavslutade uppgifter, forsenade uppgifter
- **Projektkort** -- Ett kort per projekt (bade vanliga och stora) med:
  - Projektnamn och kund
  - Status (Planering/Pagaende etc.)
  - Eventdatum
  - Uppgiftsframgang (X/Y klara, progress bar)
  - Nastakommande deadline
  - Din roll (Projektledare eller Tilldelad uppgift)
- **Filtrera/sortera** -- Pa status, projekttyp, och sortering (datum, namn)

## Teknisk plan

### 1. Ny hook: `useCurrentStaffId`
Skapar en liten hook som:
- Hamtar `user.email` fran `useAuth()`
- Slar upp matchande `staff_members.id` via email
- Returnerar `{ staffId, isLoading }`

**Fil:** `src/hooks/useCurrentStaffId.ts`

### 2. Ny service-funktion: `fetchMyProjects`
Hamtar alla projekt dar anvandaren ar inblandad:
- Vanliga projekt: dar `project_leader = staffId` ELLER dar det finns `project_tasks` med `assigned_to = staffId`
- Stora projekt: dar `project_leader = staffId` ELLER dar det finns `large_project_tasks` med `assigned_to = staffId`
- Inkluderar booking-data (kund, eventdatum) och uppgiftsstatistik

**Fil:** `src/services/myProjectsService.ts`

### 3. Ny sida: `MyProjects`
Renderar en samlad vy med:
- Header med ikon och titel "Mina projekt"
- Statistik-rad (aktiva projekt, oppna uppgifter, forsenade)
- Filterbar (status, projekttyp)
- Projektkortlista -- varje kort ar klickbart och navigerar till ratt projektdetaljsida (`/project/:id` eller `/large-project/:id`)
- Tom-vy om inga projekt ar kopplade

**Fil:** `src/pages/MyProjects.tsx`

### 4. Route och navigation
- Ny route: `/my-projects`
- Lagg till i sidomenyn (Sidebar3D) som forsta alternativ under "Dashboard", med ikon `Briefcase` och titel "Mina projekt"

**Filer:** `src/App.tsx`, `src/components/Sidebar3D.tsx`

### 5. Designregler som foljs
- `bg-card`, `shadow-sm`, `rounded-lg` for kort
- `border-l-[3px] border-l-primary` for vansterteal-kant
- `text-muted-foreground` for sekundar text
- `bg-primary text-primary-foreground` for badges
- Alla texter pa svenska
- Semantiska fargvariabler, inga hardkodade hex/gray

## Filer som skapas/andras

| Fil | Aktion |
|-----|--------|
| `src/hooks/useCurrentStaffId.ts` | Ny |
| `src/services/myProjectsService.ts` | Ny |
| `src/pages/MyProjects.tsx` | Ny |
| `src/App.tsx` | Lagg till route |
| `src/components/Sidebar3D.tsx` | Lagg till menyvalet "Mina projekt" |

