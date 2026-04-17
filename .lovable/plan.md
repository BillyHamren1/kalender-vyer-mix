

## Root cause

The header is placed *inside* the scroll container (`TimeAppLayout`'s `overflow-y-auto` div) using `position: sticky`. On iOS in a Capacitor WKWebView, `position: sticky` inside an internal scroll container with momentum scrolling (`-webkit-overflow-scrolling: touch`) is a long-standing broken combination — the sticky element visually "follows" the scroll with a delay, causing the bouncing/moving you see.

The previous fixes (removing transforms, raising z-index, sticky/top-0 tweaks) cannot solve this because the bug is in WebKit's compositing of sticky inside a non-document scroller.

## The fix: portal the header out of the scroll area

Restructure so the header lives **above** the scroll container as a real sibling, not inside it. Each page keeps using `<MobileHeroHeader />` / `<MobileBackHeader />` exactly as today — no page-level changes needed.

```text
TimeAppLayout
├── <div id="mobile-header-slot">   ← headers portal here (NOT scrollable)
├── <div ref=scrollRef overflow-auto>
│     {children}                    ← page content scrolls under the header
└── <MobileBottomNav />
```

Implementation:

1. **`TimeAppLayout.tsx`** — add a `<div id="mobile-header-slot" className="shrink-0 bg-primary" />` as the first child of the inner flex column, before the scroll container. This div has no fixed height; it grows to fit whichever header is portaled into it.

2. **`MobileHeader.tsx`** — wrap each of the three header variants with `createPortal(content, document.getElementById('mobile-header-slot'))`. Use a small `useMobileHeaderSlot()` hook that:
   - Returns the slot element once mounted (with a `useEffect` retry for the first paint)
   - Falls back to inline rendering if the slot isn't found (so non-Time shells like Scanner still work)
   - Removes all `sticky top-0` classes from the header markup itself — they're no longer needed because the slot is already outside the scroll area

3. **Keep the safe-area padding** (`paddingTop: env(safe-area-inset-top)`) on the header — it still needs to sit below the iOS status bar.

4. **Remove now-redundant `min-h-screen` issues**: pages still use `flex flex-col min-h-screen`, which is fine because the header is no longer a flex child taking layout space (it's portaled out). The `flex-1` content area continues to fill the scroll container.

## Files to edit

- `src/shells/time/TimeAppLayout.tsx` — add the header slot div above the scroll container
- `src/components/mobile-app/MobileHeader.tsx` — portal the three header variants into the slot, drop `sticky top-0`

## Why this is guaranteed to work

The header is no longer scrolled at all — it's a static sibling of the scroll container. There is nothing for iOS sticky to break. The header simply cannot move because it's outside the element that scrolls.

## Verification after deploy

- Pull, `npm run build`, `npx cap sync ios`, rebuild in Xcode
- Open Time app on iPhone, scroll any page hard with momentum — header must stay rock-solid
- Check all three header types: Jobs (hero), Job Detail (back), Profile (profile)
- Confirm no double headers in Scanner shell (fallback path)

