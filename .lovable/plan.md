
## Problem: Ojämn breddfördelning trots `w-1/2`

### Vad som händer
Vänster lista har `w-1/2`, men höger panel har `flex-1` — det innebär att höger sida tar "resterande utrymme" minus eventuella marginaler/padding, inte exakt 50%. Dessutom kan innehållet i listan (långa uppgiftsnamn) tvinga listan att bli bredare än den borde.

### Lösning
Sätt **båda** sidorna till `w-1/2` med `overflow-hidden` och lägg till `min-w-0` på båda, så att ingen sida kan expandera utöver sin andel:

**Vänster (rad 95) — ingen ändring:**
```tsx
<div className="flex flex-col w-1/2 min-w-0 border-r border-border/30 overflow-hidden">
```

**Höger panel (rad 176) — ändra från `flex-1` till `w-1/2`:**
```tsx
<div className="w-1/2 min-w-0 overflow-hidden">
```

### Varför detta fungerar
- `flex-1` = "ta resterande plats" → påverkas av content-storlek
- `w-1/2` på båda = "exakt 50% av föräldern var" → strickt lika bredd

### Fil att ändra
| Fil | Rad | Ändring |
|---|---|---|
| `src/components/project/ProjectTaskList.tsx` | 176 | `flex-1 min-w-0 overflow-hidden` → `w-1/2 min-w-0 overflow-hidden` |
