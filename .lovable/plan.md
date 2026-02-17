

## Fix: Stabilisera artikelordningen i scannerlistan

### Problem
Efter varje skanning eller manuell markering anropas `loadData()` som hämtar och sorterar om hela listan. Artiklar hoppar runt i listan, vilket gor det omojligt att folja med.

### Losning
Ge varje artikel en stabil sorteringsordning som inte andras nar den verifieras. Ordningen ska baseras pa **initialordningen** (foraldraartikel + barn under), inte pa verifieringsstatus.

### Andringar

**`src/services/scannerService.ts`** — `sortPackingItems()`
- Lagga till en stabil sekundar sortering pa huvudprodukter baserat pa namn (alfabetisk) sa ordningen alltid ar identisk oavsett vilka som ar verifierade

**`src/components/scanner/VerificationView.tsx`**
- Spara den initiala artikelordningen (en mappning fran item-ID till index) nar listan forst laddas
- Vid efterfoljande `loadData()`-anrop: sortera artiklarna enligt den sparade ordningen istallet for att lata dem hamna i en ny ordning
- Nya artiklar (som inte fanns i initial-ordningen) laggs sist

### Teknisk detalj

```typescript
// Spara initial ordning vid forsta laddning
const [itemOrder, setItemOrder] = useState<Record<string, number>>({});

// I loadData:
const itemsData = await fetchPackingListItems(packingId);
const sorted = sortPackingItems(itemsData);

if (Object.keys(itemOrder).length === 0) {
  // Forsta laddning — spara ordningen
  const order: Record<string, number> = {};
  sorted.forEach((item, idx) => { order[item.id] = idx; });
  setItemOrder(order);
  setItems(sorted);
} else {
  // Efterfoljande — sortera enligt sparad ordning
  sorted.sort((a, b) => (itemOrder[a.id] ?? 9999) - (itemOrder[b.id] ?? 9999));
  setItems(sorted);
}
```

**Filer att andra:** 2 (`scannerService.ts`, `VerificationView.tsx`)
