Målet är att göra listan begriplig: en fysisk vistelse på samma plats ska visas som en rad med första ankomst och sista avfärd, i stället för flera korta on/off-fragment.

Plan:

1. Byt strategi i `src/lib/staff/stayPoints.ts`
- Sluta förlita oss på att först skapa små kluster och sedan bara slå ihop redan godkända stopp.
- I stället byggs “besök” direkt från råa GPS-pings med gap-tolerans:
  - samma plats = inom rimlig radie
  - kort bortfall i signal = fortfarande samma besök
  - faktisk förflyttning till annan plats = nytt besök
- Ankomst = första ping i besöket.
- Lämnade = sista ping i besöket.
- På plats = total tid mellan första och sista ping.

2. Gör sammanslagningen robust mot mellanluckor
- Nuvarande logik tappar ofta besök därför att mellanrummet mellan fragment inte längre finns kvar i datat när småkluster filtrerats bort.
- Jag ändrar logiken så att luckor utan pings på samma adress fortfarande kan höra till samma besök, så länge ingen tydlig annan plats inträffar emellan.
- Det löser exakt fallet i din bild där t.ex. `09:34 → 10:31`, `10:51 → 11:02`, `11:10 → 11:17` ska bli en enda rad: `09:34 → 11:17`.

3. Behåll separata återbesök
- Om personen faktiskt lämnar platsen, åker till annan plats och sedan kommer tillbaka senare, då ska det fortfarande bli två besök.
- Exempel: `David Adrians väg` på morgonen och samma adress igen senare ska inte slås ihop över en annan plats däremellan.

4. Låt UI:t fortsätta visa samma tabell men med rätt rader
- `src/components/staff/GpsStopsRows.tsx` ska fortsätta visa samma kolumner: `Ankom`, `Lämnade`, `Adress`, `På plats`.
- Endast underlaget ändras så att antalet rader minskar till faktiska besök.

5. Verifiera mot det faktiska dagsmönstret
- Jag testar mot mönstret från din skärmbild / nätverkssvaret så att resultatet blir i princip:
  - `07:05 → 08:38` David Adrians väg
  - `08:58 → 09:14` Hammarbacken
  - `09:34 → 11:17` Drottninggatan
  - `11:37 → 12:06` David Adrians väg
  - osv
- Om det fortfarande blir flera rader för samma fysiska vistelse, justerar jag trösklarna innan jag lämnar över.

Tekniska detaljer:
- Filer som påverkas:
  - `src/lib/staff/stayPoints.ts`
  - eventuellt liten följdjustering i `src/components/staff/GpsStopsRows.tsx`
- Rotorsaken just nu är sannolikt att logiken först filtrerar bort korta mellansegment och sedan försöker slå ihop redan reducerade stopp. Då blir “sammanhängande besök” felrepresenterat trots att råpings faktiskt visar en enda vistelse.
- Jag har verifierat att GPS-listan hämtar data via `get_movement_for_day` och att problemet därför sitter i klientens besöks-beräkning, inte i renderingen av tabellen.

När du godkänner implementerar jag detta direkt.