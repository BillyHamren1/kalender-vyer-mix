

## Problem: Saknad `organization_id` i interna inserts

Problemet är **internt i planning-systemet** — inte en skillnad mellan booking och planning. Det externa bokningssystemet skickar korrekt `organization_id` (`f5e5cade...`) i varje webhook-anrop, och edge-funktionen `import-bookings` tar emot och validerar det. Men sedan **glömmer flera insert/upsert-operationer att inkludera `organization_id`** i sin data.

### Varför det kraschar

Edge functions körs med `service_role` som kringgår RLS. Det betyder att `auth.uid()` är `null`. Databas-triggern `set_organization_id()` försöker fylla i `organization_id` om det saknas, men eftersom det inte finns någon autentiserad användare kastar den felet:

> `organization_id is required and could not be resolved from auth context`

### Berörda ställen i `import-bookings/index.ts`

| Operation | Rad(er) | Saknar `organization_id` |
|---|---|---|
| `sync_state` upsert (start) | ~1042 | Ja |
| `sync_state` upsert (slut) | ~2627 | Ja |
| `packing_list_items` insert (syncPackingListAfterExpansion) | ~963-968 | Ja |
| `packing_list_items` insert (reconnect nya produkter) | ~2364-2369 | Ja |

### Fix

Lägg till `organization_id: organizationId` i alla fyra ställen. `organizationId` finns redan som variabel i scope — det är bara att inkludera det i objekten.

**Fil att ändra:** `supabase/functions/import-bookings/index.ts`

1. **Rad ~1042**: Lägg till `organization_id: organizationId` i sync_state upsert-objektet
2. **Rad ~2627**: Samma sak i slutgiltig sync_state upsert
3. **Rad ~963-968**: Lägg till `organization_id: orgId` i `newItems`-map:en för packing_list_items
4. **Rad ~2364-2369**: Lägg till `organization_id: organizationId` i `newPackingItems`-map:en

Sedan deploy edge function.

