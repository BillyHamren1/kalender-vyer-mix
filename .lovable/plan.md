

## Problem

Kolumnen "Pris/st" visar `unit_price` (264 000) och "Totalt" visar `total` (198 000). När `quantity = 1` ser det ut som ett fel, men skillnaden beror på **rabatt** (`discount`-fältet i `ProductCostData`). Rabatten visas aldrig i tabellen, så användaren har ingen aning om varför summorna inte stämmer.

## Lösning

Visa rabatten tydligt i produkttabellen i `ProductCostsCard.tsx`:

### Ändring i `src/components/project/ProductCostsCard.tsx`

1. **Lägg till en "Rabatt"-kolumn** i tabellhuvudet mellan "Pris/st" och "Totalt" — visar `discount`-värdet (t.ex. 25%) om det finns.

2. **Alternativ (enklare)**: Om `product.discount > 0`, visa rabatten som en liten text under "Totalt"-värdet, t.ex. `198 000` med en grå text `(-25%)` under. Detta kräver ingen extra kolumn.

### Rekommendation

Alternativ 2 är smidigare — ingen layout-ändring, bara en tydlig indikation:

```
Totalt
198 000
(-25%)
```

Ändringen görs på **tre ställen** i filen:
- `renderChildRow` (rad ~238): lägg till rabattindikator under `fmt(rev)`
- `renderGroupRows` parentRow (rad ~306): samma sak för grupprad
- Kolumnhuvudet behöver inte ändras

### Teknisk detalj

`discount`-fältet finns redan i `ProductCostData` (rad 12 i `productCostService.ts`). Beräkning: om `unit_price * quantity ≠ total` och `discount > 0`, visa `(-{discount}%)`.

