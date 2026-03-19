

# Fix: Kartmarkörer hoppar vid hover

## Problem
När man hovrar över en personalmarkör på kartan så "hoppar" den iväg uppåt. Detta beror på att `scale(1.2)` påverkar Mapbox-markörens positionering — Mapbox-markörens wrapper-div tolkar storleksändringen och repositionerar elementet felaktigt.

## Lösning
Byt hover-effekten från `transform: scale()` till `box-shadow`-förstärkning istället. En subtil skuggförändring ger tydlig visuell feedback utan att påverka markörens position.

### Ändring i `src/components/ops-control/OpsLiveMap.tsx`

**Rad 231-232** — Byt hover-transform mot box-shadow:
```typescript
el.addEventListener('mouseenter', () => { 
  el.style.boxShadow = '0 0 0 4px rgba(255,255,255,0.5), 0 2px 8px rgba(0,0,0,0.35)'; 
});
el.addEventListener('mouseleave', () => { 
  el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.25)'; 
});
```

Tar även bort `transition: transform 0.15s` och ersätter med `transition: box-shadow 0.15s` i markörens `cssText`.

### Filer som ändras
- `src/components/ops-control/OpsLiveMap.tsx` — 1 ställe, ~6 rader

