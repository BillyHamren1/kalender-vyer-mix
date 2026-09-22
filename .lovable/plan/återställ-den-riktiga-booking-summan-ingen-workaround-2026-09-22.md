# Återställ den riktiga Booking-summan – ingen workaround

## Bekräftat problem

Du har rätt: Planning ska inte ladda tusentals lokala produktrader för att återskapa en summa som Booking redan äger.

Det verifierade felet ligger i den ordinarie kedjan:

- Ekonomiöversikten bad nu om 444 bokningar.
- `planning-api-proxy` förnyade cachen för alla 444 klockan 18:56.
- Booking-anropets `product_costs` blev `null` även för bokningar som har riktiga belopp.
- Proxyn sväljer idag fel från varje delanrop med `.catch(() => null)` och sparar därefter detta `null` som om det vore ett giltigt svar.
- Listan tolkar `null` som 0 kr.

Det såg ut att fungera tidigare därför att äldre cachade svar eller den lokala reserven råkade ge belopp. När cachen förnyades sparades de misslyckade Booking-svaren som `null`, och felet blev synligt. Den lokala 1 000-radershämtningen maskerade alltså det riktiga felet och var aldrig en korrekt lösning.

## Åtgärd

1. **Ta bort den lokala reservberäkningen helt.** Ingen summering från `booking_products` i ekonomiöversikten.
2. **Gör Booking-felet synligt i serverflödet.** `planning-api-proxy` ska kontrollera HTTP-status och svar för `product_costs`, logga endast säker felmetadata och aldrig omvandla ett misslyckat anrop till ett giltigt nollvärde.
3. **Spara aldrig trasiga ekonomisvar i cachen.** Ett svar där `product_costs` misslyckats ska inte skriva över ett tidigare giltigt cachevärde.
4. **Fastställ och rätta det exakta upstream-felet.** Kör ett riktat serveranrop för en av de berörda bokningarna och kontrollera status/svarsform. Om felet finns i Planning-proxyn rättas det här. Om Booking-tjänsten själv returnerar fel lämnas raden tydligt som “Summan kunde inte hämtas” – aldrig falskt `0 kr` – och det externa felet rapporteras exakt.
5. **Hämta endast listans relevanta bokningar.** Begränsa serveranropet till projekten i vald fas/listvy, chunkat och tenant-säkrat; inga 12 914 produktrader laddas.
6. **Återhämta berörda cacheposter utan delete eller bred backfill.** Nästa lyckade hämtning skriver över `null` för endast efterfrågade bokningar.

## Verifiering

- Kontraktstest: ett misslyckat `product_costs` får aldrig bli 0 kr eller cachas som lyckat.
- Kontraktstest: ekonomiöversikten använder inte lokal `booking_products`-reserv.
- Riktat test av Westers Catering 19 sep och Rydbergs 21 sep mot Booking-källan.
- Kontroll att listan visar de kanoniska summorna efter cacheförnyelse.
- Kör riktade Vitest-tester, full relevant ekonomisvit och verifiera preview direkt efter ändringen.
