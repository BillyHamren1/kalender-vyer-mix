# Fix: "Skapa lagerprojekt" misslyckas med "Packing items missing after sync"

## Rotorsak (verifierad mot DB)

Bokningen `KMK / 2604-126` har **5 duplicerade `packing_projects`-rader** kopplade till samma `booking_id` (samma org, alla `large_project_id = NULL`). Bara den första har items (19 st), de andra fyra är tomma.

Flödet i `convertInboxItemToWarehouseProject` (`src/services/warehouseProjectService.ts`) gör:

1. `supabase.from('packing_projects').select('id').eq('booking_id', …).is('large_project_id', null).maybeSingle()` → **returnerar `null`** när det finns >1 rad (PostgREST `PGRST116`, felet sväljs eftersom vi inte läser `error`).
2. Eftersom inget hittas skapas en **6:e tom `packing_projects`**.
3. `syncBookingToPacking(bookingId, orgId, { throwOnError: true })` anropas **utan `targetPackingId`**.
4. Edge-funktionen `sync-booking-to-packing` gör samma `.maybeSingle()`-lookup → väljer en av de gamla raderna (eller skapar ännu en) och skriver items dit.
5. Klient-koden räknar items för den nyligen skapade tomma `packingId` → 0 → kastar `"Packing items missing after sync — aborting to avoid empty packlista"`.

Det är därför vissa projekt fungerar (1 packing_project ⇒ `.maybeSingle()` löser ut korrekt) och andra inte (≥2 ⇒ alltid null).

## Lösning

Tre lager — alla behövs för att förebygga och läka detta.

### 1. Klient: hantera duplikat och tvinga sync till rätt rad
`src/services/warehouseProjectService.ts` (booking-grenen kring rad 300–363):

- Byt `.maybeSingle()` mot `.order('created_at', { ascending: true }).limit(50)` och välj kanonisk rad enligt prioritet:
  1. Den med flest `packing_list_items` (joinad count).
  2. Vid tie: äldsta `created_at`.
- Om flera hittas: behåll kanonisk, **mjuk-merga** övriga genom att uppdatera deras `warehouse_project_id` till `NULL` och flagga `status='cancelled'` (eller hård-radera om de saknar items, scans och allokeringar — säkert via separat helper).
- Anropa `syncBookingToPacking(bookingId, orgId, { throwOnError: true, targetPackingId: canonicalId })` så edge-funktionen tvingas skriva items till rätt rad.
- Verify-stegets `itemCount` läses därefter mot **samma `canonicalId`**.

Samma mönster appliceras i large-project-grenen (rad 384–469) som har identisk bugg (`.maybeSingle()` på `large_project_id`).

### 2. Edge function: skydda mot framtida duplikat
`supabase/functions/sync-booking-to-packing/index.ts` rad 177–184:

- Byt `.maybeSingle()` mot deterministiskt val (count desc, created_at asc, limit 1).
- När fler än en rad upptäcks: logga varning `[sync-booking-to-packing] Duplicate packing_projects detected for booking …` så att vi kan följa upp i Edge Function Logs.

### 3. Engångs-städmigration
Ny migration `clean_duplicate_packing_projects.sql`:

```sql
-- För varje (booking_id, organization_id) där large_project_id IS NULL
-- och rad-count > 1: behåll raden med flest packing_list_items
-- (tie-break: äldsta created_at). Övriga sätts till status='cancelled'
-- och warehouse_project_id=NULL så de döljs ur inkorgsflödet men
-- bevaras för audit. Hård radering görs INTE (FK-risker mot scans).
```

Migrationen är idempotent och säker att köra om.

## Tekniska detaljer

- **Filer som ändras**:
  - `src/services/warehouseProjectService.ts` (booking- och large-project-grenarna)
  - `supabase/functions/sync-booking-to-packing/index.ts` (lookup-logik + varningslogg)
  - Ny: `supabase/migrations/<timestamp>_dedupe_packing_projects.sql`
  - Liten helper: `src/services/packing/resolveCanonicalPacking.ts` för att återanvända "välj kanonisk + soft-cancel duplicates"-logiken (även framtida bruk i `IncomingPackingList` etc.).

- **Bevaras**: Inga items, scans eller allokeringar raderas. Endast metadata på tomma duplicate-rader uppdateras.

- **Ingen schemaförändring** — `packing_projects` saknar idag unique constraint på `(booking_id, organization_id) WHERE large_project_id IS NULL`. Vi lägger **inte** till en sådan i denna PR (existerande historisk data kan ha legitima edge cases från large-project-omkopplingar). Vi loggar istället varningar och låter städmigrationen + deterministisk lookup räcka.

## Verifiering efter fix

1. Kör städmigrationen → `KMK`-bokningen får 1 aktiv packing_project (den med 19 items).
2. Klicka "Skapa lagerprojekt" på KMK i inkorgen → skapas utan fel, lagerprojektet pekar på samma packing_project (19 items synliga).
3. Lägg till en produkt på bokningen → resync → items hamnar i kanonisk rad.
4. Edge Function Logs ska inte visa "Duplicate packing_projects detected" för normala bokningar.
