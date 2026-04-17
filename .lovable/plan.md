
## Klargörande
Inga moment skapas automatiskt vid konvertering. När användaren klickar **"Skapa lagerprojekt"** öppnas en dialog där Packa/Returnera-datum är förifyllda som förslag. Användaren redigerar och bekräftar — först då skapas lagerprojektet + de två momenten i en transaktion.

## Flöde

```text
[Inkorg] "Skapa lagerprojekt" → öppnar dialog
            ↓
[ConvertInboxDialog]
  Lagerprojekt: {namn}            (redigerbart)
  
  📦 Packa
    Start: [datum]  Slut: [datum] (förslag, redigerbart)
  
  🔄 Returnera
    Start: [datum]  Slut: [datum] (förslag, redigerbart)
  
  [Avbryt]    [Skapa lagerprojekt]
            ↓
  Skapar warehouse_projects + 2× warehouse_project_tasks
  Markerar inbox som converted
  Navigerar till /warehouse/projects/:id
```

## Förslagslogik (vid dialog-öppning)

Hämtar event/nedrigg-datum från källan:
- **`source_type='project'`** → `bookings.eventdate` / `bookings.rigdowndate` via `projects.booking_id`
- **`source_type='large_project'`** → min(`event_date[]`) / max(`rigdown_date[]`) från `large_projects`

Beräkning:
```ts
packEnd     = eventDate - 1 dag
packStart   = eventDate - 3 dagar
returnStart = rigdownDate + 1 dag
returnEnd   = rigdownDate + 2 dagar
```

Saknas datum → fält tomma, användaren fyller i manuellt.

## Ändringar

**Ny fil:**
- `src/components/warehouse/ConvertInboxDialog.tsx` — dialog med projektnamn + 2 datumpar (shadcn Calendar i Popover, `pointer-events-auto`)

**Service (`warehouseProjectService.ts`):**
- Ny `fetchInboxItemSuggestedDates(item)` — returnerar `{packStart, packEnd, returnStart, returnEnd}` eller null per fält
- Utöka `createWarehouseProjectFromInbox(item, dates)` — efter att projektet skapats, insert 2 rader i `warehouse_project_tasks` (`Packa` sort_order 0, `Returnera` sort_order 1) med användarens datum

**`WarehouseProjectInbox.tsx`:**
- Ersätt direkt `handleConvert` med `setActiveItem(item)` som öppnar `ConvertInboxDialog`
- Dialogens onSuccess kör navigeringen + invalidering

**`WarehouseProjectDetail.tsx`:**
- "Moment"-fliken: lista `warehouse_project_tasks` (titel + datumintervall) — read-only i denna iteration

## Validering
- Båda momenten kräver start + slut
- Slutdatum ≥ startdatum per moment
- Submit blockad tills alla 4 datum är giltiga

## Inga DB-ändringar
`warehouse_project_tasks` finns redan med rätt kolumner.
