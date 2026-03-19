

# Fix: Hämta booking_number med separat query

## Problem
Joinen `bookings!inner(booking_number)` i `verify_product` misslyckas eftersom det inte finns någon foreign key mellan `packing_projects.booking_id` och `bookings.id` i databasen. PostgREST returnerar ett fel, som fångas och visar "Packlistan saknar kopplad bokning".

## Lösning
Dela upp i två separata queries istället för en join:

### Fil: `supabase/functions/scanner-api/index.ts`

1. Första queryn hämtar `booking_id` från `packing_projects` (utan join)
2. Andra queryn hämtar `booking_number` från `bookings` med det `booking_id`

```typescript
// Query 1: Get booking_id
const { data: packing } = await supabase
  .from('packing_projects')
  .select('booking_id')
  .eq('id', packingId)
  .eq('organization_id', ORG_ID)
  .single();

if (!packing?.booking_id) {
  return json({ success: false, error: 'Packlistan saknar kopplad bokning' });
}

// Query 2: Get booking_number
const { data: booking } = await supabase
  .from('bookings')
  .select('booking_number')
  .eq('id', packing.booking_id)
  .eq('organization_id', ORG_ID)
  .single();

const bookingNumber = booking?.booking_number;
```

## Filer som ändras
1. `supabase/functions/scanner-api/index.ts` -- Byt join till två separata queries

