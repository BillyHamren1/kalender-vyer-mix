
## Mål
När ett lagerprojekt skapas från inkorgen ska systemet **automatiskt skapa packlistor** för alla bokningar som ingår i källprojektet — exakt som tidigare auto-skapelse vid CONFIRMED. Sen ska all bokningsinfo (kund, datum, adress, kontakter, produkter, packlista, bilagor) vara tillgänglig precis som i den gamla `PackingDetail`-vyn.

## Vad som behövs

### 1. Auto-skapa `packing_projects` vid lagerprojekt-skapande

Utöka `createWarehouseProjectFromInbox` (i `warehouseProjectService.ts`) så att efter `warehouse_projects`-raden + 2 moment skapas, även:

**Om `source_type='project'`** (en bokning):
- Skapa 1 `packing_projects`-rad med `booking_id = projects.booking_id`, `warehouse_project_id = wp.id`, namn = `client - eventdate`, datum från bokningen.
- Anropa `syncBookingToPacking(bookingId, organizationId)` (befintlig edge function) för att kopiera produkter → `packing_list_items`.

**Om `source_type='large_project'`** (flera bokningar):
- Hämta alla `large_project_bookings.booking_id` för projektet.
- Skapa 1 konsoliderad `packing_projects`-rad med `large_project_id = lp.id`, `warehouse_project_id = wp.id`.
- Skapa rader i `packing_project_bookings` för varje booking_id.
- Anropa `syncBookingToPacking` för varje bokning (eller en bulk-variant).

### 2. Visa packningar i lagerprojektets "Packningar"-flik

Just nu är fliken en placeholder. Ersätt med:
- Hämta `packing_projects WHERE warehouse_project_id = wp.id`.
- Visa lista med kort (kund, datum, status, framsteg) — återanvänd `PackingCard` som redan finns.
- Klick → navigerar till befintliga `/warehouse/packing/:packingId` (PackingDetail) som redan har all info: BookingInfoExpanded, ProductsList, DesktopChecklistView, ManualPackingChecklist, files, comments, attachments.

### 3. Säkerställ datasynk vid bokningsändringar

Den befintliga triggern `sync_packing_on_booking_change` uppdaterar redan `packing_projects` (namn, datum, adress, status) för befintliga rader — den fungerar fortfarande för packlistor som vi nu skapar via lagerprojekt-flödet. Ingen DB-ändring behövs.

`booking_products` ändringar → `syncBookingToPacking` används redan av `bookingStatusService` när status ändras. För kontinuerlig produktsynk räcker att packningen är skapad — befintlig synk-pipeline tar resten.

## Datamodell — inget nytt
`packing_projects.warehouse_project_id` finns redan (`uuid`, nullable). Inga nya kolumner eller triggers krävs.

## Filer som ändras

**`src/services/warehouseProjectService.ts`** — utöka `createWarehouseProjectFromInbox`:
- Efter wp insert + tasks insert: hämta booking_ids från källan, skapa `packing_projects`-rader (+ `packing_project_bookings` om large), kalla `syncBookingToPacking` per bokning. Allt non-blocking — om det fallerar loggas, men lagerprojektet skapas ändå.

**`src/pages/WarehouseProjectDetail.tsx`** — "Packningar"-fliken:
- Ny query: `fetchWarehousePackings(warehouseProjectId)` → `packing_projects WHERE warehouse_project_id = ?`.
- Rendera lista med befintlig `PackingCard` (eller enklare lokalt kort) → onClick → `navigate(/warehouse/packing/:id)`.

**`src/services/warehouseProjectService.ts`** — lägg till hjälpare:
- `fetchWarehousePackings(wpId)` 
- `getSourceBookingIds(inboxItem)` (intern, för create-flödet)

## Edge cases
- **Befintliga packningar för samma bokning**: `packing_projects.booking_id` har inte unique constraint, men vi vill undvika dubletter. Kolla först `SELECT id FROM packing_projects WHERE booking_id = ? AND large_project_id IS NULL` — om finns, sätt bara `warehouse_project_id` på den befintliga istället för att skapa ny.
- **Cancellation/återbekräftelse**: hanteras av befintliga `sync_packing_on_booking_change` + `cancellation-workflow`.
- **Source large_project utan bookings**: skapa lagerprojekt + moment ändå, ingen packning.

## Inga DB-migrationer
All logik körs i service-lagret. Triggern modifierades redan i förra steget (auto-INSERT borttaget, UPDATE-synk kvar).
