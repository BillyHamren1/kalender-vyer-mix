

## Fix: TRANSPORT Badge Colors Inverted

### Problem
The "TRANSPORT" badge shows a **solid teal background with white text** (wrong) instead of a **light/transparent teal background with teal text** (correct, as in Image 1). The CSS class `bg-primary/10` doesn't work correctly with HSL custom property values -- the opacity modifier fails, resulting in a fully opaque primary background.

### Solution
Replace `bg-primary/10` and similar opacity-based background classes with explicit Tailwind color classes that guarantee a light, transparent appearance.

### Changes

**File: `src/components/logistics/widgets/LogisticsTransportWidget.tsx`**

1. **TRANSPORT badge (line 82):** Change from `bg-primary/10 text-primary border-primary/30` to use `bg-teal-50 text-teal-700 border-teal-200` (explicit light teal that won't fail).

2. **Status badges in `getStatusBadge` (lines 41-44):** Same fix -- replace `bg-primary/15` with `bg-teal-50` and `bg-destructive/15` with `bg-red-50`, `bg-amber-500/15` with `bg-amber-50` to ensure light backgrounds render correctly.

This ensures the cards match Image 1: white card background, light-teal TRANSPORT badge with teal text.
