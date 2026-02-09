

# Fix: "Visa rutt" and "Fullvy" buttons

## Problem

The buttons DO fire correctly (state is updated), but nothing visible happens because:

1. **Race condition**: Route layers are loaded asynchronously via Mapbox Directions API. The highlight effect runs before layers exist, and the 6-second retry often isn't enough.
2. **Same-click ignored**: Clicking "Visa rutt" on the same booking twice doesn't re-trigger the `useEffect` because `highlightedAssignmentId` hasn't changed.
3. **Filter switch delay**: When `mapFilter` is "projects", it switches to "all" and returns early. This triggers a full route reload (async), creating another race.
4. **"Fullvy" opens dialog instead of navigating**: The "Fullvy" button calls `onClick()` which expands the transport widget in a dialog -- likely not what the user expects.

## Solution

Stop relying on finding/restyling async-loaded route layers. Instead, draw a dedicated highlight route directly when "Visa rutt" is clicked.

### Changes

**1. `src/components/logistics/widgets/LogisticsMapWidget.tsx`**

Replace the entire highlight `useEffect` (lines 277-348) with a self-contained approach:
- When `highlightedAssignmentId` changes, fetch the route geometry directly (from cache or Mapbox Directions API)
- Add a dedicated `highlight-route` source/layer with a thick bright red line
- Zoom to fit the route bounds
- Clean up the highlight layer when deselected
- Use a callback-based approach instead of `useEffect` to avoid same-value issues

Expose a `highlightRoute(assignmentId)` method via a ref or convert `highlightedAssignmentId` to use a counter/timestamp to force re-triggers.

**2. `src/pages/LogisticsPlanning.tsx`**

- Change `highlightedAssignmentId` state to include a timestamp so re-clicking the same route re-triggers the effect:
  ```
  const [highlightTarget, setHighlightTarget] = useState<{id: string, ts: number} | null>(null);
  ```
- Pass `highlightTarget` to the map widget

**3. `src/components/logistics/widgets/LogisticsTransportWidget.tsx`** (minor)

- No changes needed to the button itself, the `onShowRoute` callback is correct.

### Technical details for the highlight approach

```text
User clicks "Visa rutt"
  --> onShowRoute(assignmentId) called
  --> setHighlightTarget({ id: assignmentId, ts: Date.now() })
  --> MapWidget useEffect detects change (ts always different)
  --> Remove any existing "highlight-route" layer/source
  --> Find assignment in assignments array
  --> Get pickup/delivery coordinates
  --> Fetch route from cache or Directions API
  --> Add "highlight-route" source with bright red thick line
  --> fitBounds to route
```

This eliminates all race conditions because:
- We don't depend on other async layers existing
- The timestamp ensures every click re-triggers
- We fetch the route geometry ourselves if needed
- The highlight is a separate, dedicated layer

