

## Problem

`EventHoverCard` is imported on line 9 of `CustomEvent.tsx` but never actually used in the JSX. The event content is rendered as a plain `<div>` — no hover popup is ever triggered.

## Fix

Wrap the event card content with `<EventHoverCard>` in both render paths (read-only and normal).

### Changes in `src/components/Calendar/CustomEvent.tsx`

**Read-only path (line 199-203):** Wrap in `EventHoverCard`
```tsx
return (
  <EventHoverCard event={event} onDoubleClick={handleViewDetails}>
    {eventCardContent}
  </EventHoverCard>
);
```

**Normal path (line 217):** Wrap in `EventHoverCard`
```tsx
<EventHoverCard event={event} onDoubleClick={handleViewDetails} onClick={undefined}>
  <div onContextMenu={handleContextMenu} style={{ width: '100%', height: '100%' }}>
    {eventCardContent}
  </div>
</EventHoverCard>
```

### Also update `EventHoverCard.tsx`

Change `openDelay` from `300` to `1500` (line 39) per the user's 1.5-second requirement.

### Files to edit
- `src/components/Calendar/CustomEvent.tsx` — wrap content in `EventHoverCard`
- `src/components/Calendar/EventHoverCard.tsx` — set `openDelay={1500}`

