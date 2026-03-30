

## Problem

When two jobs land on the same team, same day, same time, they get identical absolute positions (`top` and `height` in pixels). One event renders directly on top of the other — completely hidden. There is no collision detection or layout adjustment.

## Current Rendering Logic

In `TimeGrid.tsx`, `getEventPosition()` returns `{ top, height }` based purely on the event's start/end time. Events are then rendered with `position: absolute` at that exact pixel offset. No width or left-offset adjustment is made for overlapping events.

## What Should Happen

Overlapping events on the same team column should be displayed **side-by-side**, each taking a fraction of the column width. This is the standard calendar pattern (Google Calendar, Outlook, FullCalendar all do this).

```text
Before (broken):          After (fixed):
┌──────────┐              ┌─────┬─────┐
│ Event A  │              │  A  │  B  │
│ (hides B)│              │     │     │
└──────────┘              └─────┴─────┘
```

## Plan

### Step 1: Add overlap detection utility

Create a function `computeOverlapLayout(events)` that:
- Groups events by time overlap (if event A's time range intersects event B's, they're in the same group)
- For each overlap group, assigns a `column` index (0, 1, 2...) and `totalColumns` count
- Returns a map of `eventId → { column, totalColumns }`

Algorithm: sort by start time, then greedily assign columns using a sweep-line approach.

### Step 2: Apply layout in TimeGrid.tsx

In the rendering section (lines 528-543), use the overlap layout to set:
- `width`: `100% / totalColumns` (e.g., 50% if 2 events overlap)
- `left`: `column * (100% / totalColumns)`

Non-overlapping events continue to use `width: 100%`.

### Step 3: Adjust EventWrapper styling

Update the `EventWrapper` component to accept and apply `left` and `width` style props from the overlap calculation, replacing the current fixed full-width positioning.

### Technical Details

**File: `src/components/Calendar/TimeGrid.tsx`**

1. Add `computeOverlapLayout` function (~30 lines) that takes an array of events and their positions, returns a Map of layout info per event ID
2. Call it per resource in the render loop (line 502), after `getEventsForDayAndResource`
3. Pass `overlapLayout` data to each `EventWrapper`
4. In `EventWrapper`, apply `left` and `width` styles from the layout data

**No other files need changes** — this is purely a rendering concern within TimeGrid.

