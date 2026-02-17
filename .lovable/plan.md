
## Fix: Increase spacing between form fields on small screens

The time report form fields overlap on smaller screens because the vertical spacing is too tight (`space-y-3`).

### Changes

**File: `src/pages/mobile/MobileTimeReport.tsx`**

- Increase the form's internal vertical spacing from `space-y-3` to `space-y-4` (line 135)
- Increase the grid gap for the two side-by-side field rows (Start/Slut, Rast/Overtid) from `gap-2.5` to `gap-3` (lines 159, 170)
- Add slightly more breathing room between label and input by changing `space-y-1` to `space-y-1.5` on each field group (lines 138, 154, 160, 164, 171, 175, 181)

This keeps the compact design but prevents fields from colliding on smaller viewports.
