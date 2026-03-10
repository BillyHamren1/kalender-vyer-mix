

## Plan: Fix dashboard refresh after import

### Problem
The import Edge Function IS running correctly — data exists in the database. The issue is that after clicking "Uppdatera", the **"New Bookings" section** doesn't refresh because its React Query key (`bookings-without-project`) is never invalidated. Only calendar event queries are refetched via `refetchAll()`.

### Changes — `src/pages/PlanningDashboard.tsx`

Add `queryClient.invalidateQueries` for bookings-related queries after import + refetch:

```typescript
onClick={async () => { 
  await triggerImport(); 
  refetchAll();
  queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
  queryClient.invalidateQueries({ queryKey: ['bookings'] });
  queryClient.invalidateQueries({ queryKey: ['all-bookings'] });
  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
}}
```

One file, one change. The `queryClient` is already imported and available in the component.

