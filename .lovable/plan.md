
# Plan: Sortera tillbehör sist inom varje produktgrupp

## Problem

Du vill att i packlistan:
1. Paketmedlemmar och tillbehör grupperas under samma förälder (detta fungerar redan)
2. **Tillbehör ska alltid visas längst ner** i varje grupp (efter paketmedlemmarna)

## Nuvarande beteende

Barn-produkter läggs till i den ordning de hämtas från databasen, utan intern sortering.

## Lösning

Uppdatera sorteringsfunktionen så att inom varje grupp av barn:
- **Paketmedlemmar** (`is_package_component: true`) visas först
- **Tillbehör** (identifieras via namnprefix) visas sist

---

## Teknisk ändring

**Fil:** `src/hooks/usePackingList.tsx`

Lägg till en hjälpfunktion för att identifiera tillbehör och sortera barnen innan de läggs till i resultatet:

```typescript
// Hjälpfunktion för att identifiera tillbehör
const isAccessoryProduct = (name: string | undefined): boolean => {
  if (!name) return false;
  const trimmed = name.trim();
  return trimmed.startsWith('└') || 
         trimmed.startsWith('↳') || 
         trimmed.startsWith('L,') || 
         trimmed.startsWith('└,') ||
         trimmed.startsWith('  ↳') ||
         trimmed.startsWith('  └');
};

// Uppdaterad sortering
const sortPackingListItems = (items: PackingListItem[]): PackingListItem[] => {
  const mainProducts: PackingListItem[] = [];
  const childrenByParent: Record<string, PackingListItem[]> = {};

  items.forEach(item => {
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

  // Bygg sorterad lista
  const sorted: PackingListItem[] = [];
  mainProducts.forEach(main => {
    sorted.push(main);
    if (main.product && childrenByParent[main.product.id]) {
      // Sortera barn: paketmedlemmar först, tillbehör sist
      const sortedChildren = childrenByParent[main.product.id].sort((a, b) => {
        const aIsAccessory = isAccessoryProduct(a.product?.name);
        const bIsAccessory = isAccessoryProduct(b.product?.name);
        
        // Paketmedlemmar först (icke-tillbehör), tillbehör sist
        if (aIsAccessory && !bIsAccessory) return 1;  // a efter b
        if (!aIsAccessory && bIsAccessory) return -1; // a före b
        return 0; // Behåll ordning
      });
      sorted.push(...sortedChildren);
    }
  });

  return sorted;
};
```

---

## Sammanfattning

| Fil | Ändring |
|-----|---------|
| `src/hooks/usePackingList.tsx` | Lägg till `isAccessoryProduct`-funktion och sortera barn så att tillbehör alltid hamnar sist |

## Förväntat resultat

Inom varje paketgrupp:
```
Multiflex 8x6 (huvudprodukt)
  ↳ M Mittstolpe GRÖN     (paketmedlem - först)
  ↳ M Knoppstag           (paketmedlem)
  ↳ M Takduk VIT          (paketmedlem)
  ↳ Sandpåsar             (tillbehör - sist)
  ↳ Stolar                (tillbehör - sist)
```
