# WMS loading architecture — implementation status (2026-10-19)

## Done (client read path, no migrations)
| Area | Before | Now |
|---|---|---|
| Overview (`useWarehouseOpsRange`) | ≤2000 packings incl. completed, then ≤20000 rows, sequential allocation batches, every 30 s | Open packings + completed only when anchored in the window (`isOpsWindowCandidate`); date filter **before** rows/scans; all reads paginated (`readAllPages`, no silent caps) and chunked with concurrency 4 (`readInChunks`); no polling |
| Cache | key without tenant/actor | key `["warehouse-ops-range", org, user, date, mode]`, staleTime 5 min, no refetch on focus, previous period kept while loading; tenant/user switch clears cache (`useTenantCacheGuard`) |
| Change signal | 30 s poll | Realtime on packing_projects / warehouse_assignments / allocations, coalesced 2 s, paused while tab is hidden, invalidates only this org's overview keys |
| Warehouse calendar | events, transports, packing/title/crew loaded also in personnel mode | gated by `planningMode === 'calendar'` |
| Personnel week + crew | 10 s polling | realtime only, previous data kept |
| Staff directory | staleTime 0, refetchOnMount always, focus refetch; key `['staffMembers']` shared with possible active-only reads | key `['staffMembers','includeInactive']`, 5 min cache; own writes invalidate via `refreshStaffEverywhere` |

## Not done yet (pending, requires approved migration)
- Durable server changefeed (monotonic cursor, tombstones, window move-in/out, retention-gap resync). Today a realtime signal triggers a refetch of the affected org's selected window — not a per-record delta merge. Missed signals while offline are only caught on next stale/refetch or manual update.
- Server-side packing progress aggregate (RPC/view). Progress is still computed client-side with `computePackingProgress` (canonical rule), but only for packings in the window.

## Tests
`src/test/warehouseOpsRangeWindow.test.ts`: history exclusion, rigged-down exclusion, return/multi-day/internal inclusion, full pagination, error propagation, bounded concurrency, no polling, tenant/actor key, personnel gating, staff key separation.
