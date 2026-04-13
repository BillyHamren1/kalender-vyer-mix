

## Problem

The product normalization in `sync-reconciliation` only maps `name` and `sku`, but the external API uses different field names for price, quantity, and cost fields. Specifically:

| sync-reconciliation expects | External API sends |
|---|---|
| `unit_price` | `price`, `unit_price`, `rental_price`, `cost` |
| `total_price` | `total`, computed |
| `quantity` | `quantity` (sometimes missing, defaults to 1) |
| `discount` | `discount` (sometimes missing) |
| `assembly_cost` | Not mapped |
| `handling_cost` | Not mapped |
| `purchase_cost` | Not mapped |

So when comparing `extP.unit_price`, it's `undefined` because the external has `price`. Same for other cost fields. Products also may not match by name if `product_name` normalization fails in edge cases.

## Fix

**Single file**: `supabase/functions/sync-reconciliation/index.ts`

Extend the product normalizer (lines 131-135) to map all product fields the same way `import-bookings` does:

```typescript
const products = (ext.products || []).map((p: any) => {
  const unitPrice = p.price || p.unit_price || p.rental_price || p.cost || null;
  const quantity = p.quantity || 1;
  const totalPrice = p.total ?? p.total_price ?? (unitPrice ? unitPrice * quantity : null);
  
  return {
    ...p,
    name: p.name || p.product_name || p.productName || '',
    sku: p.sku || p.article_number || null,
    quantity,
    unit_price: unitPrice,
    total_price: totalPrice,
    discount: p.discount || 0,
    assembly_cost: p.assembly_cost || p.labor_cost || p.work_cost || p.setup_cost || 0,
    handling_cost: p.handling_cost || p.material_cost || 0,
    purchase_cost: p.purchase_cost || p.external_cost || p.subrent_cost || 0,
  };
});
```

Also add logging to the compare action so we can see what the external API returns for products (temporary debug aid).

Deploy the updated edge function.

