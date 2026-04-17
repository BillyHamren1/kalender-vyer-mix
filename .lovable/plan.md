

## Problem

Top headers in the Time app still scroll away on `/m/report` (and other pages) despite having `sticky top-0`.

## Root cause

Both `MobileAppLayout.tsx` and `TimeAppLayout.tsx` wrap their content in an inner `<div className="flex-1 overflow-y-auto">`. This makes that div the **scroll container**. The page content + sticky header live inside it.

When the page content uses `<div className="flex flex-col min-h-screen ...">`, the sticky header's containing block is this flex page wrapper. In iOS Safari (and some Chromium WebViews), the combination of:
1. A scroll container with `overflow-y-auto`
2. A flex-column child that's `min-h-screen`
3. A `sticky top-0` element inside that flex child

…breaks `position: sticky` — the header scrolls away with the content.

`MobileTimeReport.tsx` additionally has `overflow-x-hidden` on the page wrapper, which compounds the issue (it creates a second scroll context that can capture the sticky element).

## Fix strategy

Use the **document scroll** instead of an internal scroll container. This is the most reliable cross-browser pattern for sticky headers on mobile.

### Changes

**1. `src/components/mobile-app/MobileAppLayout.tsx`** and **`src/shells/time/TimeAppLayout.tsx`**

Remove `overflow-y-auto` from the inner div so the document body becomes the scroll context. Keep the bottom padding for the fixed bottom nav.

```tsx
<div className="min-h-screen bg-card max-w-lg mx-auto">
  <div style={{ paddingBottom: 'calc(68px + env(safe-area-inset-bottom, 0px) + 16px)' }}>
    {/* banners + children */}
  </div>
  <MobileBottomNav />
</div>
```

(Drop the outer `flex flex-col` since we're no longer using `flex-1` for inner scrolling.)

**2. `src/pages/mobile/MobileTimeReport.tsx`**

Remove `overflow-x-hidden` from the page wrapper (line 219) — it's the secondary culprit and `min-w-0/max-w-full box-border` on the inner content already handles overflow.

**3. Verify** `MobileBottomNav` is `fixed bottom-0` (already confirmed) — it will continue to work since fixed is viewport-relative.

### Why this works

With document-level scroll:
- `sticky top-0` on headers pins to the actual viewport top (no nested scroll container ambiguity)
- `fixed bottom-0` on bottom nav continues to pin to viewport bottom
- `max-w-lg mx-auto` still centers the column on wider screens
- iOS Safari handles sticky + document scroll reliably

### Files touched

- `src/shells/time/TimeAppLayout.tsx` — remove inner scroll container
- `src/components/mobile-app/MobileAppLayout.tsx` — remove inner scroll container
- `src/pages/mobile/MobileTimeReport.tsx` — remove `overflow-x-hidden`

No changes needed in `MobileHeader.tsx` (sticky classes already correct).

