Jag vet vad felet är: den här sidan använder rätt komponent, men sammanslagningen sker på fel signal.

Problemet är inte att tabellen ligger på fel sida. `/staff-management/time-reports` renderar `GpsStopsRows` direkt, och den använder `clusterStayPoints(...)` från `src/lib/staff/stayPoints.ts`.

Det som är fel är detta:
- tabellen visar rader per geokodad adress
- den nuvarande merge-logiken slår bara ihop stopp om deras koordinat-centra ligger nära varandra
- i din skärmbild är flera rader redan samma adress i UI, men deras centra verkar ändå ligga för långt ifrån varandra för att passera merge-gränsen

Därför ser du fortfarande:
- `David Andrians väg` två gånger i rad
- `Drottninggatan` tre gånger i rad

Alltså: koden körs, men den slår ihop på koordinatcentrum i stället för på det användaren faktiskt ser som samma plats.

Plan

1. Lägg till ett andra, deterministiskt merge-steg i `GpsStopsRows.tsx`
- Efter `clusterStayPoints(...)` och efter reverse geocoding byggs en visningslista som slår ihop konsekutiva rader med samma normaliserade adress.
- Den här listan blir det som faktiskt renderas i tabellen.
- Starttid tas från första raden, sluttid från sista raden, och varaktigheten räknas över hela spannet.

2. Behåll skyddet för riktiga återbesök
- Endast konsekutiva rader med samma adress slås ihop.
- Om personen åker till en annan adress emellan och sedan återvänder, ska det fortfarande bli en ny separat rad.
- Det gör att t.ex. `David Andrians väg` på morgonen inte slås ihop med `David Andrians väg` senare efter andra besök.

3. Lägg in fallback när adress ännu inte är upplöst
- Om reverse geocoding inte är klar eller returnerar null, använd fortsatt koordinatbaserad rad som fallback.
- När adressen väl kommer tillbaka ska listan räknas om och raderna kollapsa automatiskt.

4. Justera den underliggande spatiala logiken bara där den fortfarande stör
- Om det behövs finjusteras `stayPoints.ts` så att centret inte förorenas av "på väg bort"-pings.
- Men huvudfixen ligger i presentationslagret, eftersom problemet du visar är att UI:t redan anser att raderna är samma adress.

5. Säkerställ med konkreta scenarier
- Fall 1: `07:05–07:15` + `07:26–07:34` på `David Andrians väg` blir en rad.
- Fall 2: `08:58–09:14` + `09:36–10:31` + `10:51–11:02` på `Drottninggatan` blir en rad.
- Fall 3: `11:10–11:17 David Andrians väg` förblir separat eftersom andra adresser låg emellan.

Tekniska detaljer
- Fil att ändra primärt: `src/components/staff/GpsStopsRows.tsx`
- Fil att eventuellt finjustera sekundärt: `src/lib/staff/stayPoints.ts`
- Ny hjälplogik:
  - normalisera adresssträngar
  - bygga `displayStops` från `stops + addrs`
  - rendera `displayStops` i stället för råa `stops`
- Jag lägger också till ett litet testfall för merge-reglerna så att samma fel inte kommer tillbaka.

Förväntat resultat efter fix
- Tabellen på exakt den sida du visar kommer få färre rader.
- Samma adress i direkt följd kollapsas till en enda rad.
- Riktiga återbesök efter andra adresser förblir separata.

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>
<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>