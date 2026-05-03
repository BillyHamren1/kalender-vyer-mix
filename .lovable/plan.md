## Exakt problem
Ja — nu vet jag vad felet är.

`Faktiska besök (GPS-pingar)` gör saker i fel ordning:
1. den klustrar först pings till stopp via centroid-logik
2. sedan reverse-geocodar den stoppets mittpunkt
3. sedan använder den den adress-texten för att slå ihop stopp

Det gör att en felaktig reverse-geocodad centroid kan märka upp en hel vistelse som t.ex. `Uppsalavägen, Solna kommun`, trots att råpingsen hela dagen ligger vid Väsby/FA Warehouse.

Alltså: sann GPS-position finns redan, men UI:t förvanskar den när den gissar adress för sent och på fel nivå.

## Ny plan
### 1. Bygg plats per ping först
Ändra flödet så att varje ping först får en platslabel innan någon vistelse byggs:
- matcha ping mot kända platser först (`organization_locations`, bokningsadress, ev. large project-plats)
- bara om ingen känd plats matchar: reverse-geocoda pingens koordinat
- använd cache/avrundning så närliggande pings delar adressuppslag

Resultat: varje ping får en stabil platsidentitet innan gruppering sker.

### 2. Segmentera pings till vistelser efter platsidentitet
Bygg sedan vistelser kronologiskt från ping-listan:
- om flera efterföljande pings har samma plats => samma vistelse
- första pingen i segmentet = `Ankom`
- sista pingen i segmentet = `Lämnade`
- antal pings och duration räknas från segmentet

Detta är exakt den ordning du efterfrågar: först plats per ping, sedan IN/UT per sammanhängande platsblock.

### 3. Sluta låta centroid-adress styra sanningen
`clusterStayPoints` och nuvarande adress-merge ska inte längre vara sanningskälla för denna tabell.

Antingen:
- ersätts helt i `GpsStopsRows.tsx` av ny ping-baserad segmentering, eller
- används bara som hjälpsteg för brusreducering, men aldrig för slutlig adressetikett.

Den avgörande ändringen är att adressen inte längre härleds från en centroid efteråt.

### 4. Prioritera känd plats framför reverse geocode
Om pings ligger inom t.ex. `FA Warehouse`-radien ska raden visas som den platsen, inte som en Mapbox-text från någon mittpunkt.

Det betyder att en dag som i datan redan pekar på Väsby/lagret inte ska kunna sluta som `Solna` i presentationen.

### 5. Verifiera med de felande fallen
Lägg verifiering för:
- heldag på FA Warehouse i Väsby
- små GPS-drift inom samma plats
- återbesök samma plats senare samma dag
- okänd plats där fallback till reverse geocode fortfarande behövs

## Berörda filer
- `src/components/staff/GpsStopsRows.tsx`
- `src/hooks/useStaffPingsForDay.ts` (om pingarna behöver enrichas med platslabel/site-id i en hjälpfunktion)
- `src/lib/staff/stayPoints.ts` (troligen förenklas eller används inte längre för just denna tabell)
- ev. ny liten helper, t.ex. för `matchPingToKnownSite` / `buildPingPlaceSegments`

## Förväntat resultat
Efter ändringen ska tabellen fungera så här:
- systemet tittar på var användaren faktiskt varit ping för ping
- grupperar 10 pings på samma plats till en vistelse
- tar första ping som IN och sista som UT
- visar känd plats i Väsby när pingsen faktiskt ligger där
- visar inte `Solna` om det bara är en felaktig reverse-geocode-gissning

## Teknisk not
Jag kommer följa den princip som redan finns server-side i dagsanalysen: känd arbetsplats är starkare sanning än sen reverse geocode-text. Här flyttas samma tänk in i GPS-besökstabellen, men med ping-först segmentering i rätt ordning.