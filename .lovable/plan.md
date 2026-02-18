
## Rotorsaken

Importen i `import-bookings` edge-funktionen kör `DELETE + INSERT` för produkter när `needsProductUpdate = true`. Under de millisekunder som DELETE körs men INSERT inte är klar visas produktlistan som tom (eller delvis inskriven). Om bakgrundsimporten (`useBackgroundImport`) triggar en ny körning under detta fönster ser den en "förändring" (produkter saknas eller är ofullständiga) och startar EN TILL DELETE+INSERT-cykel — vilket skapar ett race condition som kan resultera i dubbletter eller varierande antal produkter.

Bevis: Tre på varandra följande DB-queries returnerade tre olika ID:n för "Multiflex 10x21" — `2ac03af4`, `1362a9a1`, `effde116` — vilket visar att produkterna skapas om och om igen.

## Lösningen: UPSERT istället för DELETE + INSERT

Istället för att ta bort alla produkter och skriva in dem på nytt ska vi använda en **UPSERT-strategi baserad på ett deterministiskt, stabilt ID** som genereras från `booking_id + sort_index` (eller `booking_id + name`). På så sätt:

1. Inga gamla rader raderas
2. Befintliga rader uppdateras in-place
3. Rader som inte längre finns i API-svaret raderas selektivt
4. Inga race conditions eftersom det aldrig uppstår ett tomt tillstånd

## Teknisk implementering

### Strategi: Stable UUID från `booking_id + sort_index`

Generera ett deterministiskt UUID för varje produkt baserat på `booking_id` + `sort_index`. Vi kan använda en enkel hash-funktion. Postgres stöder `gen_random_uuid()` men för deterministiska ID:n behöver vi en namngiven UUID (UUID v5/namespace), eller alternativt använda `name`-fältet som nyckel.

**Enklast och säkrast**: Behåll befintliga `id` oförändrade vid re-import. Istället för `DELETE + INSERT` gör vi:

1. Hämta befintliga produkter med deras `id`
2. För varje extern produkt: matcha mot befintlig via `name` (trimmat + lowercase)
3. `UPDATE` om match hittas (samma `id` behålls)
4. `INSERT` om ingen match finns
5. `DELETE` de som finns i DB men inte i externt API

### Filer att ändra

**`supabase/functions/import-bookings/index.ts`** — ersätt DELETE+INSERT-blocket (runt rad 2024-2066) med en merge-funktion som:

```
mergeProducts(supabase, bookingId, externalProducts, existingProducts):
  existingByName = Map<name → {id, ...}>
  
  toInsert = []
  toUpdate = []  
  seenIds  = Set()
  
  for each externalProduct:
    match = existingByName[externalProduct.name]
    if match:
      toUpdate.push({id: match.id, ...newData})
      seenIds.add(match.id)
    else:
      toInsert.push({...newData})
  
  toDelete = existingProducts.filter(p => !seenIds.has(p.id))
  
  if toDelete.length: DELETE WHERE id IN (toDelete ids)
  if toUpdate.length: UPDATE each row individually  
  if toInsert.length: INSERT batch
```

### Varför detta löser problemet

- **Inga race conditions**: Det finns aldrig ett tillstånd där tabellen är tom för en bokning
- **Stabila ID:n**: Samma produkt behåller sitt `id` mellan importer, vilket betyder att `packing_list_items`-kopplingar inte bryts (bonus: `reconnectPackingListItems`-logiken kan förenklas)
- **Idempotent**: Om importen körs 10 gånger i rad med samma data händer ingenting

### Filer

| Fil | Ändring |
|---|---|
| `supabase/functions/import-bookings/index.ts` | Ersätt DELETE+INSERT (~rad 2024-2066) med merge-logik |
