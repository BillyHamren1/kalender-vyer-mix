
# Buggfix: Packlistan visar inte produkter i rätt ordning

## Problem
Packlistan visar produkter i fel ordning. Huvudprodukter (t.ex. "Multiflex 6x12") ska ha sina tillbehör (t.ex. "↳ M Takduk 6m") listade direkt under sig, precis som i resten av systemet.

## Analys
Datan i databasen är korrekt:
- 3 huvudprodukter finns (2x Multiflex 6x12 + 1x Multiflex 8x15)
- Varje tillbehör har rätt `parent_product_id` som pekar på sin huvudprodukt

**Problemet är dubbel sortering/gruppering:**
1. `usePackingList.tsx` sorterar i `sortPackingListItemsWithStatus()` 
2. `PackingListTab.tsx` försöker gruppera igen med `useMemo`

Detta skapar förvirring där items hamnar i fel ordning.

## Lösning
**Förenklad approach:** Ta bort sorteringslogiken från `usePackingList.tsx` och låt `PackingListTab.tsx` hantera all gruppering/sortering. Detta följer samma mönster som `ProductsList.tsx` använder.

### Ändringar

**Fil: `src/hooks/usePackingList.tsx`**
- Ta bort `sortPackingListItemsWithStatus()` funktionen
- Returnera items direkt utan försortering
- Låt UI-komponenten hantera all sortering/gruppering

**Fil: `src/components/packing/PackingListTab.tsx`**
- Förbättra grupperingslogiken för att matcha `ProductsList.tsx`
- Säkerställ att ordningen är: **Huvudprodukt → Paketkomponenter (⦿) → Tillbehör (↳)**
- Gruppera korrekt baserat på `parent_product_id`

### Tekniska detaljer

**I `usePackingList.tsx` - ta bort sortering:**
```typescript
// FÖRE: return sortPackingListItemsWithStatus(itemsWithProducts);
// EFTER: return itemsWithProducts;
```

**I `PackingListTab.tsx` - förbättrad gruppering:**
```typescript
const { mainProducts, childrenByParent, orphanedItems, orphanedChildren } = useMemo(() => {
  const main: PackingListItem[] = [];
  const childrenByParentId: Record<string, PackingListItem[]> = {};
  const orphaned: PackingListItem[] = [];
  
  // Första pass: identifiera huvudprodukter och barn
  items.forEach(item => {
    if (item.isOrphaned) {
      orphaned.push(item);
      return;
    }
    
    const parentId = item.product?.parent_product_id;
    if (!parentId) {
      // Huvudprodukt
      main.push(item);
    } else {
      // Barn-produkt
      if (!childrenByParentId[parentId]) childrenByParentId[parentId] = [];
      childrenByParentId[parentId].push(item);
    }
  });

  // Sortera barn: paketkomponenter (⦿) först, sedan tillbehör (↳)
  Object.values(childrenByParentId).forEach(children => {
    children.sort((a, b) => {
      const aName = a.product?.name || '';
      const bName = b.product?.name || '';
      const aIsAccessory = aName.includes('↳') || aName.includes('└');
      const bIsAccessory = bName.includes('↳') || bName.includes('└');
      // Paketkomponenter (⦿) före tillbehör (↳)
      if (!aIsAccessory && bIsAccessory) return -1;
      if (aIsAccessory && !bIsAccessory) return 1;
      return 0;
    });
  });

  // Hitta barn utan förälder i huvudlistan
  const mainProductIds = new Set(main.map(m => m.product?.id).filter(Boolean));
  const orphanedChildItems: PackingListItem[] = [];
  
  Object.entries(childrenByParentId).forEach(([parentId, children]) => {
    if (!mainProductIds.has(parentId)) {
      orphanedChildItems.push(...children);
    }
  });

  return { 
    mainProducts: main, 
    childrenByParent: childrenByParentId,
    orphanedItems: orphaned,
    orphanedChildren: orphanedChildItems
  };
}, [items]);
```

**Rendering - förenklad:**
```tsx
{mainProducts.map(item => (
  <div key={item.id}>
    {/* Huvudprodukt */}
    <PackingListItemRow item={item} onUpdate={onUpdateItem} isAccessory={false} />
    
    {/* Alla barn under denna produkt */}
    {item.product?.id && childrenByParent[item.product.id]?.map(child => (
      <PackingListItemRow
        key={child.id}
        item={child}
        onUpdate={onUpdateItem}
        isAccessory={true}
      />
    ))}
  </div>
))}
```

## Resultat
- Huvudprodukter visas först
- Paketkomponenter (⦿) visas direkt under huvudprodukten
- Tillbehör (↳) visas efter paketkomponenterna
- Ordningen matchar nu resten av systemet (ProductsList, VerificationView, etc.)
