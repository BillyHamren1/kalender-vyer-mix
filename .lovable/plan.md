
## Problemet: economics_data är NULL för alla bokningar

### Rotkorsaken — tre samverkande brister

**1. Kolumnen är ny, datan är gammal**
`economics_data`-kolonnen lades till i databasen och edge-funktionen uppdaterades för att spara den — men alla 17 befintliga bokningar hade redan importerats. Ingen återimport triggades → alla har `economics_data = NULL`.

**2. `hasBookingChanged()` ignorerar economics_data**
Ändringskontrollfunktionen jämför bara dessa fält:
```
client, rigdaydate, eventdate, rigdowndate, deliveryaddress,
delivery_city, delivery_postal_code, status, booking_number,
assigned_project_id, assigned_project_name, assigned_to_project
```
`economics_data` ingår inte. Även om API:et skickar economics-data för en befintlig bokning detekteras ingen förändring → bokningen skippas (`continue`) och `economics_data` skrivs aldrig.

**3. Skippade bokningar uppdateras aldrig**
```typescript
if (!hasChanged && !statusChanged && ...) {
  // Sync attachments
  results.unchanged_bookings_skipped.push(bookingData.id)
  continue; // ← economics_data skrivs ALDRIG
}
```

### Lösningen — tre åtgärder

**Åtgärd 1: Lägg till economics_data i hasBookingChanged()**
Så att framtida imports detekterar när economics-data tillkommer eller ändras:
```typescript
// Kolla om economics_data saknas i befintlig bokning men finns i extern data
if (externalBooking.economics_data && !existingBooking.economics_data) {
  return true; // Markera som förändrad
}
```

**Åtgärd 2: Uppdatera economics_data även för "unchanged" bokningar som saknar den**
I den skippade-grenen, lägg till en check:
```typescript
if (!hasChanged && !statusChanged && ...) {
  // Om economics_data saknas men finns i API-svaret → uppdatera bara den
  if (!existingBooking.economics_data && bookingData.economics_data) {
    await supabase.from('bookings')
      .update({ economics_data: bookingData.economics_data })
      .eq('id', existingBooking.id);
  }
  await syncAllAttachments(...);
  results.unchanged_bookings_skipped.push(bookingData.id)
  continue;
}
```

**Åtgärd 3: SQL-patch för befintliga bokningar**
Eftersom 0 av 17 bokningar har economics_data och datan finns i API:et behöver vi trigga en re-import. Det enklaste: lägg till en "force economics backfill"-logik som alltid uppdaterar `economics_data` om den är null, oavsett om bokningen i övrigt är oförändrad.

Alternativt: kör direkt `UPDATE bookings SET economics_data = NULL WHERE true` är onödigt — datan finns inte ens i DB. Lösningen är edge-funktionen som skriver den vid nästa import.

### UI-problemet — kortet visas inte ens om data saknas

I `BookingDetailContent.tsx`:
```tsx
{booking.economics && <BookingEconomicsCard economics={booking.economics} />}
```
Detta är korrekt beteende — kortet ska bara visas om data finns. Problemet är att data aldrig importerades.

### Filer att ändra

| Fil | Förändring |
|-----|-----------|
| `supabase/functions/import-bookings/index.ts` | 1) Lägg till `economics_data`-check i `hasBookingChanged()` · 2) Backfill economics_data i skip-grenen om den saknas |

Det är **bara edge-funktionen** som behöver ändras. Ingen UI-ändring. Efter deploy räcker det att trigga en import för att alla bokningar ska få sin `economics_data` fylld.
