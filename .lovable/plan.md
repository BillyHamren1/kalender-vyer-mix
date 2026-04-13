

## Plan: Visa OFFER-bokningar som finns i Planning

### Problem
Vyn visar bara CONFIRMED-bokningar från Booking. Men det finns bokningar med status OFFER i Booking som fortfarande finns i Planning-databasen. Dessa syns inte alls nu, trots att de kan vara ett problem (borde kanske inte finnas i Planning, eller borde ha annan status).

### Lösning

**1. Utöka UI-filtren i `src/pages/SyncReconciliation.tsx`**

Lägg till en tredje filterknapp och sektion:
- **Avvikelser** (nuvarande) — CONFIRMED som saknas/avviker i Planning
- **Alla CONFIRMED** (nuvarande) — alla bekräftade
- **Ej bekräftade i Planning** (ny) — bokningar som INTE är CONFIRMED i Booking men som ändå finns lokalt i Planning

Visa dessa med tydlig markering: "Denna bokning är OFFER i Booking men finns i Planning med status X"

**2. Filtrera från befintlig data**

Edge-funktionen `booking-overview` returnerar redan ALLA bokningar (inte bara CONFIRMED). Datan finns redan — vi behöver bara använda den i UI:t:

```
const nonConfirmedInPlanning = bookings.filter(
  b => b.externalStatus !== 'CONFIRMED' && b.existsLocally
);
```

**3. Uppdatera sammanfattningskorten**

Lägg till ett femte kort: "Ej bekräftade i Planning" med antal och röd markering om > 0.

### Tekniska detaljer

- Bara UI-ändring i `src/pages/SyncReconciliation.tsx`
- Ingen backend-ändring behövs — datan finns redan
- Ny filterknapp + ny tabell-filtrering
- Samma tabellformat, men med extra varning-ikon för dessa rader

### Resultat
- Användaren ser direkt vilka OFFER/CANCELLED-bokningar som fortfarande ligger kvar i Planning
- Kan agera på dem (radera, ändra status, etc.)

