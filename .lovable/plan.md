
## Mål
Migrera alla befintliga packningar (`packing_projects`) till den nya lagerprojekt-strukturen så att inget arbete tappas bort. Rensa lagerkalendern till endast två aktivitetstyper: **Packning** och **Retur** (tidigare "Uppackning").

## Vad som finns idag (utforskning)

Jag behöver kontrollera:
1. Hur många `packing_projects` saknar `warehouse_project_id`
2. Vilka kalender-events/aktivitetstyper finns i lagerkalendern idag
3. Om "Uppackning" är hårdkodat namn eller en enum/typ

Antaganden jag baserar planen på (verifieras vid implementation):
- `packing_projects` har redan all data (produkter, scans, kolli, kommentarer, filer) — vi behöver bara skapa en `warehouse_projects`-rad **per packning** och länka via `warehouse_project_id`.
- Lagerkalendern visar `warehouse_project_tasks` (Packa/Returnera) — detta är redan rätt struktur.
- "Uppackning" är troligen ett textfält eller default-titel i `warehouse_project_tasks` eller en gammal kalenderhändelse.

## Plan

### Steg 1 — Backfill-migration (SQL)

För varje `packing_projects` som saknar `warehouse_project_id`:
1. Skapa en `warehouse_projects`-rad med:
   - `name` = packningens namn (kund - datum)
   - `source_type` = `'project'` om `booking_id` finns, annars `'large_project'` om `large_project_id` finns, annars `'manual'`
   - `source_project_id` / `source_large_project_id` = motsvarande
   - `start_date` / `end_date` = packningens datum
   - `status` = mappa från packing-status (planning→planning, in_progress→in_progress, packed/delivered/completed→completed, cancelled→cancelled)
   - `organization_id` = från packningen
   - `project_number` = generera via befintlig sekvens
2. Skapa **2 default-moment** (`warehouse_project_tasks`):
   - **Packa**: 3 dagar fram till och med dagen före event/start
   - **Retur**: 2 dagar från dagen efter rigdown/end
3. Sätt `packing_projects.warehouse_project_id` = den nya wp.id

Allt befintligt (produkter, packed_quantity, kolli, scans, kommentarer, filer, attachments) följer automatiskt med eftersom det redan ligger på `packing_projects.id` som inte ändras.

### Steg 2 — Rensa lagerkalendern till "Packning" + "Retur"

**Kalenderkällan:** `warehouse_project_tasks` (default-titlar idag är "Packa" och "Returnera" enligt tidigare plan).

Åtgärder:
- **Döp om** alla befintliga tasks med titel `'Uppackning'` → `'Retur'` (UPDATE).
- **Standardisera default-titlar** till `'Packning'` och `'Retur'` (kontrollera `warehouseProjectService.ts` där defaults skapas och justera).
- **Ta bort alla andra event-typer** från lagerkalendern (om kalendern visar något annat än `warehouse_project_tasks` — t.ex. legacy `calendar_events` med warehouse-tagg → soft-filtrera eller radera).

Jag verifierar först hur `WarehouseCalendar` hämtar sin data innan jag bestämmer exakt borttagningslogik.

### Steg 3 — UI-justering
- Översätt "Uppackning" → "Retur" i alla labels/translations i lagermodulen.
- Säkerställ att `ConvertInboxDialog` föreslår titlarna **"Packning"** och **"Retur"** (inte "Packa"/"Returnera").

## Filer som påverkas

**Migration (SQL):**
- En migration som backfillar `warehouse_projects` + `warehouse_project_tasks` för alla föräldralösa `packing_projects`.
- En `UPDATE` för att döpa om "Uppackning"/"Returnera" → "Retur" och säkerställa "Packa" → "Packning".

**Kod:**
- `src/services/warehouseProjectService.ts` — uppdatera default-task-titlar till "Packning" / "Retur".
- `src/components/warehouse/ConvertInboxDialog.tsx` — uppdatera default-namn i förslaget.
- Eventuella översättningar/labels i lagerkalender och task-listor.

## Säkerhet
- Migrationen är **idempotent**: kollar `warehouse_project_id IS NULL` så den kan köras igen utan dubletter.
- Inga packningar raderas.
- Originaldata (scans, kolli, packed_quantity) rörs inte alls.

## Frågor jag löser vid implementation
- Hur lagerkalendern faktiskt hämtar events (verifieras genom att läsa `WarehouseCalendar`-komponenten).
- Om det finns `calendar_events` med warehouse-relaterade typer som också behöver ryd­das.

## Inga risker för dataförlust
All migration är additiv (skapar nya `warehouse_projects` + länkar). Befintliga packningar och deras innehåll förblir orörda.
