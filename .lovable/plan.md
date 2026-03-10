

## Problem

When scrolling horizontally in the calendar's weekly view, the browser interprets overscroll as a "back" navigation gesture. This is because the scrollable container (`.weekly-horizontal-grid`) lacks `overscroll-behavior-x: contain`, so when you reach the scroll boundary, the gesture "leaks" to the browser's native back/forward navigation.

## Fix

Add `overscroll-behavior-x: contain` to the horizontally scrollable containers in `src/components/Calendar/Carousel3DStyles.css`. This CSS property tells the browser to keep scroll chaining contained within the element, preventing the back-navigation gesture.

### File: `src/components/Calendar/Carousel3DStyles.css`

Add to `.weekly-horizontal-grid`:
```css
overscroll-behavior-x: contain;
```

Also add `touch-action: pan-x pan-y` to ensure touch gestures are handled correctly and don't trigger browser navigation.

### File: `src/components/Calendar/CustomCalendar.tsx`

The `handleWheel` listener (line 180-200) currently only attaches when `viewMode === 'weekly'`, but the weekly grid renders for both `weekly` and `monthly` modes (`isWeeklyMode`). This means in monthly mode, the wheel handler isn't active but the scroll container still exists — leading to uncontrolled scroll that can trigger back navigation. Fix the condition to use `isWeeklyMode` logic.

### Summary of changes
- **Carousel3DStyles.css**: Add `overscroll-behavior-x: contain` and `touch-action: pan-x pan-y` to `.weekly-horizontal-grid`
- **CustomCalendar.tsx**: Fix wheel listener to attach for both weekly and monthly modes

