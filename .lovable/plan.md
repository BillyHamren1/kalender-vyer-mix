
## Problem: Duplicerade bilder i bokningsvyn

### Rotkorsaken

Varje import-körning anropar **två separata bildfunktioner** — `syncProductImages` och `syncFilesMetadata`/`syncTentImages` — och de körs sekventiellt utan att dela ett gemensamt `seenUrls`-set.

Resultatet: `syncFilesMetadata` hämtar existerande attachments från databasen, men vid det laget har `syncProductImages` precis INSERT:at nya rader — som ännu inte återspeglas i den hämtning som gjordes i början av `syncFilesMetadata`. Dedupliceringslogiken missar dem alltså.

Databas-bevis: Exakt 2 rader per bild med identisk URL, vilket stämmer perfekt med ett sekventiellt dubbeltkall.

```
syncProductImages()        → hämtar befintliga, ser inga bilder, INSERT:ar 6 bilder
syncFilesMetadata()        → hämtar befintliga (DB-read BEFORE commit syncs?), ser inte de 6, INSERT:ar 6 till
                           → 12 rader totalt, exakt 2x per bild
```

### Lösning: Gemensam deduplicering

**En samlad funktion `syncAllAttachments`** som:
1. Hämtar **alla** befintliga bilder för bokningen **en gång**
2. Bygger ett **gemensamt** `seenUrls`-set
3. Processar `products[]` och `files_metadata[]` i **samma anrop** mot detta delade set
4. Gör bara ett INSERT per unik URL, oavsett källa

```typescript
async function syncAllAttachments(supabase, bookingId, products, filesMetadata, tentImages, results) {
  // Hämta befintliga URLS en gång
  const { data: existing } = await supabase
    .from('booking_attachments')
    .select('url')
    .eq('booking_id', bookingId);
  
  const seenUrls = new Set(existing?.map(a => a.url) ?? []);
  
  // Bearbeta produktbilder + files_metadata/tent_images mot SAMMA set
  ...
}
```

Alla 6 anropsplatser i edge-funktionen ersätts med ett anrop till den nya kombinerade funktionen.

### Städa upp befintlig data

Befintliga duplikat i databasen tas bort med en SQL-query som behåller den äldsta raden per unik URL:

```sql
DELETE FROM booking_attachments
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY booking_id, url ORDER BY created_at ASC
    ) AS rn
    FROM booking_attachments
  ) sub
  WHERE rn > 1
);
```

### Filer att ändra

1. **`supabase/functions/import-bookings/index.ts`**
   - Ta bort `syncProductImages`, `syncFilesMetadata`, `syncTentImages` (3 separata funktioner)
   - Lägg till ny samlad `syncAllAttachments` med delat `seenUrls`-set
   - Uppdatera alla 6 anropsplatser att använda den nya funktionen

2. **Databasmigration** — rensa befintliga duplikat med `DELETE ... WHERE rn > 1`

Ingen UI-ändring krävs — bilder visas redan korrekt, det blir bara rätt antal av dem.
