## Mål
Återställ produktraderna på bokning **2604-119** (Creative Meetings Unlimited, eventdate 2026-05-18, large project Handelsbanken `fcb35596-…`) som är tom (`booking_products = 0`) medan systerbokningen 2604-90 har 11 produkter.

## Steg

1. **Anropa `import-bookings` riktat mot 2604-119**
   - Kör edge-funktionen med `bookingNumber: "2604-119"` och `mode: "force"` så att huvud-merge + produktloopen körs igen mot Bokning-API:t.
   - Funktionen är single-writer för bokningar/produkter och respekterar core-regeln "Booking system = single source of truth".

2. **Verifiera resultatet i DB**
   - `SELECT count(*) FROM booking_products WHERE booking_id = 'a9f8b78b-…'` → ska bli > 0.
   - Lista produkter (namn, qty, tags) och jämför att de matchar källan.

3. **Diagnos om tomt även efter re-sync**
   - Då är källan själv tom för 2604-119 → felet ligger i Bokning-systemet, inte hos oss. Rapportera tillbaka med exakt API-svar (status, products[]-längd) så användaren kan åtgärda i källan.
   - Granska samtidigt `import-bookings` produktloop (recovery ~rad 2951 + huvud-merge ~rad 3495) för att utesluta att vi tappat raderna lokalt vid en tidigare körning.

4. **Ingen lokal "skapa produkter"-fix**
   - Vi skapar inte produkter manuellt lokalt — det skulle bryta single-source-policyn och skrivas över vid nästa sync.

## Inga kodändringar planerade
Det här är en data-/sync-operation. Endast kodändringar görs om steg 3 visar en bugg i `import-bookings`.

## Efter implementation
Rapporterar antal produkter före/efter, samt om problemet låg lokalt (sync-bugg) eller i källan (Bokning-API).