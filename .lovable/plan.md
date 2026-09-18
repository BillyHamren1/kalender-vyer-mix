# Återställ summorna i Projektöversikten

## Bekräftad orsak
- Kolumnen **Summa** visar bokningens produktintäkt (`productRevenue`).
- Booking-systemets ekonomisvar används först. När det saknar produktintäkt används Planning-projektionen `booking_products` som reserv.
- Reservhämtningen gör idag ett enda anrop för samtliga bokningar. Supabase begränsar detta till 1 000 rader, medan de aktuella projekten tillsammans har 8 790 produktrader. Bokningar utanför den returnerade delmängden får därför felaktigt `0 kr`.
- De berörda bokningarna har faktiskt 17 158 kr, 34 906 kr och 191 500 kr i sina aktuella produktrader. RLS är tenant-begränsad och ska behållas oförändrad.

## Ändring
1. Flytta reservsummeringen till en liten, ren hjälpfunktion som summerar produktintäkt och produktkostnad per bokning.
2. Hämta `booking_products` paginerat tills samtliga rader för de efterfrågade bokningarna är lästa, i stället för att acceptera Supabases 1 000-radersgräns.
3. Behåll nuvarande källordning: Booking-systemets positiva produktintäkt vinner; den lokala Planning-projektionen används endast när Booking-svaret saknar summan.
4. Ändra inte tabbar, tabellutseende, projektstatusar, databasschema eller bokningsdata.

## Verifiering
- Lägg kontraktstest för fler än 1 000 produktrader och säkerställ att rader efter första sidan räknas.
- Testa att `total_price` används och att `unit_price × quantity` är reserv när total saknas.
- Testa att Booking-systemets befintliga positiva summa inte skrivs över.
- Kör riktade Vitest-tester och därefter relevant större testkörning.
- Kontrollera preview på `/economy` och verifiera att de tre tidigare nollorna visar 17 158 kr, 34 906 kr respektive 191 500 kr.
