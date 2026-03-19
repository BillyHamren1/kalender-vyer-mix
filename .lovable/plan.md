
# Lägg till tredje widget: "Senast avslutade projekt"

## Ändringar i `src/components/project/ProjectDashboardWidgets.tsx`

1. **Ny `recentlyCompleted` memo** — Filtrera `unified` på `status === 'completed'`, sortera på `updatedAt` (senast avslutade först), ta 5 st.

2. **Grid från 2 → 3 kolumner** — Ändra `grid-cols-1 md:grid-cols-2` till `grid-cols-1 md:grid-cols-3` på widget-raden.

3. **Ny Card** med `CheckCircle2`-ikon och rubrik "Senast avslutade projekt", samma `ProjectRow`-layout som de andra två.

Allt i en fil, ~15 rader tillagda.
