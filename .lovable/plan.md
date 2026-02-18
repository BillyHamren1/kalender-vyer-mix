
## Två separata problem att lösa

### Problem 1: Dubbla produkter i databasen

Databasen innehåller faktiskt DUBBLA rader för samma produkter:
- `79a55b0d` — Multiflex 10x21 (med barn: Kassetgolv, M Ben, M Gavelrör osv.)
- `8747cd38` — Multiflex 10x21 (duplikat, med egna barn)
- `46628450` — Kranbil stor m kran m jibb 20m
- `681342a9` — Kranbil stor m kran m jibb 20m (duplikat)

Detta är ett **importproblem** — importen har kört dubbelt och skapat duplicat-rader. Duplicaterna måste rensas bort från databasen.

SQL att köra (tar bort de senast skapade duplicaten, behåller originalen):
```sql
-- Ta bort dubbletter och deras barn
DELETE FROM booking_products 
WHERE id IN (
  '8747cd38-8407-4dd3-938a-78fbb20539e6',  -- Multiflex duplikat
  '681342a9-c6f1-4594-87a2-bdc66f229083'   -- Kranbil duplikat
)
OR parent_product_id IN (
  '8747cd38-8407-4dd3-938a-78fbb20539e6'   -- Barn till Multiflex duplikat
);
```

Dessa IDs är säkra att ta bort — de är exakta kopior av `79a55b0d` (Multiflex original) och `46628450` (Kranbil original).

### Problem 2: Kassetgolv visas inte — grupperingslogiken är fel

Koden i `ProductCostsCard.tsx` identifierar barnprodukter via **namnprefix** (↳, --, mellanslag) men databasen har redan korrekt `parent_product_id`-relation som aldrig används. Eftersom barnprodukter kan ha namn som "Kassetgolv 10x21" (utan prefix) missar grupperingslogiken dem.

Lösningen: Använd `parent_product_id` från databasen istället för namnheuristik.

### Vad som ändras

**Steg 1: Städa databasen** (SQL-köring — inga kodfiler)
Ge användaren SQL att köra i Supabase för att ta bort de 2 duplikat-raderna och deras barn.

**Steg 2: Uppdatera `productCostService.ts`**
- Hämta `parent_product_id` i SELECT-queryn
- Lägg till `parentProductId` i `ProductCostData`-interfacet
- Returnera det i mappningen

**Steg 3: Uppdatera `ProductCostsCard.tsx`**
Ersätt den naiva namnbaserade grupperingen med en korrekt `parent_product_id`-baserad gruppering:

```typescript
// Nuvarande (fel) — baseras på namnprefix:
const isChild = (name: string) => /^\s{2,}/.test(name) || /^[↳└]/.test(name.trim());

// Ny (korrekt) — baseras på parent_product_id:
const parents = products.filter(p => !p.parentProductId);
const groups = parents.map(parent => ({
  parent,
  children: products.filter(p => p.parentProductId === parent.id)
}));
```

Dessutom: barnrader visas **alltid** expanderade som standard (inte kollapsade) för att Kassetgolv och andra underprodukter är viktiga att se direkt.

### Filer att ändra

| Fil | Vad som ändras |
|-----|----------------|
| `src/services/productCostService.ts` | Hämta `parent_product_id`, lägg till i interface och mappning |
| `src/components/project/ProductCostsCard.tsx` | Använd `parentProductId` för gruppering istället för namnheuristik |

### SQL att köra i Supabase (Test-miljön)
Användaren behöver köra detta i Cloud View > Run SQL:
```sql
DELETE FROM booking_products 
WHERE id IN (
  '8747cd38-8407-4dd3-938a-78fbb20539e6',
  '681342a9-c6f1-4594-87a2-bdc66f229083'
)
OR parent_product_id IN (
  '8747cd38-8407-4dd3-938a-78fbb20539e6'
);
```

### Importfelet — förhindra framtida duplicat
Importen skapar duplicat eftersom det saknas en `ON CONFLICT`-hantering för `booking_products`. Det bör också fixas i edge-funktionen, men det är ett separat steg.
