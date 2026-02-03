
# Fixplan: Återställ paketmedlemmar i packlistan

## Problem-analys

### Huvudproblem: Felaktig grupperings-nyckel
I `usePackingList.tsx` (rad 93-98) grupperas paketkomponenter efter `parent_package_id`:

```typescript
if (isPackageComponent && parentPackageId) {
  if (!packageComponentsByParent[parentPackageId]) {
    packageComponentsByParent[parentPackageId] = [];
  }
  packageComponentsByParent[parentPackageId].push(item);
}
```

**Problemet:** `parent_package_id` innehåller det **externa API-ID:t** (t.ex. `5dde8204-24ed-4c1e-9aeb-f3e360f398c9`), INTE det interna databas-ID:t. När koden sedan försöker hämta komponenter via `packageComponentsByParent[main.product.id]` (rad 117-118) hittas inget, eftersom `main.product.id` är det interna ID:t.

### Databasbekräftelse
Jag verifierade att databasen är korrekt:
- Paketkomponenter har `parent_product_id` som pekar på sin förälder (t.ex. "M Knoppstag" → "Multiflex 8x6")  
- `parent_package_id` innehåller externa ID:n som INTE matchar några interna produkt-ID:n

### Rad-flimmer
Orsakas troligen av att React Query kör flera gånger med olika data-tillstånd, i kombination med att sorteringslogiken ger inkonsekventa resultat.

---

## Ändringar

### 1. Fixa sorteringsfunktionen i usePackingList.tsx

**Fil:** `src/hooks/usePackingList.tsx`

**Ändring:** Ta bort separat hantering av paketkomponenter och använd ENDAST `parent_product_id` för ALLA barn-produkter (både tillbehör och komponenter).

Före (rad 82-128):
```typescript
const sortPackingListItems = (items: PackingListItem[]): PackingListItem[] => {
  const mainProducts: PackingListItem[] = [];
  const accessoriesByParent: Record<string, PackingListItem[]> = {};
  const packageComponentsByParent: Record<string, PackingListItem[]> = {};

  items.forEach(item => {
    const parentId = item.product?.parent_product_id;
    const isPackageComponent = item.product?.is_package_component;
    const parentPackageId = item.product?.parent_package_id;

    if (isPackageComponent && parentPackageId) {
      // Package component - group by parent_package_id  ← FEL!
      ...
    }
  });
  ...
};
```

Efter:
```typescript
const sortPackingListItems = (items: PackingListItem[]): PackingListItem[] => {
  const mainProducts: PackingListItem[] = [];
  const childrenByParent: Record<string, PackingListItem[]> = {};

  items.forEach(item => {
    // Use parent_product_id for ALL child items (accessories + components)
    const parentId = item.product?.parent_product_id;

    if (parentId) {
      if (!childrenByParent[parentId]) {
        childrenByParent[parentId] = [];
      }
      childrenByParent[parentId].push(item);
    } else {
      mainProducts.push(item);
    }
  });

  // Build sorted list
  const sorted: PackingListItem[] = [];
  mainProducts.forEach(main => {
    sorted.push(main);
    if (main.product && childrenByParent[main.product.id]) {
      sorted.push(...childrenByParent[main.product.id]);
    }
  });

  return sorted;
};
```

### 2. Lägg till stale-time för att minska flimmer

**Fil:** `src/hooks/usePackingList.tsx`

Lägg till `staleTime` i query-konfigurationen för att förhindra onödiga omhämtningar:

```typescript
const { data: items = [], isLoading: isLoadingItems } = useQuery({
  queryKey: ['packing-list-items', packingId],
  queryFn: () => fetchPackingListItems(packingId, packing?.booking_id || null),
  enabled: !!packingId && !!packing?.booking_id,  // Kräv booking_id
  staleTime: 30000,  // 30 sekunder
});
```

---

## Teknisk sammanfattning

| Fil | Ändring |
|-----|---------|
| `src/hooks/usePackingList.tsx` | Förenkla `sortPackingListItems` att använda endast `parent_product_id` |
| `src/hooks/usePackingList.tsx` | Lägg till `staleTime` och förbättra `enabled`-villkor |

## Förväntat resultat

Efter ändringen kommer packlistan att:
1. Visa alla paketmedlemmar (⦿) indenterade under sina föräldrapaket
2. Visa tillbehör (↳) indenterade under sina föräldrarprodukter  
3. Inte flimra vid uppdateringar
