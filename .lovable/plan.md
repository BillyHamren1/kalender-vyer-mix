

# Eliminera reload-hämtningar — fullständig plan

## Tre åtgärdsområden

### 1. Ta bort `window.location.reload()` i TeamManager

**Fil:** `src/components/Calendar/TeamManager.tsx`

TeamManager har två knappar ("Avbryt" och "Klar") som båda gör hård reload. Istället:

- Lägg till en `onClose` callback i `TeamManagerProps`
- "Avbryt" anropar `onClose()` — stänger dialogen utan sideffekter
- "Klar" anropar `onClose()` — teamdata är redan uppdaterad via `onAddTeam`/`onRemoveTeam`
- Föräldern (den komponent som renderar TeamManager i en Dialog) ansvarar för att invalidera relevanta queries via `queryClient.invalidateQueries()`

### 2. Ersätt polling med Supabase Realtime i dashboard-hooks

Projektet har redan ett etablerat mönster för Realtime (10 hooks använder `postgres_changes`). Samma mönster appliceras på de 7 hooks som idag pollar var 30:e sekund.

**Strategi:** Skapa en generisk `useRealtimeInvalidation`-hook som prenumererar på tabelländringar och invaliderar rätt query-keys. Polling (`refetchInterval`) tas bort helt eller behålls som fallback med längre intervall (5 min).

| Hook | Tabeller att lyssna på |
|------|----------------------|
| `useDashboard` | `bookings`, `calendar_events`, `staff_assignments`, `projects` |
| `useDashboardEvents` | `calendar_events`, `bookings` |
| `usePlanningDashboard` | `staff_assignments`, `booking_staff_assignments`, `bookings`, `calendar_events` |
| `useWarehouseDashboard` | `packing_projects`, `packing_list_items`, `packing_tasks`, `bookings` |
| `useJobsListRealTime` | Har redan Realtime — ta bort `refetchInterval: 30000` |
| `TimeReportApprovalPanel` | `time_reports` (inline query) |
| `WarehouseDashboard` (inline) | `packing_projects`, `packing_list_items` |

**Implementering per hook:**

```text
useEffect(() => {
  const channel = supabase
    .channel('dashboard-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' },
      () => queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' },
      () => queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, [queryClient]);
```

Varje hook får sin egen kanal med relevanta tabeller. `refetchInterval` tas bort eller sätts till 300000 (5 min) som fallback.

### 3. Optimera scanner-appens datahämtning

**Filer:** `src/components/scanner/VerificationView.tsx`, `ManualChecklistView.tsx`

Idag: varje scan → `loadData()` → hämtar hela packlistan från servern → hittar uppdaterat item.

**Ny strategi — optimistisk lokal uppdatering:**

1. Efter lyckad `verifyProductBySku` / checkbox-toggle:
   - Uppdatera `items`-state lokalt (markera item som verifierad, öka `quantity_packed`)
   - Räkna om progress lokalt
   - Visa resultat direkt

2. Bakgrundssynk:
   - Kör `loadData()` tyst i bakgrunden efter 2 sekunder (debounce)
   - Om bakgrundsdata avviker, uppdatera state tyst

3. Behåll manuell refresh-knapp som hård `loadData()` för edge cases

**Konkret ändring i `handleScan`:**
```text
// Istället för:
loadData();

// Gör:
setItems(prev => prev.map(item =>
  item.id === updatedItemId
    ? { ...item, quantity_packed: item.quantity_packed + 1, ... }
    : item
));
// Debounced background sync
debouncedLoadData();
```

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/components/Calendar/TeamManager.tsx` | Ersätt reload med `onClose` callback |
| Förälder till TeamManager (Dialog-komponent) | Skicka `onClose` + invalidera queries |
| `src/hooks/useDashboard.tsx` | Realtime + ta bort polling |
| `src/hooks/useDashboardEvents.ts` | Realtime + ta bort polling |
| `src/hooks/usePlanningDashboard.tsx` | Realtime + ta bort polling |
| `src/hooks/useWarehouseDashboard.tsx` | Realtime + ta bort polling |
| `src/hooks/useJobsListRealTime.tsx` | Ta bort `refetchInterval` (har redan RT) |
| `src/components/staff/TimeReportApprovalPanel.tsx` | Realtime + ta bort polling |
| `src/pages/WarehouseDashboard.tsx` | Realtime + ta bort polling |
| `src/components/scanner/VerificationView.tsx` | Optimistisk uppdatering + debounced sync |
| `src/components/scanner/ManualChecklistView.tsx` | Optimistisk uppdatering + debounced sync |

## Risker

- Supabase Realtime kräver att Realtime är aktiverat på tabellerna i Supabase Dashboard. Tabeller som `staff_assignments`, `calendar_events`, `bookings` används redan i Realtime-prenumerationer, så de bör redan vara aktiverade. Övriga tabeller (`packing_projects`, `packing_list_items`, `packing_tasks`, `time_reports`) kan behöva aktiveras manuellt.
- Optimistisk uppdatering i scannern kräver att `verifyProductBySku`-svaret innehåller tillräcklig info för att identifiera rätt item — behöver verifieras.

