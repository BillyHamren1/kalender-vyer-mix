
## Rotorsak

I `supabase/functions/import-bookings/index.ts` finns en scope-bugg: variabeln `seenExistingIds` deklareras på rad 2113 **inuti** ett block, men refereras på rad 2270 **utanför** det blocket. Detta kastar ett `ReferenceError: seenExistingIds is not defined` för alla bokningar som behöver produktuppdatering, vilket innebär att try-catch fångar felet och hoppar vidare — **`syncAllAttachments` anropas aldrig** och inga bilder importeras.

## Vad som behöver fixas

### 1. Flytta `seenExistingIds` till rätt scope

`seenExistingIds` måste deklareras på samma nivå som `oldProducts` (som redan deklareras utanför blocket på rad ~1201), så att den är tillgänglig när produkter raderas på rad 2270.

Aktuell felaktig struktur (förenklad):
```
let oldProducts: any[] | null = null;  // rad ~1201 — korrekt scope

if (needsProductUpdate || !existingBooking) {
  // ... deduplication-kod ...
  const seenExistingIds = new Set<string>();  // rad 2113 — FEL: lokal scope
  
  for (const product of deduplicatedProducts) {
    seenExistingIds.add(...);  // används här
  }
}

// ── DELETE products ──
const toDelete = oldProducts.filter(p => !seenExistingIds.has(p.id));  // rad 2270 — KRASCHAR: seenExistingIds okänd här
```

Fix: deklarera `seenExistingIds` vid sidan av `oldProducts`, ovanför if-blocket:
```
let oldProducts: any[] | null = null;
const seenExistingIds = new Set<string>();  // flytta hit
```

### 2. Tekniska steg

| Fil | Ändring |
|---|---|
| `supabase/functions/import-bookings/index.ts` | Flytta `const seenExistingIds = new Set<string>()` från rad 2113 till rad ~1201 (bredvid `let oldProducts`) |

### 3. Driftsättning

Edge-funktionen driftsätts automatiskt efter kodändringen.

### Förväntat resultat

- `seenExistingIds is not defined`-felet försvinner
- Produkter uppdateras korrekt (befintliga uppdateras in-place, borttagna raderas)
- `syncAllAttachments` anropas och bilder (tältbilder, situationsplaner, produktbilder) importeras till `booking_attachments`
- Knappen "Uppdatera bokning" på projektsidan synkar bilder korrekt
