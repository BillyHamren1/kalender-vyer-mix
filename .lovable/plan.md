

## Plan: Ersätt teal med lila på utvalda sektioner

### Omfattning
Alla sidor under dessa sidebar-sektioner ska använda lila (purple) istället för teal:
- **Projekt**: ProjectManagement (redan klar), MyProjects, ProjectArchive
- **Logistikplanering**: OpsControlCenter, CustomCalendarPage (Personalplanering), LogisticsHub (Transportplanering)
- **Personalhantering**: StaffManagement, TimeReportApprovals, StaffDashboard, StaffDetail, StaffRevenueOverview
- **Ekonomiöversikt**: EconomyOverview, ProjectEconomyDetail

### Ändringar

**1. Sidor med `PageHeader` — lägg till `variant="purple"`**
Dessa använder redan PageHeader-komponenten och behöver bara en prop:
- `src/pages/MyProjects.tsx` — lägg till `variant="purple"`
- `src/pages/ProjectArchive.tsx` — lägg till `variant="purple"`
- `src/pages/CustomCalendarPage.tsx` — lägg till `variant="purple"`
- `src/pages/StaffManagement.tsx` — lägg till `variant="purple"`
- `src/pages/TimeReportApprovals.tsx` — lägg till `variant="purple"`
- `src/pages/StaffRevenueOverview.tsx` — lägg till `variant="purple"`
- `src/pages/PlanningDashboard.tsx` — lägg till `variant="purple"`

**2. Sidor med egna custom headers — byt gradient/färg till lila**
Dessa har inline-stylade headers med `from-primary to-primary/80` och `hsl(var(--primary))`:
- `src/pages/EconomyOverview.tsx` — byt icon-gradient och boxShadow från primary/teal till `hsl(270 45% 55%)` / `hsl(280 50% 42%)`
- `src/pages/LogisticsHub.tsx` — samma byte av icon-gradient och boxShadow till lila

**3. Sidor med enkel h1/rubrik utan PageHeader**
- `src/pages/StaffDashboard.tsx` — liten sida, ingen ikon-header att ändra (bara en `<h1>` text). Ingen ändring behövs.
- `src/pages/StaffDetail.tsx` — har en tillbaka-knapp + staffnamn. Ingen ikon-header. Ingen ändring behövs.
- `src/pages/OpsControlCenter.tsx` — har en broadcast-bar, ingen ikon-header. Ingen ändring behövs.
- `src/pages/ProjectEconomyDetail.tsx` — har en tillbaka-knapp + projektnamn. Ingen ikon-header. Ingen ändring behövs.

### Sammanfattning
- **9 filer ändras** (7 PageHeader-prop + 2 custom header-färger)
- Ingen logik eller struktur ändras, bara visuell färg

