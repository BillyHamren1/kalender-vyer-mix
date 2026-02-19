

# Fix: Deploy proxy and harden ProductCostsCard

## Problem 1: planning-api-proxy not deployed
The edge function exists in code and `config.toml` but was never deployed. This causes all economy data fetches to return 404.

**Fix:** Deploy the `planning-api-proxy` edge function.

## Problem 2: ProductCostsCard crashes on undefined
When the proxy call fails, `productCosts` data contains `undefined` values. The `fmt` function on line 27-28 calls `.toLocaleString()` on `undefined`, crashing the component.

**Fix:** Add a null guard to the `fmt` helper:
```typescript
const fmt = (v: number) =>
  v == null ? '–' : v === 0 ? '0' : v.toLocaleString('sv-SE');
```

## Steps
1. Deploy `planning-api-proxy` edge function
2. Update `fmt` in `ProductCostsCard.tsx` line 27-28 to handle undefined/null values gracefully
3. Verify the economy page loads without crashes

