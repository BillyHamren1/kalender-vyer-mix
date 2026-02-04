
# Buggfix: Packlistan visas inte

## Problem
Packlistan visar "Ingen packlista tillgänglig" trots att det finns 22 produkter i bokningen.

### Analys
1. **Bara 4 av 22 items genererades** - `generatePackingListItems` skapade bara 4 items istället för 22
2. **Alla 4 är barn-items** - De har alla `parent_product_id` satt (accessories)
3. **Huvudprodukterna saknas** - De 3 "Multiflex"-huvudprodukterna finns inte i `packing_list_items`
4. **UI visar bara mainProducts** - PackingListTab itererar bara över `mainProducts`, och children visas under dem. Eftersom det inte finns några mainProducts visas inget alls.

## Lösning

### Del 1: Synka packlistan med alla produkter
Anropa `syncPackingListItems` direkt vid laddning för att lägga till saknade produkter (de 18 som saknas).

**Ändring i `usePackingList.tsx`:**
- I `fetchPackingListItems`: Om det finns items men färre än booking_products, kör synkning automatiskt

### Del 2: Visa orphaned children korrekt
Om ett barn-item har en parent_product_id men den producen inte finns i packlistan (inte renderas), ska barnet ändå visas.

**Ändring i `PackingListTab.tsx`:**
- Efter gruppering, samla barn vars parent inte finns i mainProducts
- Visa dessa "föräldralösa barn" som egna items (med indrag/varning)

### Tekniska ändringar

**Fil: `src/hooks/usePackingList.tsx`**
```typescript
// I fetchPackingListItems, efter check för existingItems?.length === 0:
// Lägg till: Om det finns items men antalet < booking_products, synka för att komplettera

const fetchPackingListItems = async (packingId: string, bookingId: string | null): Promise<PackingListItem[]> => {
  if (!bookingId) return [];

  // Fetch existing items count
  const { data: existingItems, error: checkError } = await supabase
    .from('packing_list_items')
    .select('id')
    .eq('packing_id', packingId);

  if (checkError) throw checkError;

  // Fetch booking products count
  const { data: productCount } = await supabase
    .from('booking_products')
    .select('id')
    .eq('booking_id', bookingId);

  const existingCount = existingItems?.length || 0;
  const productCountValue = productCount?.length || 0;

  // If no items OR if fewer than products, sync
  if (existingCount === 0 || existingCount < productCountValue) {
    await generatePackingListItems(packingId, bookingId);
  }
  // ... rest of function
};
```

**Fil: `src/components/packing/PackingListTab.tsx`**
```typescript
// I useMemo: Hitta barn utan synlig parent och visa dem som egna items
const { mainProducts, ..., orphanedChildren } = useMemo(() => {
  // ... existing logic ...
  
  // Collect children whose parent is not in mainProducts
  const mainProductIds = new Set(main.map(m => m.product?.id));
  const orphanedChildItems: PackingListItem[] = [];
  
  // Check accessories
  Object.entries(accByParent).forEach(([parentId, items]) => {
    if (!mainProductIds.has(parentId)) {
      orphanedChildItems.push(...items);
    }
  });
  
  // Check package components  
  Object.entries(pkgComponents).forEach(([parentId, items]) => {
    if (!mainProductIds.has(parentId)) {
      orphanedChildItems.push(...items);
    }
  });

  return { ..., orphanedChildren: orphanedChildItems };
});

// Visa orphanedChildren i UI (som saknar parent)
```

## Resultat
- Packlistan kommer visa alla 22 produkter korrekt
- Synkronisering sker automatiskt vid laddning om items saknas
- Barn-items utan parent visas även om deras parent saknas i listan
