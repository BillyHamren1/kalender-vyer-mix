

# Fix: Scanner fungerar inte utan inloggning

## Problem
Scannern (`/scanner`) kräver ingen inloggning, men alla databasanrop görs med Supabase-klienten som **anonym användare**. RLS-policyer kräver `organization_id`-matchning via `auth.uid()`, vilket returnerar `null` för anonyma användare — alltså blockeras all data.

## Lösning: Edge Function som proxy

Skapa en edge function `scanner-api` som använder `service_role`-nyckeln internt och hanterar alla scanner-operationer. Scannern anropar edge-funktionen istället för direkt mot databasen.

Detta är säkrare än att öppna RLS för anonyma användare, eftersom vi kan:
- Begränsa vilka operationer som är tillåtna
- Hardkoda organization_id (Frans August) eller kräva det som parameter
- Logga alla anrop

### Endpoints i edge function

```
POST /scanner-api
{
  "action": "list_active_packings",     // GET packing_projects + bookings
  "action": "get_packing_items",        // GET items för ett packing_id
  "action": "verify_product",           // UPDATE packing_list_items
  "action": "toggle_item",              // UPDATE packing_list_items
  "action": "decrement_item",           // UPDATE packing_list_items
  "action": "create_parcel",            // INSERT packing_parcels
  "action": "assign_item_to_parcel",    // UPDATE packing_list_items
  "action": "get_parcels",              // GET packing_parcels
  "action": "get_item_parcels",         // GET packing_list_items + parcels
  "action": "sign_packing",             // UPDATE packing_projects
  "action": "get_progress"              // GET packing_list_items
}
```

### Ändringar

1. **Ny edge function**: `supabase/functions/scanner-api/index.ts`
   - Tar emot `action` + parametrar
   - Använder `createClient` med `SUPABASE_SERVICE_ROLE_KEY`
   - Filtrerar alltid på Frans Augusts `organization_id`
   - Ingen auth krävs (publik endpoint)

2. **Uppdatera `scannerService.ts`**
   - Byt alla `supabase.from(...)` anrop till `fetch` mot edge function
   - Samma returtyper, ingen ändring i komponenter

3. **Config**: `verify_jwt = false` i `supabase/config.toml`

### Säkerhet
- Edge function filtrerar på `organization_id` server-side
- Bara specifika operationer exponeras
- Ingen känslig data (inga lösenord, personuppgifter) exponeras
- Kan lägga till en enkel API-nyckel om önskat

