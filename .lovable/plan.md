## Plan

I will fix the travel timer so `TRAVEL` always stops cleanly in the mobile app, including cases where a stale local id or missed arrival signal leaves the banner ticking forever.

### What I’ll change

1. Harden the frontend stop flow in `src/hooks/useTravelDetection.ts`
   - Treat the server stop call as successful when the backend falls back to another open travel row or reports `already_stopped`.
   - Clear local travel state even when the original `travel_log_id` is stale but the server still closes the real open row.
   - Add a small recovery path on mount: if local `eventflow-travel-state` says a trip is active but there is no open server row, clear the phantom local state.

2. Make the backend stop response more recovery-friendly in `supabase/functions/mobile-app-api/index.ts`
   - Keep the existing fallback-to-open-row behavior, but return enough metadata for the client to know which row was actually stopped.
   - Return an idempotent success shape when a stale id points to an already-closed row and no open travel remains, so the client can safely clear the banner instead of getting stuck.

3. Verify all stop entry points still go through the same path
   - Manual stop from `TravelBanner`
   - Auto-stop on arrival/geofence via `STOP_TRAVEL_EVENT`
   - Auto-stop when a new activity timer starts
   - End-of-day prompt path

4. Add/adjust focused tests
   - Stale local `travel_log_id` but another open travel exists
   - Stop returns success for already-closed travel and clears client state
   - Phantom local travel state with no open server row is auto-cleaned

### Expected result

- A travel timer that is visible in the app can always be stopped.
- Old/stale local travel ids will no longer leave the app stuck in “Travelling”.
- Refreshing the app will not resurrect phantom travel banners when the server has no open travel row.

### Technical details

Files likely involved:
- `src/hooks/useTravelDetection.ts`
- `src/components/mobile-app/TravelBanner.tsx` (only if minor wiring is needed)
- `supabase/functions/mobile-app-api/index.ts`
- relevant travel/time-report tests

Observed likely root cause:
- The backend already has fallback logic in `handleStopTravelLog`, but the frontend currently assumes only the local `activeTravelLogId` matters.
- If local state becomes stale, the banner can persist because the client does not proactively reconcile `eventflow-travel-state` against the server on mount/resume.
- There are currently open `travel_time_logs` rows in the database, confirming the stop flow is leaving some rows unclosed server-side as well.

After approval, I’ll implement and test the stop hardening end-to-end.