

## Problem

Every time you open a mobile page (Jobb, Tid, Utlagg, Profil), the data is fetched from scratch via `useEffect` + `mobileApi.xxx()`. There is zero caching — even navigating back and forth between tabs re-fetches everything. This causes noticeable loading delays on every page transition.

## Solution

Replace all manual `useEffect`-based data fetching with **React Query** (`useQuery`), which is already installed and configured in the app. React Query automatically caches results and serves them instantly on repeat visits, while silently refreshing in the background.

### What changes

**1. Create a shared hooks file: `src/hooks/useMobileData.ts`**

Centralize all mobile data-fetching into reusable hooks:

- `useMobileBookings()` — wraps `mobileApi.getBookings()`, cached with key `['mobile-bookings']`
- `useMobileTimeReports()` — wraps `mobileApi.getTimeReports()`, cached with key `['mobile-time-reports']`
- `useMobileBookingDetails(id)` — wraps `mobileApi.getBookingDetails(id)`, cached per booking
- `useMobileBookingPurchases(bookings)` — aggregates purchases across bookings

All hooks will use a `staleTime` of ~2 minutes so data feels instant on tab switches but still refreshes periodically.

**2. Update pages to use the new hooks**

Each page replaces its `useEffect` + `useState` pattern with the corresponding hook:

| Page | Current pattern | New pattern |
|------|----------------|-------------|
| `MobileJobs.tsx` | `useEffect` → `mobileApi.getBookings()` | `useMobileBookings()` |
| `MobileTimeReport.tsx` | `useEffect` → `mobileApi.getBookings()` | `useMobileBookings()` |
| `MobileTimeHistory.tsx` | `useEffect` → `mobileApi.getTimeReports()` | `useMobileTimeReports()` |
| `MobileExpenses.tsx` | `useEffect` → `getBookings` + `getProjectPurchases` per booking | `useMobileBookings()` + `useMobileBookingPurchases()` |
| `MobileJobDetail.tsx` | `useEffect` → `mobileApi.getBookingDetails(id)` | `useMobileBookingDetails(id)` |
| `MobileProfile.tsx` | `useEffect` → `mobileApi.getTimeReports()` | `useMobileTimeReports()` |

**3. Invalidate cache after mutations**

When creating a time report or purchase, call `queryClient.invalidateQueries()` so the cached data refreshes:

- After `createTimeReport` → invalidate `['mobile-time-reports']`
- After `createPurchase` → invalidate `['mobile-purchases']`

### Result

- First load: same as today (one network call)
- Subsequent visits: **instant** (served from cache)
- Pull-to-refresh / mutations: triggers a background refetch
- No stale data: auto-refreshes after 2 minutes

### Technical details

```typescript
// src/hooks/useMobileData.ts
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';

const STALE_TIME = 2 * 60 * 1000; // 2 minutes

export function useMobileBookings() {
  return useQuery({
    queryKey: ['mobile-bookings'],
    queryFn: () => mobileApi.getBookings().then(r => r.bookings),
    staleTime: STALE_TIME,
  });
}

export function useMobileTimeReports() {
  return useQuery({
    queryKey: ['mobile-time-reports'],
    queryFn: () => mobileApi.getTimeReports().then(r => r.time_reports),
    staleTime: STALE_TIME,
  });
}

// ... etc
```

**Files to create:** 1 (hooks file)
**Files to edit:** 6 (all mobile pages listed above)

