

# Fix: Booking-import kraschar på trigger-kedja

## Problemet (kort)
EventFlow skickar korrekt webhook med `organization_id`. `receive-booking` tar emot den och vidarebefordrar till `import-bookings`. Bokningen hämtas från externt API och `bookingData` byggs med korrekt `organization_id`.

**Men**: Vid `INSERT INTO bookings` triggas `track_booking_changes()`, som i sin tur gör `INSERT INTO booking_changes`. Kolumnen `booking_changes.organization_id` har default `get_user_organization_id(auth.uid())`. Eftersom edge functions kör med `service_role` är `auth.uid()` = null → `set_organization_id()`-triggern på `booking_changes` kastar exception → **hela transaktionen rullas tillbaka** och bokningen sparas aldrig.

Samma problem gäller `track_booking_deletions()`.

## Lösning

**En databasmigration** som uppdaterar de två trigger-funktionerna så att de explicit sätter `organization_id` från bokningsraden (`NEW.organization_id` / `OLD.organization_id`) istället för att förlita sig på auth-context:

### 1. `track_booking_changes()` — lägg till `organization_id` i INSERT
```sql
INSERT INTO public.booking_changes (
  booking_id, change_type, changed_fields,
  previous_values, new_values, version, changed_by,
  organization_id  -- NYTT
) VALUES (
  NEW.id, change_type_value, changed_fields_json,
  previous_values_json, new_values_json, next_version,
  current_setting('app.current_user', TRUE)::TEXT,
  NEW.organization_id  -- NYTT: hämta från bokningsraden
);
```

### 2. `track_booking_deletions()` — samma fix
```sql
INSERT INTO public.booking_changes (
  booking_id, change_type, changed_fields,
  previous_values, new_values, version, changed_by,
  organization_id  -- NYTT
) VALUES (
  OLD.id, 'delete', '{"deleted": true}'::JSONB,
  row_to_json(OLD)::JSONB, '{}'::JSONB, next_version,
  current_setting('app.current_user', TRUE)::TEXT,
  OLD.organization_id  -- NYTT: hämta från den borttagna raden
);
```

### Filer som ändras
- `supabase/migrations/[timestamp]_fix_booking_change_triggers_org_id.sql` (ny)

### Förväntat resultat
- Booking-inserts via edge functions (service_role) slutar krascha
- Bokning `b5c2dc9b` (och alla framtida webhook-importerade bokningar) sparas korrekt
- Inga ändringar behövs i frontend eller edge function-kod

