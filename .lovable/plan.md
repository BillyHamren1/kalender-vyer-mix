
# Åtgärda kundnamnstrunkering i Planerings-Dashboard veckovyn

## Problem
Kundnamnet ("Testkund...") klipps mitt i containern på projektkorten i veckovyn. Orsaken är en kombination av:

1. **För smal kolumnbredd** – Varje dag-kolumn har `min-w-[140px]` och `flex-1` vilket ger ca 140px per kolumn. Med padding (2.5 = 10px på varje sida) blir textbredden endast ~120px.
2. **Klippt till 1 rad** – `line-clamp-1` på rad 129 begränsar texten till max 1 rad.

## Lösning
1. **Ändra `line-clamp-1` till `line-clamp-2`** på kundnamnet så det kan visa 2 rader.
2. **Öka minsta kolumnbredd** från `140px` till `180px` för att ge mer horisontellt utrymme.
3. **Uppdatera `min-w` på grid-container** från `980px` till `1260px` (7 × 180px) för att matcha.

## Filer som ändras

### `src/components/planning-dashboard/WeekProjectsView.tsx`

**Ändring 1** – Rad 129: Ändra från 1 rad till 2 rader
```tsx
// Före
<h4 className="font-semibold text-sm text-foreground line-clamp-1 mb-1.5">

// Efter
<h4 className="font-semibold text-sm text-foreground line-clamp-2 mb-1.5">
```

**Ändring 2** – Rad 184: Öka kolumnbredd
```tsx
// Före
"flex flex-col flex-1 min-w-[140px]",

// Efter
"flex flex-col flex-1 min-w-[180px]",
```

**Ändring 3** – Rad 301: Öka grid min-width
```tsx
// Före
<div className="flex gap-2 min-w-[980px] items-stretch">

// Efter
<div className="flex gap-2 min-w-[1260px] items-stretch">
```

## Tekniska detaljer
- `line-clamp-2` sätter `-webkit-line-clamp: 2` och `overflow: hidden` för att klippa efter 2 rader med ellipsis
- Bredare kolumner (`180px` istället för `140px`) ger ~40px mer utrymme per kolumn
- Grid-containern får `min-w-[1260px]` (7 × 180px = 1260px) för att säkerställa att alla kolumner får plats
- Horisontell scroll (`overflow-x-auto` på rad 300) är redan på plats om skärmen är för smal

## Testplan
1. Gå till `/dashboard` (Planerings-Dashboard)
2. Bekräfta att kundnamn på projektkort nu visar upp till 2 rader innan de klipps
3. Bekräfta att texten använder mer av kortets horisontella bredd
4. Testa på olika skärmstorlekar att horisontell scroll fungerar
