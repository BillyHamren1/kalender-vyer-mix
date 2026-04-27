## Plan

Fix the new `Adress & geofence` dialog so the Mapbox map can fail gracefully and actually render instead of getting stuck in an infinite loading state.

### What I found
- The dialog only hides the spinner when `mapReady` becomes `true`.
- In `ProjectAddressMapDialog.tsx`, `mapReady` is only set inside `map.on('load', ...)`.
- There is no timeout, no `map.on('error', ...)`, and no fallback state if the style/token/tiles fail after the map instance is created.
- The screenshot matches that: coordinates render from React state, but the map canvas never becomes ready, so the loader sits on top forever.
- Existing map components in the project already use the same token flow successfully, so the failure is most likely in this dialog’s readiness/error handling rather than the entire `mapbox-token` function.

### Implementation
1. Harden `ProjectAddressMapDialog.tsx` map initialization:
   - add explicit loading/error state instead of only `token + mapReady`
   - listen for `map.on('error', ...)` and surface a clear Swedish error message in the dialog
   - add a safety timeout so the component exits the spinner state if Mapbox never reaches `load`
   - clean up listeners and timeout on close/unmount

2. Make the dialog usable even if Mapbox partially fails:
   - keep address search and manual text editing available
   - show a retry action when map init fails
   - show a helpful fallback message instead of a permanent spinner overlay

3. Align the new dialog with proven project patterns:
   - reuse the token-loading behavior from working Mapbox components like `GeofenceMapEditor` / logistics maps
   - if needed, switch readiness from a single `load` dependency to a more robust combination (`load`/`style.load` + guarded source/layer updates)
   - guard `ensureRadiusCircle` so it never tries to add layers before the style is actually ready

4. Verify the large project flow wiring:
   - confirm `LargeProjectLayout.tsx` passes the correct initial values and reopening the dialog resets state cleanly
   - ensure retry/reopen does not leave stale `mapRef`/`drawRef` state behind

### Technical details
- Files to update:
  - `src/components/projects/large/ProjectAddressMapDialog.tsx`
  - possibly a small adjustment in `src/pages/project/LargeProjectLayout.tsx` only if dialog reset/retry state needs it
- No database change is needed.
- `assistant_events`, geofence schema, and saved project fields remain unchanged.

### Expected result
- The spinner no longer hangs forever.
- If Mapbox loads normally, the map appears and pin/polygon tools work.
- If Mapbox fails, the user sees a clear error state with retry instead of a blank gray box with endless loading.