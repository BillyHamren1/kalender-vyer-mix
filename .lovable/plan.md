# Fixa "0 kr" i Projektöversikten – och sluta ladda hela produktregistret

## Vad som faktiskt är fel

Summan i listan är projektets produktintäkt. Den hämtas i första hand från Booking-systemet; när det svaret saknar belopp används vår egen kopia av orderraderna som reserv.

Reserven är byggd fel idag:

- Den frågar efter **alla orderrader för alla 351 projekt på en gång** (12 914 rader, sida för sida). Det är onödigt tungt och exakt det du reagerar på.
- Alla boknings-id skickas i **en enda webbadress**. Med ~350 id blir adressen så lång att anropet faller, hela reserven hoppas över tyst, och raderna visar 0 kr.

Att beloppen finns är verifierat i databasen: Westers Catering 19 sep = 17 158 kr, Westmans 19 sep, Rydbergs 21 sep = 191 500 kr. Det är alltså bara hämtningen som fallerar, inte datan.

## Lösning

Låt databasen summera i stället för att skicka hem varje rad.

1. Ny läsfunktion i databasen som tar en lista boknings-id och returnerar **en summerad rad per bokning** (intäkt och kostnad). Läsning sker med POST, så ingen adresslängd-gräns, och svaret blir ~350 små rader i stället för 12 914.
2. Ekonomiöversikten anropar den i stycken om 200 bokningar, så gränserna aldrig nås oavsett hur många projekt som finns.
3. Den gamla sidvisa hämtningen av alla orderrader tas bort.
4. Booking-systemets egen summa vinner alltid när den finns och är större än noll – reserven fyller bara tomma rader. Oförändrad regel.
5. Om reserven ändå fallerar ska det synas i loggen som ett tydligt fel i stället för att tyst ge 0 kr.

## Teknisk detalj

- Ny SQL-funktion `public.get_booking_product_revenue(booking_ids uuid[])` – `stable`, `security invoker`, respekterar befintlig RLS och tenant-scope, `grant execute` till `authenticated`. Summerar `coalesce(total_price, unit_price * quantity)` som intäkt och `purchase_cost * quantity` som kostnad, grupperat på `booking_id`.
- `src/lib/economy/bookingProductEconomyFallback.ts`: byt `fetchAllBookingProductEconomyRows` mot `fetchBookingProductEconomyTotals(bookingIds, rpc)` med chunkning (`BOOKING_ID_CHUNK_SIZE = 200`). `mergeBookingProductEconomyFallback` behålls oförändrad.
- `src/hooks/useEconomyOverviewData.ts`: anropa `supabase.rpc('get_booking_product_revenue', { booking_ids: chunk })`; ta bort radhämtningen mot `booking_products`.
- Tester: uppdatera `bookingProductEconomyFallback.test.ts` – chunkning vid >200 id, summor mappas per bokning, positiv proxy-summa skrivs aldrig över. Kör riktade ekonomitester + build.
