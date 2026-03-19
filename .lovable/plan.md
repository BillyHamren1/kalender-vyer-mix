

# Plan: Förenkla packning till manuell checklista

## Vad användaren vill
En packning ska vara en **enkel manuell packlista** — inte ett projekthanteringsverktyg. Man skriver artikelnamn för hand och bockar av dem. Inget Gantt-schema, inga deadlines, inga uppgiftstilldelningar.

## Vad som ändras

### 1. Förenkla `CreatePackingWizard`
**Fil:** `src/components/packing/CreatePackingWizard.tsx`
- Ta bort hela checklista-sektionen (DEFAULT_CHECKLIST, DndProvider, deadlines, drag-and-drop)
- Behåll: namn, valfri bokningskoppling, valfri ansvarig
- Lägg till ett enkelt fält för att lägga till manuella rader (artikelnamn) direkt vid skapande
- Varje rad sparas som en `packing_task` med bara `title` + `completed: false`

### 2. Förenkla `PackingDetail`
**Fil:** `src/pages/PackingDetail.tsx`
- Ta bort flikarna **Gantt-schema** och **Uppgifter**
- Byt standardflik till en ny **enkel checklista** som visar alla `packing_tasks` som checkbara rader
- Behåll: Packlista (scanner-baserad, om bokning finns), Produkter, Filer, Kommentarer
- Lägg till inline-redigering: klicka på rad för att ändra namn, plus-knapp för att lägga till ny rad

### 3. Ny komponent: `ManualPackingChecklist`
**Fil:** `src/components/packing/ManualPackingChecklist.tsx` (ny)
- Enkel lista med:
  - Varje rad: checkbox + artikelnamn (redigerbart) + ta bort-knapp
  - Input-fält längst ner: "Lägg till artikel..." + Enter för att spara
  - Progress: "3/7 avbockade"
- Använder befintliga `packing_tasks`-tabellen (title + completed)
- Ingen deadline, ingen tilldelning, ingen drag-and-drop

### 4. Städa bort onödiga komponenter
Följande komponenter **tas bort** (används inte längre):
- `PackingGanttChart.tsx`
- `PackingTaskDetailSheet.tsx`
- `AddPackingTaskDialog.tsx`
- `PackingTaskItem.tsx`
- `PackingTaskList.tsx` (ersätts av `ManualPackingChecklist`)

### 5. Behåll scanner-flödet intakt
`PackingListTab` (scanner-baserad packlista från `packing_list_items`) **behålls oförändrad** — den visas bara om packningen är kopplad till en bokning med produkter. Scannerns Edge Function (`scanner-api`) påverkas inte.

## Filer som ändras
1. `src/components/packing/CreatePackingWizard.tsx` — Förenklad skapandevy
2. `src/pages/PackingDetail.tsx` — Bort med Gantt + Tasks-flikar, in med manuell checklista
3. `src/components/packing/ManualPackingChecklist.tsx` — Ny enkel checklistekomponent
4. Ta bort: `PackingGanttChart.tsx`, `PackingTaskDetailSheet.tsx`, `AddPackingTaskDialog.tsx`, `PackingTaskItem.tsx`, `PackingTaskList.tsx`

