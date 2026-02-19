

# Fix: Guard `cleanName` against undefined

## Problem
`cleanName` on line 23 of `ProductCostsCard.tsx` calls `.replace()` on the `name` parameter, but some products coming from the API have `undefined` names, causing the crash.

## Fix
Add a null guard to `cleanName`:

```typescript
function cleanName(name: string): string {
  return (name ?? '').replace(/^[\s↳└⦿L,\-–]+/, '').trim();
}
```

This is a one-line change on line 24 of `ProductCostsCard.tsx`.

