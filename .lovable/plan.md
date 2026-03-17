

## Problem

`AppContent` in `src/App.tsx` unconditionally calls `useBackgroundImport()` and `useSsoListener()` for **all** app modes, including scanner. This triggers:
- `importBookings()` → calls `import-bookings` edge function (fails without auth)
- `initializeSyncState()` / `updateSyncState()` → inserts into `sync_state` table (fails: `organization_id` required)
- Cascading errors that can blank the screen

## Fix

**Two changes in one file:**

### `src/App.tsx` — Guard hooks with mode check

Wrap both hooks so they only run for `time` and `web` modes:

```typescript
const AppContent = () => {
  const [lastViewedDate, setLastViewedDate] = useState(new Date());
  const [lastPath, setLastPath] = useState('');
  
  // Background import & SSO — NOT needed for scanner mode
  const isScanner = APP_MODE === 'scanner';
  if (!isScanner) {
    useBackgroundImport();
    useSsoListener();
  }
  // ...
```

Wait — hooks can't be called conditionally. Instead, guard **inside** the hooks:

### `src/hooks/useBackgroundImport.ts` — Early return for scanner

Add at the top of the hook, before any state/effects:

```typescript
export const useBackgroundImport = () => {
  const isScanner = import.meta.env.VITE_APP_MODE === 'scanner';
  
  // Scanner mode: return inert state, no imports
  if (isScanner) {
    return {
      state: { isRunning: false, lastImport: null, nextImport: null, importCount: 0 },
      triggerManualImport: async () => false,
      startBackgroundImport: () => {},
      stopBackgroundImport: () => {},
      isImporting: false,
      lastSyncTime: null,
      syncStatus: 'idle' as const,
      performManualRefresh: async () => false,
    };
  }
  
  // ... existing hook code unchanged ...
```

Actually, early return before hooks violates Rules of Hooks. The correct approach is to **guard the effects and callbacks inside the hook**, or split into two components.

**Cleanest approach: conditionally render a wrapper component.**

### Final approach — Two components in `App.tsx`

```typescript
// Component that runs web/time-only hooks
const WebTimeBootstrap = () => {
  useBackgroundImport();
  useSsoListener();
  return null;
};

const AppContent = () => {
  // ...
  return (
    <PlannerStoreProvider>
      <CalendarContext.Provider value={contextValue}>
        <LegacyStateBridge ... />
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            {APP_MODE !== 'scanner' && <WebTimeBootstrap />}
            <BrowserRouter>
              {APP_MODE === 'time' && <TimeAppShell />}
              {APP_MODE === 'scanner' && <ScannerAppShell />}
              {APP_MODE === 'web' && <WebRoutes />}
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </CalendarContext.Provider>
    </PlannerStoreProvider>
  );
};
```

### Files to change

| File | Change |
|------|--------|
| `src/App.tsx` | Extract `useBackgroundImport()` and `useSsoListener()` into a `WebTimeBootstrap` component, render it only when `APP_MODE !== 'scanner'` |

This is the minimal change. No other files need modification — `MobileScannerApp`, `ScannerAppShell`, and `ScannerLogin` don't call any import/sync services.

