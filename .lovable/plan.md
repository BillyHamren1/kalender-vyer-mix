
## Problem

`ProjectProductsList` renders its own `<Card>` wrapper internally. This causes "Utrustning" and "Bilder" to look like separate cards visually, even though they are already placed inside `BookingInfoExpanded`'s outer card. The result is cards-within-cards instead of a unified container.

## Solution

Remove the `<Card>` and `<CardContent>` wrappers from `ProjectProductsList` so the product list renders as plain content — no nested card. The outer `BookingInfoExpanded` card already provides the container.

## Changes

### `src/components/project/ProjectProductsList.tsx`

- Remove `Card`, `CardContent` imports
- Replace all 3 `<Card>/<CardContent>` returns (loading state, empty state, normal state) with plain `<div>` elements
- The styling/padding already comes from the parent's `px-5 pb-2` wrapper in `BookingInfoExpanded`

### Before vs After

**Before** — nested cards:
```text
┌─ BookingInfoExpanded Card ──────────────────┐
│  [Client header]                            │
│  [Timeline]                                 │
│  ┌─ ProjectProductsList Card ─────────────┐ │
│  │  Multiflex 10x21                  1 st │ │
│  │    • M Gaveltriangel              2 st │ │
│  └────────────────────────────────────────┘ │
│  [Bilder section]                           │
└─────────────────────────────────────────────┘
```

**After** — single unified container:
```text
┌─ BookingInfoExpanded Card ──────────────────┐
│  [Client header]                            │
│  [Timeline]                                 │
│  ─────────────────────── (border-t)         │
│  Utrustning                                 │
│  Multiflex 10x21                      1 st  │
│    • M Gaveltriangel                  2 st  │
│  ─────────────────────── (border-t)         │
│  Bilder                                     │
│  [image grid]                               │
└─────────────────────────────────────────────┘
```

## Files to modify

| File | Change |
|---|---|
| `src/components/project/ProjectProductsList.tsx` | Remove `Card`/`CardContent` wrappers, use plain `<div>` elements |
