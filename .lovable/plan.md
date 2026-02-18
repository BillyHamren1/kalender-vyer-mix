
## Problem
TaskDetailSheet använder en `Sheet` (sidopanel från höger) som ser gammal och klumpig ut. Det rätta moderna sättet är att visa uppgiftsdetaljer **inline** i listan — ett panel som expanderar under uppgiften eller ersätter listan med en split-view.

## Lösning: Inline "expand panel" i uppgiftslistan

Istället för en Sheet, när man klickar på en uppgift, visas detaljerna i en elegant **inline-panel direkt inuti kortet** — ungefär som Todoist:
- Vänster sida: Uppgiftslistan (komprimerad) 
- Höger sida: Uppgiftsdetaljerna i ett inbyggt panel

### Visuellt flöde
```text
┌─────────────────────────────────────────────────────────┐
│ Uppgifter                                      2/5  [+] │
├──────────────────────────┬──────────────────────────────┤
│ ○ Bokning av UE          │  Bokning av UE               │
│ ● Transportbokning    ✓  │  ─────────────────────────── │
│ ○ [Klickad uppgift] ───► │  📅 18 feb  👤 Anna          │
│ ○ Förberedelser          │                              │
│ ○ Återrapportering       │  Beskrivning...              │
├──────────────────────────│                              │
│ + Lägg till uppgift...   │  💬 Kommentarer              │
└──────────────────────────┴──────────────────────────────┘
```

När ingen uppgift är vald syns listan i full bredd som idag.

## Implementering

### 1. `src/components/project/TaskDetailPanel.tsx` — NY komponent (ersätter Sheet)
En kompakt detaljpanel utan Sheet-wrapper:
- Ren vit `bg-card` bakgrund med `border-l border-border/40` separator
- Rubrik med inline-redigering (klicka på titel)
- Chips för deadline + ansvarig
- Beskrivning (klicka för att redigera)
- Kommentarer i tidslinje-stil (samma logik som idag men renare design)
- Minimalistisk "Stäng"-knapp (X) i hörnet
- "Ta bort"-länk diskret i botten

### 2. `src/components/project/ProjectTaskList.tsx` — Uppdatering
- Lägg till `selectedTaskId` state
- När en uppgift väljs: rendera panelen i en `grid grid-cols-[1fr_1fr]` layout inuti kortet
- När ingen uppgift är vald: vanlig full bredd

### 3. `src/components/project/TaskDetailSheet.tsx` — Tas bort/avaktiveras
Sheet-komponenten används inte längre. Listan hanterar allt internt.

### 4. `src/pages/project/ProjectViewPage.tsx`
Ta bort den fristående `<TaskDetailSheet>` längst ned i filen (den är redundant).

## Design-principer (matchar EventFlow design system)
- `bg-card` (vit) bakgrund — ingen grå bakgrund
- Tunn separator `border-l border-primary/20` mellan listan och panelen
- Kompakta chip-knappar för metadata (datum, ansvarig)
- Kommentarer: avatar + namn + tidsstämpel + text
- Persistent `localStorage` för kommentatorns namn
- `shadow-none` — inga extra skuggor inuti kortet

## Filer att ändra/skapa
| Fil | Ändring |
|---|---|
| `src/components/project/TaskDetailPanel.tsx` | NY — Inline-detaljpanel (ersätter Sheet) |
| `src/components/project/ProjectTaskList.tsx` | Byt Sheet mot inline split-view |
| `src/pages/project/ProjectViewPage.tsx` | Ta bort redundant TaskDetailSheet-import |

## Resultat
En modern, snabb och elegant inline-detaljpanel som är naturlig och intuitiv — inget popup, inget sidopanel, bara en smidig expansion inuti uppgiftskortet.
