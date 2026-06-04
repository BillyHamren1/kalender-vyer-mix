# Fix: Sökfältet på "Planera packning" filtrerar inte inbox-listan

## Problem
På `/warehouse/packing` finns ett sökfält ("Sök packning…"). Idag filtrerar det **bara** `filteredPackings` (befintliga packningsprojekt) som visas längst ner. Men listan användaren faktiskt försöker söka i — **"Nya projekt från Planning"** (`WarehouseProjectInbox`) — tar inte emot någon `search`-prop och filtreras därför aldrig. Samma sak gäller `PackingUpdatedBookings` och `PackingDashboard`. Resultat: man skriver "we" och inget händer i inbox-listan.

## Lösning
Skicka ner sökterm till de listor som finns på sidan, så att samma fält filtrerar allt.

### Ändringar
1. **`src/components/warehouse/WarehouseProjectInbox.tsx`**
   - Lägg till valfri prop `search?: string`.
   - Filtrera `items` på `client_name` och `source_project_number` (case-insensitive, trimmat). Tom sträng = ingen filtrering (oförändrat beteende).
   - Behåll "dölj sektionen om listan är tom" — men när `search` är satt och inget matchar visas en kort tom-rad ("Inga matchande projekt i inbox") istället för att hela sektionen försvinner, så användaren förstår att sökningen är aktiv.

2. **`src/pages/PackingManagement.tsx`**
   - Skicka `<WarehouseProjectInbox search={search} />`.
   - Uppdatera placeholder till `"Sök packning, projekt eller bokning…"` så att det matchar att sökfältet nu täcker både inbox och packningar.

### Inte i scope
- `PackingUpdatedBookings` och `PackingDashboard` lämnas orörda om de inte också ska sökas igenom — säg till om du vill att jag tar dem också.
- Ingen ändring av status-filter, datamodell eller services.

## Teknisk detalj
Filterfunktion i inbox:
```ts
const q = (search ?? '').trim().toLowerCase();
const visible = q
  ? items.filter(i =>
      (i.client_name ?? '').toLowerCase().includes(q) ||
      (i.source_project_number ?? '').toLowerCase().includes(q))
  : items;
```
Rendera `visible` istället för `items` (badge-räknaren visar `visible.length` när sök är aktiv, annars `items.length`).
