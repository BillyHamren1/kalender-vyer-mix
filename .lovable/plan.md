
## Lägg till stöd för `tent_images` i bokningsimport

### Problem

Det externa API:t skickar tältbilder i ett eget fält `tent_images` — en array av objekt med strukturen:
```json
{ "view_key": "...", "tent_index": 1, "public_url": "https://...", "offer_image": false }
```

Importkoden hanterar idag:
- `attachments` → sparas som `booking_attachments`
- `products[].image_url` / `products[].image_urls` → sparas som `booking_attachments`

Men `tent_images` ignoreras helt, vilket är varför A Catering saknar bilder.

### Lösning

Lägg till ett nytt block i importsekvensen som läser `tent_images` och sparar varje bild (med `public_url`) som en `booking_attachment`. Exakt samma dedupliceringslogik som för övriga bilder används.

### Teknisk ändring

**`supabase/functions/import-bookings/index.ts`** — ett enda nytt block efter nuvarande `attachments`-hantering (rad ~2204) och före `syncProductImages` (rad ~2207):

```typescript
// Process tent_images (tältbilder från externa API:t)
if (externalBooking.tent_images && Array.isArray(externalBooking.tent_images)) {
  console.log(`Processing ${externalBooking.tent_images.length} tent images for booking ${bookingData.id}`);
  
  const { data: existingUrls } = await supabase
    .from('booking_attachments')
    .select('url')
    .eq('booking_id', bookingData.id);
  
  const seenUrls = new Set((existingUrls || []).map((a: any) => a.url));
  
  for (const tentImage of externalBooking.tent_images) {
    const imgUrl = tentImage.public_url;
    if (!imgUrl || seenUrls.has(imgUrl)) continue;
    seenUrls.add(imgUrl);
    
    const tentIndex = tentImage.tent_index ?? '';
    const viewKey   = tentImage.view_key   ?? '';
    const fileName  = `Tält ${tentIndex} - ${viewKey}`.trim();
    
    const fileType = imgUrl.includes('.png')  ? 'image/png'
                   : imgUrl.includes('.webp') ? 'image/webp'
                   : 'image/jpeg';
    
    const { error: tentErr } = await supabase
      .from('booking_attachments')
      .insert({
        booking_id: bookingData.id,
        url:        imgUrl,
        file_name:  fileName || 'Tältbild',
        file_type:  fileType
      });
    
    if (tentErr) {
      console.error(`Error inserting tent image for booking ${bookingData.id}:`, tentErr);
    } else {
      results.attachments_imported++;
      console.log(`[Tent Image] Saved tent image "${fileName}" for booking ${bookingData.id}`);
    }
  }
}
```

Samma logik läggs även till i de tre "early-exit"-grenarna (unchanged, warehouse-recovery, product-recovery) precis som `syncProductImages` redan är tillagd där — annars missas bilder för bokningar som inte ändrats.

### Filer att ändra

1 fil: `supabase/functions/import-bookings/index.ts`

- Lägg till `tent_images`-blocket på 4 ställen (ny bokning + 3 early-exit-grenar)
- Inga databasmigrationer behövs — `booking_attachments`-tabellen fungerar som den är

### Resultat

Nästa gång importen körs för A Catering (eller vilken annan bokning som helst med `tent_images`) sparas alla tältbilder automatiskt som bokningsbilagor och visas i mobilappens "Bilder"-flik.
