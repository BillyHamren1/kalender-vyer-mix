# Återställ booking-skrivvägen till `bookings`/PUT

## Rotorsak
Commit `1bc58062` (1 maj) bytte alla 5 skrivhelpers i `src/services/planningApiService.ts` från `type: 'bookings', method: 'PUT', id: bookingId` till `type: 'update_booking', method: 'POST', booking_id: bookingId`. Externa Booking-API:t accepterar inte `update_booking` och svarar `400 Unknown type: update_booking`. Detta bröt: datumändring (kalender + bokningsdetalj), fastider, leveransadress/kontakt, internalnotes, status, logistikflaggor.

## Åtgärd

**1. `src/services/planningApiService.ts`** — återställ 5 funktioner till tidigare format:
- `updateBookingDatesViaApi`
- `updateDeliveryViaApi`
- `updateInternalNotesViaApi`
- `updateBookingStatusViaApi`
- `updateLogisticsViaApi`

Mönster: `callPlanningApi({ type: 'bookings', method: 'PUT', id: bookingId, data })`

**2. `supabase/functions/sync-reconciliation/index.ts`** rad 225 — byt `type: "update_booking"` till samma `bookings`/PUT-mönster.

## Verifiering
- Drag/drop i `/calendar` → datum sparas utan 400.
- Bokningsdetalj → ändra datum/tid/notes/status → sparas.
- Inga DB-ändringar, ingen UI-ändring, ingen edge-funktionsändring (proxyn vidarebefordrar bara typen).
