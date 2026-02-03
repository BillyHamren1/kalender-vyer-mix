
# Plan: Visa fullständig SKU vid klick istället för avkortad i text

## Problem

Nuvarande implementation i `PackingListItemRow.tsx` visar en avkortad SKU direkt efter produktnamnet:
```typescript
{item.product?.sku.substring(0, 8)}  // ← FÖRBJUDET!
```

## Önskad funktionalitet

- SKU ska **inte** visas i produktraden normalt
- När man **klickar på produktnamnet** ska fullständig SKU visas (t.ex. i en popover eller tooltip)

---

## Teknisk ändring

**Fil:** `src/components/packing/PackingListItemRow.tsx`

### Ändring: Ta bort avkortad SKU och lägg till klickbar popover

**Före (rad 116-128):**
```typescript
<div className="flex-1 min-w-0">
  <p className={cn(...)}>
    {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
    {(item.product?.name || "Okänd produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
    {item.product?.sku && (
      <span className="text-xs text-muted-foreground ml-2">
        [{item.product.sku.substring(0, 8)}]  // ← FÖRBJUDET
      </span>
    )}
  </p>
  ...
</div>
```

**Efter:**
```typescript
<div className="flex-1 min-w-0">
  <Popover>
    <PopoverTrigger asChild>
      <p className={cn(
        "font-medium truncate cursor-pointer hover:text-primary",
        isFullyPacked && "line-through text-muted-foreground"
      )}>
        {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
        {(item.product?.name || "Okänd produkt").replace(/^[\s↳└⦿]+/g, '').trim()}
      </p>
    </PopoverTrigger>
    {item.product?.sku && (
      <PopoverContent className="w-auto p-2" align="start">
        <div className="text-sm">
          <span className="text-muted-foreground">SKU:</span>{" "}
          <span className="font-mono font-medium">{item.product.sku}</span>
        </div>
      </PopoverContent>
    )}
  </Popover>
  {item.packed_by && item.packed_at && (
    <p className="text-xs text-muted-foreground flex items-center gap-2">
      ...
    </p>
  )}
</div>
```

---

## Sammanfattning

| Fil | Ändring |
|-----|---------|
| `src/components/packing/PackingListItemRow.tsx` | Ta bort avkortad SKU från rad, lägg till popover vid klick som visar fullständig SKU |

## Förväntat resultat

- Produktnamn visas rent utan SKU
- Vid klick på produktnamnet visas en popover med "SKU: [fullständig-sku]"
- SKU:n är **aldrig** avkortad
