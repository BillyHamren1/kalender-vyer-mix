

## Plan: Make "Uppdaterade bokningar" more attention-grabbing

### Problem
The updated bookings card blends in too much with other dashboard content. Users need a clearer visual signal that these items require action.

### Changes in `src/components/dashboard/DashboardUpdatedBookings.tsx`

1. **Amber/orange color scheme** instead of blue — amber conveys "needs attention" more clearly
2. **Pulsing dot** next to the badge count to signal pending action
3. **Stronger top bar** — thicker gradient bar in amber/orange tones
4. **Action-oriented header text** — add subtitle like "Kräver granskning" 
5. **Border highlight** — subtle amber ring around the entire card to distinguish it from passive content
6. **Badge styling** — amber background with bolder text for the count badge

The booking rows themselves stay largely the same — the goal is to make the outer card unmissable at a glance without changing interaction patterns.

