
## Problemet

I `ProjectViewPage.tsx` (rad 92) används `items-start` på den tre-kolumniga griden. Det gör att varje kort bara är lika högt som sitt innehåll. Dessutom saknar `<ProjectFiles>` `bookingAttachments`-propen i den nuvarande koden på rad 95–101.

## Lösningen — två enkla ändringar i `ProjectViewPage.tsx`

### 1. `items-start` → `items-stretch`
Ändrar gridens alignment så att alla tre kolumner sträcker sig till samma höjd (den högsta kolumnens höjd).

### 2. Wrappa varje `<section>` i `<div className="flex flex-col h-full">`
Korten inuti måste också få `h-full` för att fylla sin förälders höjd. Kortkomponenterna (`ProjectFiles`, `ProjectComments`, `ProjectActivityLog`) använder alla `<Card>` — dessa får `className="h-full"`.

### 3. Lägg till `bookingAttachments` på `<ProjectFiles>`
Just nu på rad 95–101 skickas **inte** `bookingAttachments` till `ProjectFiles`. Den propen är redan implementerad i komponenten men saknas i anropet. Lägg till `bookingAttachments={bookingAttachments}`.

## Tekniska ändringar

| Fil | Rad | Ändring |
|---|---|---|
| `src/pages/project/ProjectViewPage.tsx` | 92 | `items-start` → `items-stretch` |
| `src/pages/project/ProjectViewPage.tsx` | 93–101 | Wrappa i `div h-full`, ge `ProjectFiles` `className="h-full"` + `bookingAttachments` |
| `src/pages/project/ProjectViewPage.tsx` | 103–106 | Wrappa i `div h-full`, ge `ProjectComments` `className="h-full"` |
| `src/pages/project/ProjectViewPage.tsx` | 108–111 | Wrappa i `div h-full`, ge `ProjectActivityLog` `className="h-full"` |
| `src/components/project/ProjectFiles.tsx` | 51 | Lägg till `h-full` på `<Card>` |
| `src/components/project/ProjectComments.tsx` | 35 | Lägg till `h-full` på `<Card>` |
| `src/components/project/ProjectActivityLog.tsx` | 185 | Lägg till `h-full` på `<Card>` |

## Resultat
- Filer, Kommentarer och Historik håller exakt samma höjd
- Bokningsbilder visas i Filer-kortet (propen var implementerad men saknades i anropet)
