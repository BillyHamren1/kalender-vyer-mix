
# Ta emot och visa placeringsritning + bilder i bokningar

## Sammanfattning
Webhook-payloaden innehaller nu tva nya falt: `map_drawing_url` (direkt-URL till placeringsritning) och `public_url` pa varje attachment. Vi behover:
1. Spara `map_drawing_url` i databasen
2. Uppdatera import-funktionen att anvanda `public_url` for bilagor
3. Visa placeringsritningen som en forhandsvisning i bokningsdetaljer
4. Visa bilagor som klickbara bilder/thumbnails istallet for bara lankar

## Teknisk plan

### 1. Databasandring: Ny kolumn `map_drawing_url` pa `bookings`

```text
ALTER TABLE bookings ADD COLUMN map_drawing_url text;
```

### 2. Edge Function: `import-bookings/index.ts`

**map_drawing_url**: Lagg till i `BookingData`-interfacet och i bookingData-objektet sa att `externalBooking.map_drawing_url` sparas.

**attachments**: Uppdatera attachment-processingen (rad ~2107-2128) sa att `public_url` anvands som URL-kalla:
```text
url: attachment.public_url || attachment.url || attachment.file_url
```

### 3. Typ-uppdatering: `src/types/booking.ts`

Lagg till `mapDrawingUrl?: string` pa `Booking`-interfacet.

### 4. Transform-uppdatering: `src/services/booking/bookingUtils.ts`

Mappa `dbBooking.map_drawing_url` till `mapDrawingUrl` i `transformBookingData`.

### 5. Ny komponent: `src/components/booking/MapDrawingCard.tsx`

En ny Card-komponent "Placeringsritning" som:
- Visar en klickbar thumbnail av ritningen (img-tagg med `map_drawing_url`)
- Klick oppnar bilden i fullstorlek (ny flik eller lightbox-dialog)
- Visar "Ingen placeringsritning tillganglig" nar `map_drawing_url` ar null

### 6. Uppdatera `AttachmentsList.tsx`

For bilagor som ar bilder (jpg, png, jpeg, webp, gif): visa en liten thumbnail-forhandsvisning istallet for bara en filnamn-lank. Klick oppnar bilden i fullstorlek.

### 7. Uppdatera `BookingDetailContent.tsx`

Lagg till `MapDrawingCard` i layouten, placerad efter leveransinformation (logisk plats - ritningen tillhor platsen).

## Filer som andras

| Fil | Aktion |
|-----|--------|
| `supabase/migrations/xxx.sql` | Ny kolumn `map_drawing_url` |
| `supabase/functions/import-bookings/index.ts` | Hantera `map_drawing_url` + `public_url` |
| `src/types/booking.ts` | Lagg till `mapDrawingUrl` |
| `src/services/booking/bookingUtils.ts` | Mappa `map_drawing_url` |
| `src/components/booking/MapDrawingCard.tsx` | Ny - visa ritning |
| `src/components/booking/AttachmentsList.tsx` | Bildforhandsvisning for bilagor |
| `src/components/booking/detail/BookingDetailContent.tsx` | Inkludera MapDrawingCard |
