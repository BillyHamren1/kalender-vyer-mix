## Current diagnosis
Do I know what the issue is? Yes.

The current crash is no longer the original boot-time white screen. The app now mounts, then fails when the `/calendar` route lazily imports `src/pages/CustomCalendarPage.tsx`.

The problem is:
- `src/main.tsx` already handles boot/preload module failures with cache purging.
- But route-level `React.lazy(...)` failures happen after mount.
- Those errors currently fall into `GlobalErrorBoundary`, which only does a plain `window.location.reload()`.
- A plain reload can reuse the same stale document/module graph, so the user gets stuck on the same error screen.

## Plan
1. Extract the module-recovery logic from `src/main.tsx` into a shared utility.
   - Move the stale-module detection, cooldown key, cache purge, service-worker unregister, and hard-reload flow into a reusable helper.
   - Keep the behavior consistent for both boot-time and route-time failures.

2. Add route-level recovery for lazy imports.
   - Introduce a `lazyWithRecovery` wrapper (or equivalent shared lazy loader) for route modules.
   - Use it for `CustomCalendarPage` and the other route-level lazy pages in `src/App.tsx`.
   - On `Failed to fetch dynamically imported module` and similar stale-chunk errors, trigger the same recovery path instead of just throwing a generic React error.

3. Upgrade `GlobalErrorBoundary` to distinguish module-fetch failures from true render bugs.
   - If the error is a lazy-module fetch failure, show a recovery UI that uses the shared cache-purge + hard-reload path.
   - For normal React rendering errors, keep the existing diagnostic fallback behavior.
   - Update the button behavior so the user never gets only a plain reload for stale chunk issues.

4. Keep diagnostics intact.
   - Continue reporting these failures to diagnostics, but tag them clearly as module-load failures vs render errors.
   - Preserve the current cooldown so the app attempts one automatic recovery before showing the manual retry UI.

5. Scope the first fix to the failure path the user is on, then apply consistently.
   - Ensure `/calendar` is protected first.
   - Apply the same recovery wrapper/pattern to the rest of the lazy-loaded routes so the problem does not reappear on other pages like mobile or warehouse views.

## Files to update
- `src/main.tsx`
- `src/App.tsx`
- `src/components/diagnostics/GlobalErrorBoundary.tsx`
- likely one new shared helper file, e.g. `src/utils/moduleRecovery.ts` or similar

## Technical details
```text
User opens /calendar
  -> React.lazy(import('./pages/CustomCalendarPage'))
  -> browser requests stale or missing module URL
  -> import rejects
  -> shared recovery detects stale-module error
       -> report diagnostic
       -> purge caches + unregister SW
       -> hard reload once
  -> if still failing after cooldown
       -> show manual "Töm cache och ladda om" UI
```

Implementation shape:
- Shared helpers:
  - `shouldRecoverFromModuleError(error)`
  - `purgeBrowserCaches()`
  - `recoverFromModuleError(...)`
- Shared lazy wrapper:
  - `lazyWithRecovery(() => import('./pages/CustomCalendarPage'))`
- Error boundary button:
  - use shared recovery helper instead of plain `window.location.reload()`

## Expected outcome
- `/calendar` no longer traps the user on the generic error screen after a stale lazy import.
- Stale chunk/module mismatch errors recover the same way whether they happen at boot or during navigation.
- Real component bugs still surface as diagnostics instead of being hidden behind forced reload behavior.