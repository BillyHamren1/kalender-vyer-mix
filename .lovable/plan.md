

## Buggfix: Paketkomponenter sparas inte och synkas inte till packlistan

### Problemanalys

Jag har gjort en grundlig undersökning och hittat **tre separata buggar** som samverkar:

#### Bugg 1: Recovery-logiken missar oexpanderade paketkomponenter
Booking 2602-4 importerades *innan* expansionslogiken lades till. Vid efterfoljande synkar kontrollerar recovery-koden:
- "Har externa fler produkter an lokala?" -- Nej, bada har 3 (Multiflex + 2 tillbehor)
- "Saknas inventory_package_id?" -- Nej, den finns redan

**Men den kontrollerar aldrig**: "Har en produkt `package_components` JSONB med 10 komponenter som inte ar expanderade till egna rader?"

Darfor skippas bokningen som "unchanged" varje gang.

#### Bugg 2: Recovery-pathen saknar expansionslogik
Aven om recovery triggas (rader 1198-1361) innehaller den INTE koden for att expandera `package_components` JSONB till egna rader (rader 1808-1888). Den koden finns bara i huvudflödet.

#### Bugg 3: Packlistan synkas inte efter expansion
Nar nya `booking_products`-rader skapas via expansion, skapas inga motsvarande `packing_list_items`. Packlistan visar bara de 3 ursprungliga produkterna.

### Aktuellt tillstand i databasen (2602-4)

```text
booking_products (3 rader):
  - Multiflex 6x15        (package_components JSONB med 10 komponenter)
  - ↳ Kassetgolv 6x15     (tillbehor)
  - ↳ Nalfiltsmatta        (tillbehor)

packing_list_items (3 rader):
  - Matchar ovanstaende 3 produkter

Forväntat (13 rader):
  - Multiflex 6x15
  - -- M Ben (x12)
  - -- M Takbalk ROD (x6)
  - -- M Gavelror ROD (x4)
  - -- M Mittstolpe ROD (x2)
  - -- M Sidoror (x10)
  - -- M Krysstag (x2)
  - -- M Knoppstag (x10)
  - -- M Mellanstag (x5)
  - -- M Snabblas (x18)
  - -- M Takbalk med nock ROD (x6)
  - ↳ Kassetgolv 6x15
  - ↳ Nalfiltsmatta - Antracit, 6x15
```

### Losning

#### Steg 1: Ny recovery-villkor i `import-bookings`
Lagga till en kontroll i recovery-logiken (runt rad 1107-1154): "Om nagon `booking_product` har `package_components` JSONB men inga rader med `is_package_component: true` finns, trigga recovery."

#### Steg 2: Flytta expansionslogiken till en delad funktion
Extrahera koden pa rader 1808-1888 (package_components JSONB-expansion) till en egen funktion `expandPackageComponents()` som kan anropas fran bade:
- Huvudflödet (nuvarande plats)
- Recovery-pathen (rader 1198-1361)

#### Steg 3: Synka packlistan efter expansion
Efter att nya `booking_products`-rader skapats via expansion, kontrollera om det finns en `packing_project` for bokningen och skapa `packing_list_items` for de nya komponenterna.

#### Steg 4: Testa med en forcerad re-import
Trigga en sync som tvingar 2602-4 att ga igenom recovery-pathen sa att de 10 komponenterna expanderas och synkas till packlistan.

### Teknisk implementation

**Fil: `supabase/functions/import-bookings/index.ts`**

1. **Ny funktion** `expandPackageComponents(supabase, bookingId, externalProducts, externalIdToInternalId)` som kapslar in rader 1808-1888

2. **Nytt recovery-villkor** (efter rad 1153):
```typescript
// Check if package_components JSONB exists but hasn't been expanded
if (!needsProductRecovery && existingProducts.length > 0) {
  const productsWithComponents = existingProducts.filter(
    (p: any) => p.package_components !== null
  );
  if (productsWithComponents.length > 0) {
    const expandedComponents = existingProducts.filter(
      (p: any) => p.is_package_component === true
    );
    if (expandedComponents.length === 0) {
      needsProductRecovery = true;
      console.log(`Booking has ${productsWithComponents.length} products with package_components JSONB but 0 expanded component rows - will recover`);
    }
  }
}
```

3. **Recovery-pathen** (rader 1198-1361): Lagga till anrop till `expandPackageComponents()` efter product-inserten

4. **Packing sync efter expansion**: I bade recovery- och huvudflödet, efter expansion:
```typescript
// Sync packing list items for newly expanded components
const { data: packingProject } = await supabase
  .from('packing_projects')
  .select('id')
  .eq('booking_id', bookingId)
  .maybeSingle();

if (packingProject) {
  // Fetch all booking products and existing packing items
  // Add missing items for expanded components
}
```

5. **Select-fraltet i recovery** (rad 1110) maste utökas for att inkludera `package_components`:
```typescript
.select('id, parent_product_id, parent_package_id, is_package_component, name, vat_rate, inventory_package_id, package_components')
```

### Filer som andras

| Fil | Typ av andring |
|-----|----------------|
| `supabase/functions/import-bookings/index.ts` | Ny funktion, ny recovery-villkor, packing-sync |

### Efter deployment

Jag trigger en forcerad sync av bokning 2602-4 for att verifiera att:
- 10 paketkomponenter expanderas till `booking_products`
- Motsvarande `packing_list_items` skapas
- Packlistan visar alla 13 rader korrekt

