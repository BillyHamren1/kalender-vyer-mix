

## Plan: Visa ALL rådata från Booking (read-only, ingen jämförelse)

### Vad vi gör
En ny action `raw-dump` i edge-funktionen som hämtar ALLA bekräftade bokningar från Booking-API:t och returnerar ALL data rakt av — datum, tider, produkter, kontakt, adress, allt. Ingen jämförelse mot lokalt, ingen skrivning, ingen radering.

En ny flik "Booking Rådata" på admin/sync-sidan som visar allt i en expanderbar lista.

### Steg

**1. Edge function: Ny `raw-dump` action**
- Hämtar alla confirmed bokningar från `export_bookings` (paginerat)
- Normaliserar fältnamn (samma `normalizeExternalBooking`)
- Returnerar hela arrayen direkt — inga DB-anrop, inga jämförelser, inga skrivningar
- Response: `{ bookings: [...all normalized booking objects with products, dates, times, contact, address, notes, attachments, status] }`

**2. Frontend: Ny "Booking Rådata" tab**
- Knapp "Hämta all data från Booking"
- Expanderbar lista per bokning som visar:
  - Bokningsnummer, klient, status
  - Alla datum (rigg, event, nedrigg)
  - Alla tider (start/slut för varje fas)
  - Adress, kontakt
  - Interna noter
  - Produktlista (namn, antal, pris)
  - Bilagor
- Sökfält för att filtrera på bokningsnummer/klient
- Sammanfattning: totalt antal bokningar

### Filer som ändras
- `supabase/functions/sync-reconciliation/index.ts` — ny `raw-dump` action block (~30 rader)
- `src/pages/SyncReconciliation.tsx` — ny tab + komponent för att visa rådata

