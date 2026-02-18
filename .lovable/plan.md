
## Mål
Uppgiftslistan ska ha exakt samma höjd som bokningscontainern — 560px fast höjd med intern scroll, inte bara en max-höjd.

## Problem
- Bokningscontainern: `max-h-[560px] overflow-y-auto` — håller sig på 560px och scrollar inuti
- Uppgiftslistan: `max-h-[560px]` utan `overflow-y-auto` — kan växa utöver 560px om innehållet är längre

## Lösning

### `src/pages/project/ProjectViewPage.tsx`
Ändra höger kolumn från:
```tsx
<div className="flex flex-col gap-4 max-h-[560px]">
```
Till:
```tsx
<div className="flex flex-col gap-4 h-[560px] overflow-y-auto">
```

Och vänster kolumn (bokningscontainern) ändras från `max-h-[560px]` till `h-[560px]` för att båda ska vara exakt lika höga:
```tsx
<div className="h-[560px] overflow-y-auto rounded-2xl">
```

## Fil att ändra
| Fil | Rad | Ändring |
|---|---|---|
| `src/pages/project/ProjectViewPage.tsx` | 68 | `max-h-[560px]` → `h-[560px]` |
| `src/pages/project/ProjectViewPage.tsx` | 78 | `max-h-[560px]` → `h-[560px] overflow-y-auto` |

## Resultat
Båda kolumnerna blir exakt 560px höga och scrollar inuti om innehållet överstiger det — de matchar varandra perfekt visuellt.
