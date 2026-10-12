# Synthetic boundary test receipt

2026-10-12: Node v24.19.0, `node --experimental-transform-types --test internal-project-*.test.mjs`: 9 passed, 0 failed.

Six adapter cases are documented in BOOKING-CATERING.md. Three additional boundary tests execute unmodified Catering main `b1cc307850e66a05a9197553e3d4eabd64a2d7a5` file `src/features/catering/infrastructure/server/booking-projection.server.ts` with an injected in-memory RPC recorder:

1. Canonical internal project lacking booking_id returns booking_id_required and makes zero RPC calls.
2. A commercial booking for a different organization returns organization_mismatch and makes zero RPC calls.
3. Existing Confirmed customer booking invokes upsert_catering_booking_projection exactly once with unchanged payload.

Place the pinned booking-projection.server.ts beside the companion boundary test to reproduce. No database, browser, actual staff or customer data was used. These tests establish current boundary behavior; they do not validate deployed authorization, multi-service delivery or login.
