

## Problem

The PackingDetail page currently shows only a compact one-line summary of booking info (client, date, address, contact) plus pack dates. The user wants it to match the project detail page style (image 2 / `BookingInfoExpanded`), showing:

1. **RIGG / EVENT / NEDRIVNING date cards** with edit capability
2. **Delivery address** section with full address
3. **Logistics** info (carry distance, ground nails, exact time)
4. **Internal notes** from the booking
5. **Booking attachments (files)** from the booking — not just packing files

## Plan

### 1. Expand booking data fetched

**`src/services/packingService.ts`** — Add missing fields to the booking select in `fetchPacking`:
- `delivery_city`, `delivery_postal_code`, `carry_more_than_10m`, `ground_nails_allowed`, `exact_time_needed`, `exact_time_info`, `internalnotes`, `rig_start_time`, `rig_end_time`, `event_start_time`, `event_end_time`, `rigdown_start_time`, `rigdown_end_time`

**`src/types/packing.ts`** — Extend the `PackingWithBooking.booking` interface with all the new fields.

### 2. Fetch booking attachments in packing detail

**`src/hooks/usePackingDetail.tsx`** — Add a query for `booking_attachments` when `packing.booking_id` is available, using `supabase.from('booking_attachments').select('*').eq('booking_id', bookingId)`. Expose as `bookingAttachments`.

### 3. Replace compact booking info with expanded card

**`src/pages/PackingDetail.tsx`** — Replace the current compact booking info strip (lines 319-351) with a new component that reuses the same layout as `BookingInfoExpanded`:

- **Client + booking number header** with icon (warehouse orange gradient instead of teal)
- **Schedule cards** (RIGG / EVENT / NEDRIVNING) — reuse `ProjectScheduleEditable` component directly, which already handles date editing via the planning API
- **Address / Logistics / Contact** grid — same 3-column layout as `BookingInfoExpanded`
- **Internal notes** — same muted card style
- **Booking files** — list booking attachments as read-only download links below the info card

### 4. Keep existing pack dates and tabs

The "Packdatum" row stays as-is (it's packing-specific, not booking data). The tabs (Checklista, Packlista, Produkter, Filer, Kommentarer) remain unchanged. The "Filer" tab continues to show packing-specific files.

### Files to modify

| File | Change |
|------|--------|
| `src/types/packing.ts` | Add logistics/notes/time fields to `PackingWithBooking.booking` |
| `src/services/packingService.ts` | Expand booking select query |
| `src/hooks/usePackingDetail.tsx` | Add `bookingAttachments` query |
| `src/pages/PackingDetail.tsx` | Replace compact info strip with expanded card using `ProjectScheduleEditable`, address/logistics/notes sections, and booking attachments list |

### Design notes

- Signature color: warehouse orange gradient (`hsl(38 92% 55%)`) for icons, not the teal/primary used in project views
- Layout, spacing, typography, and card structure will mirror `BookingInfoExpanded` exactly
- `ProjectScheduleEditable` is reused as-is (it handles its own booking date updates via the planning API proxy)
- Booking attachments shown as downloadable file links with file type icons, read-only (no upload/delete — those are managed in the planning system)

