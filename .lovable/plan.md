

## Fix: Visa bokningsnamn istället för UUID:er i bokningsväljaren

### Problem
Bokningsväljaren i "Lägg till aktivitet"-dialogen visar bara råa UUID:er. Det beror på att mappningen i `LargeEstablishmentPage.tsx` försöker läsa `b.client` direkt, men klientnamnet ligger på `b.booking.client`.

### Lösning
Uppdatera mappningen på **två ställen** i `LargeEstablishmentPage.tsx` (rad 89-93 och 114-118) så att `client` hämtas från `b.booking?.client` och `display_name` fallbackar till `b.booking?.booking_number` eller klientnamn:

```typescript
// Ändra från:
(project.bookings || []).map(b => ({
  booking_id: b.booking_id,
  display_name: b.display_name,
  client: (b as any).client,
}))

// Till:
(project.bookings || []).map(b => ({
  booking_id: b.booking_id,
  display_name: b.display_name || b.booking?.client || b.booking?.booking_number || b.booking_id,
  client: b.booking?.client || null,
}))
```

### Filer att ändra
- **`src/pages/project/LargeEstablishmentPage.tsx`** — Fixa mappningen på rad 89-93 och rad 114-118

En enkel fix som gör att bokningsväljaren visar klientnamn/bokningsnummer istället för UUID:er.

