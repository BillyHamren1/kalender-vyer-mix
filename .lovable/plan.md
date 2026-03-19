

# Fix: Batch serial number matching i scanner-api

## Problem

Loggarna visar att `"Inventory API returned no SKU"` fortfarande triggas. Orsaken:

- `serialNumber` (rad 225) kan vara en **batch-sträng med radbrytningar**: `"FACE...3205\nFACE...3209\nFACE...3207"`
- Allocate-instance returnerar en `results[]`-array med individuella `serial_number`-värden
- Rad 315: `r.serial_number === serialNumber` jämför mot **hela batch-strängen** → ingen match → `myResult` = undefined → faller igenom till "no SKU"

Dessutom: även vid lyckad batch returneras **flera resultat**, men koden försöker bara matcha ETT. Den behöver hantera **alla** resultat i batch-svaret.

## Lösning

Ändra rad 309-363 i `scanner-api/index.ts` till att:

1. **Splitta `serialNumber`** till en array av individuella serienummer
2. **Iterera alla results** istället för att bara hitta en
3. **Samla ihop SKU:er** från lyckade allokeringar
4. **Samla "redan allokerade"** separat
5. **Returnera rätt svar** beroende på utfallet

```typescript
// Split batch serial numbers
const serialNumbers = serialNumber.split('\n').map((s: string) => s.trim()).filter(Boolean)

let returnedSku = allocateData.sku
const alreadyAllocatedSerials: string[] = []
const failedSerials: string[] = []

if (!returnedSku && Array.isArray(allocateData.results)) {
  for (const r of allocateData.results) {
    if (!serialNumbers.includes(r.serial_number)) continue
    
    if (r.data?.already_allocated || r.data?.over_allocated) {
      alreadyAllocatedSerials.push(r.serial_number)
      // Still grab SKU if available for local check-off
      if (!returnedSku) returnedSku = r.data?.sku || r.data?.item_type_id
      continue
    }
    if (!r.success) {
      failedSerials.push(r.serial_number)
      continue
    }
    // Successful allocation — grab SKU
    if (!returnedSku) {
      returnedSku = r.data?.sku || r.data?.item_type_id || r.sku
    }
  }
  
  // If ALL were already allocated and no SKU found
  if (!returnedSku && alreadyAllocatedSerials.length > 0 && failedSerials.length === 0) {
    const shortNrs = alreadyAllocatedSerials.map(s => s.replace(/^FACE\d{16}/, '').replace(/^0+/, '') || s)
    return json({ 
      success: false, 
      error: `Nr ${shortNrs.join(', ')} är redan scannad/allokerad`, 
      alreadyScanned: true 
    })
  }
}

// Format B: Single-item (keep as-is)
if (!returnedSku && !Array.isArray(allocateData.results)) {
  // ... existing single-item logic unchanged
}
```

## Fil som ändras
1. `supabase/functions/scanner-api/index.ts` — Fixa batch-matchning i results-arrayen

