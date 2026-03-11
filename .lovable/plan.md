

# Fix: booking_products saknar organization_id vid import

## Rotorsak

Edge-funktionen `import-bookings` sätter **aldrig** `organization_id` på `booking_products`-inserts. Kolumnen har default `get_user_organization_id(auth.uid())`, men edge functions kör med `service_role` (ingen `auth.uid()`), så Postgres faller tillbaka till den **första organisationen i tabellen** — fel org.

**Resultat:** 445 av 745 produkter (60%) har fel `organization_id`. RLS blockerar sedan frågan i frontend, och "Inga produkter kopplade" visas.

## Åtgärd (2 steg)

### Steg 1: Fixa edge function

Lägg till `organization_id` i `ProductData`-interfacet och på alla ställen som bygger `productData`:

- **Interface** (rad ~501): Lägg till `organization_id: string`
- **Product Recovery path** (rad ~1705): Lägg till `organization_id: organizationId`
- **Merge/upsert path** (rad ~2188): Lägg till `organization_id: organizationId`
- **Package component expansion** (`expandPackageComponents`, rad ~882): Funktionen behöver ta emot `orgId` som parameter och sätta det på `componentData`

Totalt 4 inserts/updates + 1 function signature att uppdatera.

### Steg 2: Fixa befintlig data

Kör en SQL-migration som sätter rätt `organization_id` på alla `booking_products` genom att kopiera den från respektive `bookings`-rad:

```sql
UPDATE booking_products bp
SET organization_id = b.organization_id
FROM bookings b
WHERE b.id = bp.booking_id
  AND bp.organization_id != b.organization_id;
```

Detta fixar alla 445 felaktiga rader direkt.

## Vad som INTE ändras

- Ingen frontend-ändring behövs — `ProjectProductsList` fungerar korrekt, den blockeras bara av RLS
- Inga nya tabeller eller kolumner
- Andra tabeller (calendar_events, booking_attachments, packing_projects, etc.) sätter redan `organization_id` korrekt i import-funktionen

