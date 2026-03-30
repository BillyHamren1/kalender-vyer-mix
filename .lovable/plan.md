

## Fix: Skicka staffPool till EstablishmentGanttChart i stora projekt

### Problem
`LargeEstablishmentPage.tsx` hämtar `staffPool` korrekt (rad 37-60), men skickar den **inte** till `EstablishmentGanttChart` (rad 84-94). Därför saknas personalvalet i "Lägg till aktivitet"-dialogen för stora projekt.

### Åtgärd

**`src/pages/project/LargeEstablishmentPage.tsx`** — Lägg till `staffPool={staffPool}` på rad 88 i `EstablishmentGanttChart`:

```tsx
<EstablishmentGanttChart
  largeProjectId={project.id}
  startDate={project.start_date}
  endDate={project.end_date}
  onTaskClick={handleTaskClick}
  staffPool={staffPool}              // <-- LÄGG TILL
  projectBookings={...}
/>
```

En enda rad. Allt annat är redan på plats.

