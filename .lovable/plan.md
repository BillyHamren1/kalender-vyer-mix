

## Problem

`MobileInbox.tsx` manages all data with `useState` + `useEffect` + direct `mobileApi` calls. This means:

1. **No caching** — every time the user navigates to the inbox tab, 3 edge function calls fire (`getDirectMessages`, `getBroadcasts`, `getBookings`)
2. **No stale-while-revalidate** — the page shows a loading skeleton every single time, even if data was fetched 2 seconds ago
3. **Race conditions** — no request deduplication; rapid tab switching can cause stale data overwrites
4. **No background refetch** — messages only update on mount, not while viewing

## Solution

Migrate `MobileInbox` data fetching to React Query (already used everywhere else in the app), keeping the existing `mobileApi` service calls as query functions.

### Changes

**1. Create `src/hooks/useMobileInbox.ts`**

A new hook wrapping three `useQuery` calls:

- `['mobile-inbox-dms']` → `mobileApi.getDirectMessages()`
- `['mobile-inbox-broadcasts']` → `mobileApi.getBroadcasts()`
- `['mobile-inbox-jobs']` → `mobileApi.getBookings()`

Configuration:
- `staleTime: 30_000` (30s) — prevents refetch on quick tab switches
- `gcTime: 5 * 60_000` (5min) — keeps cache in memory while navigating
- `refetchInterval: 30_000` — background polling for new messages
- `enabled: !!staff` — only fetch when authenticated

Expose: `dmConversations`, `broadcasts`, `jobConversations`, `isLoading`, `refetch`

**2. Update `src/pages/mobile/MobileInbox.tsx`**

- Remove `useState` for `dmConversations`, `broadcasts`, `jobConversations`, `loading`
- Remove the `fetchAll` callback and its `useEffect`
- Import and use `useMobileInbox()` instead
- Keep local state for thread views (`activeDM`, `activeJob`, etc.) — these are UI-only
- For optimistic updates (mark-as-read, send message), use `queryClient.setQueryData` to update cache directly without refetching
- Keep `goBack` behavior as-is

**3. Optimistic updates for mark-as-read and send**

When marking a DM as read or sending a message, update the React Query cache directly via `queryClient.setQueryData` so the UI updates instantly without waiting for a refetch. This replaces the current `setState` calls.

### Result

- First visit: data loads once, cached
- Tab switch away and back within 30s: instant display, no loading spinner
- Background polling every 30s keeps data fresh
- Sending/reading updates UI instantly via cache mutation

