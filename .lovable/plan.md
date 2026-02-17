
## Problemet: API skickar base64 — koden förväntar sig public_url

### Vad som händer nu

Det externa systemet har ändrat hur bilder skickas. Istället för en `public_url` per bild skickar de nu:

```json
"tent_images": [
  { "tent_index": 1, "view_key": "Sida", "content_base64": "iVBORw0KGgo..." }
],
"attachments": [
  { "file_name": "ritning.pdf", "content_base64": "JVBERi0x..." }
],
"map_drawing": {
  "content_base64": "iVBORw0KGgo..."
}
```

Men `syncTentImages` letar efter `tentImage.public_url` — ett fält som nu är tomt/saknas. Därför sparas ingenting.

### Lösning: Ladda upp base64 till Supabase Storage, spara URL

Flödet för varje bild:

```text
base64-sträng → avkoda → ladda upp till "map-snapshots"-bucket → hämta publicUrl → spara i booking_attachments
```

Bucketen `map-snapshots` är redan publik och används av FileUpload-komponenten — perfekt att återanvända.

### Tekniska ändringar i `syncTentImages`

Funktion uppdateras att hantera **båda fallen**:
1. `public_url` finns → beteende oförändrat (bakåtkompatibelt)
2. `content_base64` finns → ladda upp till Storage → använd den returnerade URL:en

```typescript
async function syncTentImages(supabase, bookingId, tentImages, results) {
  for (const tentImage of tentImages) {
    let imgUrl = tentImage.public_url;
    
    // Nytt: hantera base64-bilder
    if (!imgUrl && tentImage.content_base64) {
      const fileName = `tent-${bookingId}-${tentImage.tent_index}-${tentImage.view_key}.jpg`;
      const filePath = `${bookingId}/${fileName}`;
      
      // Avkoda base64 och ladda upp
      const binary = atob(tentImage.content_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      
      const { error } = await supabase.storage
        .from('map-snapshots')
        .upload(filePath, bytes, { contentType: 'image/jpeg', upsert: true });
      
      if (!error) {
        const { data: urlData } = supabase.storage
          .from('map-snapshots')
          .getPublicUrl(filePath);
        imgUrl = urlData.publicUrl;
      }
    }
    
    if (!imgUrl) continue;
    // ... spara i booking_attachments som tidigare
  }
}
```

### Vad som också hanteras

**Bilagor (`attachments[].content_base64`)**: Samma mönster — base64 laddas upp till Storage, URL sparas. Filtypen bestäms från `file_name`-ändelsen.

**Situationsplan (`map_drawing.content_base64`)**: Laddas upp som en bild och URL:en sparas i `bookings.map_drawing_url`-kolumnen (används redan av UI:t för "Placeringsritning").

### Deduplicering

Eftersom `upsert: true` används vid uppladdning till Storage, och URL:en baseras på `bookingId + tent_index + view_key`, skapas aldrig dubbletter ens vid re-import.

### Filer att ändra

1. **`supabase/functions/import-bookings/index.ts`**
   - Uppdatera `syncTentImages` att stödja `content_base64`
   - Uppdatera `attachments`-blocket att stödja `content_base64`
   - Lägg till hantering av `map_drawing.content_base64`

Inga databasmigrationer behövs — `booking_attachments` och `map-snapshots`-bucketen finns redan.
