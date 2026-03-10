

## Plan: Ersätt "Alla bokningar" med "Alla projekt" på dashboarden

### Vad ändras

Sektionen "Alla bokningar" på dashboarden byts ut mot en "Alla projekt"-sektion som visar samtliga projekt (små, medelstora och stora) i samma tabellformat — med sök, statusfilter och datumfilter.

### Teknisk approach

**Ersätt `DashboardAllBookings`-komponenten** i `PlanningDashboard.tsx` med en ny `DashboardAllProjects`-komponent som återanvänder samma datahämtning som `UnifiedProjectList` (jobs, projects, large_projects).

#### Ny fil: `src/components/dashboard/DashboardAllProjects.tsx`

- Hämtar data med samma queries som `UnifiedProjectList`: `fetchJobs`, `fetchProjects`, `fetchLargeProjects`
- Sammanfogar till en enhetlig lista med typ-badge (Litet/Medel/Stort)
- Tabellkolumner: **Typ** | **Namn** | **Klient** | **Status** | **Datum** | **→**
- Filter: textsök, statusfilter (Alla/Planering/Under arbete/Levererat/Avslutat), datumintervall
- Klick navigerar till rätt projektvy (`/jobs/:id`, `/project/:id`, `/large-project/:id`)
- Samma visuella stil som nuvarande "Alla bokningar" (rounded card, table layout, max-height scroll)

#### Ändrad fil: `src/pages/PlanningDashboard.tsx`

- Byt import från `DashboardAllBookings` till `DashboardAllProjects`
- Uppdatera sektionskommentar och JSX

### Filer som påverkas
- `src/components/dashboard/DashboardAllProjects.tsx` — ny fil
- `src/pages/PlanningDashboard.tsx` — byt komponent
- `src/components/dashboard/DashboardAllBookings.tsx` — kan tas bort (eller behållas om den används annorstädes)

