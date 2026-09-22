# Återställ riktiga summor från Booking

## Mål
Kolumnen **Summa** ska åter visa Bookings kanoniska produktintäkt för de bokningar som visas. Ingen lokal beräkning från Planning får maskera fel, och ett misslyckat Booking-anrop får aldrig visas som `0 kr`.

## Genomförande
1. Ta bort den lokala `booking_products`-reservhämtningen från ekonomiöversikten och dess tillhörande hjälpkod/test.
2. Skärp `planning-api-proxy` så varje Booking-svar kontrolleras för HTTP-fel, ogiltig JSON och felpayload.
3. Behandla `product_costs` som obligatoriskt för en giltig ekonomipost. Misslyckade svar får inte skrivas till `economy_cache` eller ersätta ett tidigare giltigt cachevärde.
4. Returnera tydlig status per berörd bokning så gränssnittet visar **Summan kunde inte hämtas** i stället för falska `0 kr` när Booking-källan faktiskt felar.
5. Begränsa ekonomihämtningen till boknings-ID:n för posterna i listan och behåll strikt organisationsavgränsning i cacheläsning och cacheskrivning.
6. Kör ett riktat anrop för en påverkad bokning för att fastställa och rapportera exakt om felet ligger i Planning-proxyn eller Booking-tjänsten.

## Tester och verifiering
- Kontraktstest: misslyckat `product_costs` blir aldrig `0 kr` och cachas aldrig som lyckat.
- Kontraktstest: ekonomiöversikten använder ingen lokal `booking_products`-reserv.
- Riktade Vitest-tester och ekonomisviten.
- Kontroll i preview direkt efter kodändringen; om autentiserad preview fortsatt är otillgänglig verifieras serveranrop, tester och aktuell fellogg utan att exponera hemligheter.

## Tekniskt
- Ingen ny databasfunktion, tabell, migration eller lokal summa-workaround.
- Ingen ändring i Booking-repot.
- Ingen radering eller bred återfyllning av produktdata.
