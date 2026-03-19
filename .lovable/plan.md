

# Fix: Hantera alla responsformat från allocate-instance

## Problem (från loggarna)

Tre responsformat som inte hanteras korrekt:

### Format 1: Batch med SKU i `data`
```json
{ "results": [{ "serial_number": "3207", "success": true, "data": { "sku": "MTR-5M-12", "item_type": "..." } }] }
```
Koden letar `myResult.sku` — ska vara `myResult.data?.sku`.

### Format 2: "Already allocated" (success=true, ingen SKU)
```json
{ "results": [{ "serial_number": "3204", "success": true, "data": { "already_allocated": true, "message": "Already scanned for this booking" } }] }
```
Inga SKU-fält alls. Ska returnera `alreadyScanned: true`.

### Format 3: Enskilt svar utan `results`-array
```json
{ "success": true, "data": { "already_allocated": true, "instance_id": "..." } }
```
Samt:
```json
{ "success": false, "error": "All matching lines fully allocated", "data": { "item_type_id": "..." } }
```
Ingen `results`-array — faller igenom till "no SKU"-felet.

## Lösning

Ändra rad 309-332 i `supabase/functions/scanner-api/index.ts`:

```typescript
let returnedSku = allocateData.sku

// Format A: Batch response with results array
if (!returnedSku && Array.isArray(allocateData.results)) {
  const myResult = allocateData.results.find(
    (r: any) => r.serial_number === serialNumber
  )
  if (myResult) {
    if (myResult.data?.already_allocated) {
      return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
    }
    if (!myResult.success) {
      const isAlreadyAllocated = (myResult.error || '').toLowerCase().includes('fully allocated')
      if (isAlreadyAllocated) {
        returnedSku = myResult.data?.item_type_id || myResult.data?.sku
        if (!returnedSku) {
          return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
        }
        // Fall through — use returnedSku to check off locally
      } else {
        return json({ success: false, error: myResult.error || 'Allokering misslyckades' })
      }
    } else {
      returnedSku = myResult.data?.sku || myResult.data?.item_type_id || myResult.sku || myResult.item_type_id
    }
  }
}

// Format B: Single-item response (no results array)
if (!returnedSku && !Array.isArray(allocateData.results)) {
  if (allocateData.data?.already_allocated) {
    return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
  }
  const isFullyAllocated = (allocateData.error || '').toLowerCase().includes('fully allocated')
  if (isFullyAllocated) {
    returnedSku = allocateData.data?.item_type_id || allocateData.data?.sku
    if (!returnedSku) {
      return json({ success: false, error: `Nr ${serialNumber} är redan scannad/allokerad`, alreadyScanned: true })
    }
  }
  if (!returnedSku) {
    returnedSku = allocateData.data?.sku || allocateData.data?.item_type_id
  }
}

if (!returnedSku) {
  console.error('Inventory API returned no SKU:', allocateData)
  return json({ success: false, error: 'Lagersystemet returnerade ingen artikeltyp' })
}
```

## Resultat
- Lyckad allokering → `data.sku` extraheras → avbockning
- "Already allocated" (success:true) → "redan scannad" meddelande, ingen toast
- "Fully allocated" (success:false) med `item_type_id` → extraheras, avbockning sker
- "Fully allocated" utan `item_type_id` → "redan scannad" meddelande
- "Instance not found" → felmeddelande som förut
- Enskilt svar utan `results`-array → hanteras korrekt

## Viktig notering om `item_type_id`
När "fully allocated" returnerar en `item_type_id` (UUID) — matchar detta mot `booking_products.inventory_item_type_id`, inte `sku`. Det behöver **inte** ändras om den befintliga matchningen (rad 343-344) redan jämför mot SKU-strängen "MTR-5M-12" (som kommer från `data.sku`). Men om `item_type_id` (UUID) är det enda tillgängliga, behöver matchningen på rad 344 utökas till att även jämföra mot `booking_products.inventory_item_type_id`.

## Fil som ändras
1. `supabase/functions/scanner-api/index.ts` — Hantera alla tre responsformat korrekt

