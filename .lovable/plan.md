

# Fix: Hantera batch-responsformat från allocate-instance korrekt

## Problem
Det externa lagersystemet returnerar HTTP 200 med en `results`-array, t.ex.:
```json
{
  "results": [
    { "serial_number": "3204", "success": true, "sku": "PROD-123", "item_type_id": "..." },
    { "serial_number": "3208", "success": false, "error": "Instance not found" }
  ]
}
```

Koden förväntar sig `allocateData.sku` (toppnivå, rad 308). Eftersom det inte finns returneras alltid felet "Lagersystemet returnerade ingen artikeltyp" — även när allokeringen faktiskt lyckades för det aktuella serienumret.

## Lösning

Ändra rad 307-313 i `supabase/functions/scanner-api/index.ts`:

**Nuvarande:**
```typescript
const allocateData = (() => { try { return JSON.parse(responseText) } catch { return {} } })()
const returnedSku = allocateData.sku
if (!returnedSku) {
  console.error('Inventory API returned no SKU:', allocateData)
  return json({ success: false, error: 'Lagersystemet returnerade ingen artikeltyp' })
}
```

**Nytt:**
```typescript
const allocateData = (() => { try { return JSON.parse(responseText) } catch { return {} } })()

// Handle batch response format: { results: [{ serial_number, success, sku, error }] }
let returnedSku = allocateData.sku
if (!returnedSku && Array.isArray(allocateData.results)) {
  const myResult = allocateData.results.find(
    (r: any) => r.serial_number === serialNumber
  )
  if (myResult) {
    if (!myResult.success) {
      console.warn('[allocate-instance] Allokering misslyckades:', myResult.error)
      return json({ success: false, error: myResult.error || 'Allokering misslyckades i lagersystemet' })
    }
    returnedSku = myResult.sku || myResult.item_type_id
  }
}

if (!returnedSku) {
  console.error('Inventory API returned no SKU:', allocateData)
  return json({ success: false, error: 'Lagersystemet returnerade ingen artikeltyp' })
}
```

Resten av flödet (rad 315+) är oförändrat — SKU matchas mot packlistan och avbockning sker som vanligt.

## Resultat
- Lyckade allokeringar → SKU extraheras → produkten bockas av i packlistan
- Misslyckade allokeringar → specifikt felmeddelande visas (t.ex. "Instance not found")
- Blandade svar hanteras per serienummer

## Fil som ändras
1. `supabase/functions/scanner-api/index.ts` — Parsa `results`-array istället för att förvänta sig toppnivå-`sku`

