

## Fix: Instant UI Update When Moving Events via Right-Click Dialog

### Problem
When moving an event using the right-click → MoveEventDateDialog flow, the UI only updates after `refreshEvents()` completes a full database re-fetch. This causes a visible delay.

### Solution
Pass `setEvents` down from the page level so `MoveEventDateDialog` can optimistically update the local events array immediately, before the DB write finishes.

### Changes

**1. `src/hooks/useRealTimeCalendarEvents.tsx`**
- Expose `setEvents` in the return value

**2. `src/pages/CustomCalendarPage.tsx` + `src/pages/WarehouseCalendarPage.tsx`**
- Destructure `setEvents` from `useRealTimeCalendarEvents()`
- Pass it as a new `setEvents` prop to `CustomCalendar`

**3. `src/components/Calendar/CustomCalendar.tsx`**
- Add `setEvents` to props interface
- Pass it through to `TimeGrid` → `EventBlock` → `CustomEvent`

**4. `src/components/Calendar/TimeGrid.tsx`**
- Thread `setEvents` prop through to `EventBlock` → `CustomEvent`

**5. `src/components/Calendar/CustomEvent.tsx`**
- Accept `setEvents` prop
- Pass it to `MoveEventDateDialog` as a new `onOptimisticUpdate` callback

**6. `src/components/Calendar/MoveEventDateDialog.tsx`**
- Accept optional `setEvents` prop
- In `handleMove`, **before** the `await updateCalendarEvent()` call, optimistically update the event in local state:
```typescript
if (setEvents) {
  setEvents(prev => prev.map(ev =>
    ev.id === event.id
      ? { ...ev, start: newStartISO, end: newEndISO, resourceId: selectedResourceId || ev.resourceId }
      : ev
  ));
}
```
- Keep the existing `onUpdate` (refreshEvents) call as a background sync/error fallback

### Flow After Fix
```text
User clicks "Flytta" → setEvents() updates UI instantly
                      → async DB write runs in background
                      → refreshEvents() confirms final state
                      → on error: refreshEvents() reverts
```

