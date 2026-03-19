

# Fix: Skicka booking_number i rätt fält till lagersystemet

## Problem
Det externa lagersystemet förväntar sig bokningsnumret i fältet `booking_number`, men vi skickar det bara som `reservation_id`. Loggarna visar: `reservation=2603-95 booking=N/A`.

## Lösning
Lägg till `booking_number` som ett separat fält i POST-bodyn till `allocate-instance`, utöver `reservation_id`.

### Fil: `supabase/functions/scanner-api/index.ts` (rad 279-282)

Ändra request body från:
```typescript
body: JSON.stringify({
  serial_number: serialNumber,
  reservation_id: bookingNumber,
}),
```

Till:
```typescript
body: JSON.stringify({
  serial_number: serialNumber,
  reservation_id: bookingNumber,
  booking_number: bookingNumber,
}),
```

## Filer som ändras
1. `supabase/functions/scanner-api/index.ts` — Lägg till `booking_number` i request body

