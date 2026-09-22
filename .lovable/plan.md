# Vad som faktiskt är fel

## Kort svar
Planning gör inget fel. Lagersystemets egen tjänst som lämnar ut packlistan svarar med ett internt databasfel:

```text
column reservation_lines.source_booking_product_id does not exist
```

Det betyder att lagersystemet frågar efter en uppgift i sin egen databas som inte finns där. Felet kommer från lagersystemet, inte från packlistorna här.

## Varför det funkade förut
Packlistorna byggdes en gång när lagertjänsten fortfarande svarade. Sedan dess har lagersidan ändrats och tjänsten slutat svara. Därför:
- befintliga listor ligger kvar precis som de skapades,
- nya körningar hämtar ingenting nytt och kan inte komplettera dem.

## Vad kontrollen i databasen visar
- Alla 896 gamla rader med texten "Ingår i paket: ..." är äkta paketmedlemmar. Ingen av dem är felaktigt märkt.
- Det som saknas på gamla listor är alltså inte felmärkta rader, utan kopplingen mellan tillbehör och deras paket. Den uppgiften finns bara i lagersystemet.
- Omkörning av två gamla listor ändrade noll rader, precis som väntat när lagertjänsten är nere.

## Förslag på nästa steg (välj ett)
1. **Laga lagersystemet först (rekommenderas).** När tjänsten svarar igen kör vi om de 53 gamla listorna och de får full uppdelning i paketmedlemmar och tillbehör. Ingen ändring behövs här under tiden.
2. **Bygg en tydlig statusruta här** som visar när en lista inte kan uppdateras för att lagret inte svarar, i stället för att omkörningen ser ut att lyckas med noll ändringar.
3. **Gör ingenting nu.** Gamla listor visar redan paketnamn som rubrik och rätt medlemmar; tillbehör listas separat utan paketrubrik.

## Tekniskt
- Felet uppstår i anropet `get-packing-list` mot lagerets API; Planning tolkar det som `wms_unavailable` och faller tillbaka på additiv påfyllning.
- Påfyllningen är nu spärrad för listor som redan har aktiva rader, så inga dubbletter kan uppstå igen.
- Ingen fix i det här projektet kan återskapa tillbehörskopplingen, eftersom uppgiften aldrig sparats lokalt.
