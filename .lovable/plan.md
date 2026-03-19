

# Byt jobbmarkörer till klassiska röda pins

## Problem
Jobbmarkörerna på OpsLiveMap är små grå/teal diamanter (20×20px, roterade 45°) som knappt syns på kartan.

## Lösning
Ersätt diamant-elementet med en klassisk röd pin-SVG (samma stil som `MapMarkers.tsx` redan använder), men anpassad för jobbmarkörer.

### Ändring i `src/components/ops-control/OpsLiveMap.tsx` (rad 173-179)

Byt från diamant-div till en pin-SVG:

```typescript
const el = document.createElement('div');
el.style.cssText = 'width: 24px; height: 36px; cursor: pointer;';
el.innerHTML = `
  <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" 
          fill="${job.isActive ? '#ef4444' : '#94a3b8'}" stroke="white" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4" fill="white"/>
  </svg>
`;
```

Aktiva jobb = röd (`#ef4444`), inaktiva = grå. Markören använder `anchor: 'bottom'` så att pinnens spets pekar på koordinaten.

Markören skapas med:
```typescript
const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
```

### Filer som ändras
- `src/components/ops-control/OpsLiveMap.tsx` — 1 ställe, ~10 rader

