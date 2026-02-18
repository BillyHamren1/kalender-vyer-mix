
## Problem

In `ProjectLayout.tsx` line 62, the main content wrapper has `max-w-6xl` which caps it at ~1152px and leaves empty gray space on wider screens, as visible in the screenshot.

## Solution

Remove `max-w-6xl` from the container div in `ProjectLayout.tsx`. The container will then use the full available width (constrained naturally by the sidebar layout).

## File to change

| File | Line | Change |
|---|---|---|
| `src/pages/project/ProjectLayout.tsx` | 62 | Remove `max-w-6xl` from the className |

## Before vs After

**Before:**
```
<div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
```

**After:**
```
<div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
```

This also applies to the loading state on line 26 which has the same `max-w-6xl` constraint.
