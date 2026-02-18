
## Ändring: Lika bredd på lista och detaljpanel (50/50)

### Problem
Uppgiftslistan har hårdkodad `w-[45%]` och detaljpanelen tar `flex-1` (resterande ~55%). Det ger en ojämn och snedvriden layout.

### Lösning
En enkel ändring i `src/components/project/ProjectTaskList.tsx` rad 95:

**Från:**
```tsx
<div className={syncedSelectedTask ? "flex flex-col w-[45%] min-w-0 border-r border-border/30 overflow-hidden" : "flex flex-col flex-1 overflow-hidden"}>
```

**Till:**
```tsx
<div className={syncedSelectedTask ? "flex flex-col w-1/2 min-w-0 border-r border-border/30 overflow-hidden" : "flex flex-col flex-1 overflow-hidden"}>
```

`w-1/2` ger exakt 50% bredd — detaljpanelen med `flex-1` tar automatiskt de resterande 50%.

### Fil att ändra
| Fil | Rad | Ändring |
|---|---|---|
| `src/components/project/ProjectTaskList.tsx` | 95 | `w-[45%]` → `w-1/2` |
