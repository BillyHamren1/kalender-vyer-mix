

## Fix: Submit-knappen på "Avsluta jobb"-sidan döljs av bottom-nav

### Problem
Submit-knappen på `MobileCompleteJob` har `fixed bottom-0` men `MobileBottomNav` har också `fixed bottom-0 z-50` och täcker den helt.

### Lösning
Dölj `MobileBottomNav` på `/complete`-routes. Detta ger ett fokuserat fullskärmsflöde och submit-knappen syns korrekt.

### Ändringar

| Fil | Ändring |
|-----|---------|
| `MobileBottomNav.tsx` | Returnera `null` om `location.pathname` innehåller `/complete` |

En rad tillägg:
```tsx
const MobileBottomNav = () => {
  const location = useLocation();
  // Dölj nav på complete-flödet
  if (location.pathname.includes('/complete')) return null;
  // ... resten
```

