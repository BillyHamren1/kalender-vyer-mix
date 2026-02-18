
## Mål
Reducera vertikalt utrymme i uppgiftslistan radikalt — kompaktare rader, mindre padding överallt, och eliminera onödig whitespace.

## Ändringar

### `src/components/project/ProjectTaskItem.tsx`
- `py-2.5` → `py-1` på varje rad (halverar radhöjden)
- `px-3` → `px-2` för lite tätare horisontellt
- Reorder-knapparna (`h-4 w-4`) är 8px höga men tar mer plats p.g.a. flex-col stackning — gör dem `h-3 w-3` och göm dem mer aggressivt
- Checkbox `shrink-0` behålls men inget extra utrymme
- `gap-2` → `gap-1.5` mellan element

### `src/components/project/ProjectTaskList.tsx`
- `CardHeader`: `pt-3 pb-2` → `pt-2 pb-1.5` — sparar 6–8px i toppen
- Progress bar div: `pb-2` → `pb-1`
- Sektionsrubriker (`px-4 pt-2 pb-0.5`) → `px-2 pt-1.5 pb-0` — extremt kompakt
- `CardContent`: `pb-1` behålls
- Empty state `py-6` → `py-4`

## Resultat
Varje uppgiftsrad går från ~40px → ~28px. Med 8 uppgifter sparas ~96px, vilket gör att listan tar markant mindre plats och bättre matchar bokningscontainerns höjd.
