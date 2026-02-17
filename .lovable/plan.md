
## Problem: Telefonens statusbar täcker headertexten

Alla mobilsidor har sin header-text för högt upp — `pt-14` (56px) räcker inte för att undvika kollision med telefonens klocka, batteri och signalstyrka.

### Lösning: Safe area-block i toppen

Istället för att justera padding i varje enskild header individuellt skapas ett **globalt safe area-system** som löser problemet konsekvent på alla sidor.

Strategin är tvådelad:

**1. Lägg till en CSS-variabel för safe area** i `index.css`/`App.css`:
```css
:root {
  --sat: env(safe-area-inset-top, 0px);
}
```

**2. Uppdatera alla mobilsidors header-div** med en extra enfärgad "cap" högst upp — ett block som är exakt lika högt som telefonens statusbar men utan text eller ikoner:

```text
┌─────────────────────────────────┐
│  [enfärgat block, bg-primary]   │  ← safe zone, ~44px, ingen text
│  Välkommen                      │  ← befintlig headertext
│  Erik                           │
└─────────────────────────────────┘
```

### Teknisk implementation

Varje header-div ändras från detta mönster:
```tsx
<div className="bg-primary px-5 pt-14 pb-5 safe-area-top rounded-b-3xl shadow-md">
  <h1>Tidrapportering</h1>
```

Till detta:
```tsx
<div className="bg-primary rounded-b-3xl shadow-md">
  {/* Safe area – täcker telefonens statusbar */}
  <div className="bg-primary" style={{ height: 'env(safe-area-inset-top, 44px)', minHeight: '44px' }} />
  <div className="px-5 pb-5">
    <h1>Tidrapportering</h1>
```

`env(safe-area-inset-top)` är en CSS-standard som automatiskt läser av telefonens exakta statusbar-höjd (Dynamic Island, notch, etc.). Fallback är `44px` för enheter som inte stödjer det.

### Filer att ändra

Samtliga 6 mobilsidor + loading-states har headers som behöver uppdateras:

1. **`src/pages/mobile/MobileJobs.tsx`** — `pt-14` → safe area block
2. **`src/pages/mobile/MobileJobDetail.tsx`** — `pt-12` → safe area block  
3. **`src/pages/mobile/MobileTimeReport.tsx`** — `pt-14` × 2 (loading + main) → safe area block
4. **`src/pages/mobile/MobileExpenses.tsx`** — `pt-14` × 2 (loading + main) → safe area block
5. **`src/pages/mobile/MobileProfile.tsx`** — `pt-14` → safe area block
6. **`src/pages/mobile/MobileTimeHistory.tsx`** — `pt-12` → safe area block
7. **`src/pages/mobile/MobileLogin.tsx`** — `pt-16` på login-sidan → safe area block (enfärgad topp)

Dessutom läggs `safe-area-inset` CSS till i `src/index.css` för att Tailwind-klassen `safe-area-top` ska fungera korrekt med `padding-top: env(safe-area-inset-top)`.

### Visuellt resultat

```text
Före:                           Efter:
┌─── [klocka/batteri] ───┐     ┌─── [klocka/batteri] ───┐
│ Välkommen ← TEXT HÄR!  │     │  [teal, ingen text]    │
│ Erik                   │     ├────────────────────────┤
└────────────────────────┘     │ Välkommen              │
                               │ Erik                   │
                               └────────────────────────┘
```

Ingen databas- eller backend-ändring behövs.
