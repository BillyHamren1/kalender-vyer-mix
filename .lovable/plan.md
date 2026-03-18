

## Performance Analysis: Ekonomiskt kontrollcenter

### Root Cause

The page fires a **single edge function call** (`multi_batch`) that internally spawns **N × 7 parallel HTTP requests** to the external API — one per booking per data type (budget, time_reports, purchases, quotes, invoices, product_costs, supplier_invoices).

With 62 bookings in the database, that's **434 parallel HTTP requests** from the edge function to the external API. This is the bottleneck — the edge function likely hits connection limits, rate limits, or simply takes too long to resolve all promises.

Additionally, this fires on every page load (staleTime is 5 min, but navigating away and back triggers a refetch).

### Plan

**1. Add server-side caching in the edge function** (`planning-api-proxy`)

Add a local Supabase table `economy_cache` that stores the batch response per booking_id with a TTL (e.g. 10 minutes). The multi_batch handler checks cache first, only fetches externally for stale/missing entries.

| Column | Type |
|--------|------|
| booking_id | text PK |
| data | jsonb |
| cached_at | timestamptz |

**2. Chunk parallel requests in the edge function**

For uncached bookings, fetch in chunks of 10 (not all 62 at once) to avoid overwhelming the external API.

**3. Increase client-side staleTime and add `gcTime`**

Increase `staleTime` to 10 min and add `gcTime: 30 min` so navigating between tabs doesn't re-trigger the heavy fetch.

**4. Show cached data immediately, refresh in background**

Set `placeholderData: keepPreviousData` so the UI renders instantly with stale data while refreshing.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/planning-api-proxy/index.ts` | Add cache-first logic with chunked fetching for uncached bookings |
| `src/hooks/useEconomyOverviewData.ts` | Increase staleTime/gcTime, add placeholderData |
| New migration | Create `economy_cache` table |

### Expected Impact

- First load: still ~5-10s (cold cache)
- Subsequent loads within 10 min: **< 1 second** (served from cache)
- Tab switching: **instant** (client-side cache)

