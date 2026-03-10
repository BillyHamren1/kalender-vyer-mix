

## Plan: Redirect `/` till `/scanner` (bara på mobil/Capacitor)

### Approach

Använd `Navigate` från react-router-dom med en enkel device-detect direkt i route-elementet. Capacitor-appen identifieras redan via `window.Capacitor` (samma pattern som i `src/main.tsx`).

### Ändringar i `src/App.tsx`

1. **Importera** `Navigate` från `react-router-dom` (rad 5)
2. **Ändra rad 135** — rotvägen `/` — från att alltid visa `PlanningDashboard` till att kolla om appen körs i Capacitor:

```tsx
<Route path="/" element={
  <ProtectedRoute>
    {typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor?.isNativePlatform?.()
      ? <Navigate to="/scanner" replace />
      : <MainSystemLayout><PlanningDashboard /></MainSystemLayout>
    }
  </ProtectedRoute>
} />
```

**Resultat:** Desktop-användare ser PlanningDashboard som vanligt. Capacitor-appen redirectas direkt till `/scanner`.

Totalt: 2 rader ändras i en fil.

