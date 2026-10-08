# Skanner-incident 2026-10-08 ~11:24 UTC – läsdiagnos (inget ändrat)

## Vad loggarna visar (sista 60 min)
- **scanner-api** startades ca 15 gånger mellan 11:21:27 och 11:23:03 UTC och stängdes 11:24:46–11:24:54. Den enda loggrad med innehåll:
  - 11:21:33 UTC `list_active_packings jobs=98 wms_ms≈5,5 s failures={wms_unavailable:68, wms_reservation_not_found:6, wms_timeout:1}`.
  - Alltså: lagret (WMS) svarade inte för 68 av 98 jobb redan vid jobblistan.
- **Inga** loggrader från `verify_product` eller `identify_product` i perioden (sökning på "verify" gav 0 träffar). `identify_product` loggar inte vid "hittades inte" – den skickar bara vidare lagrets svar – så uppslagen kan ha skett utan spår.
- **scanner-command-api: inga loggar alls**, inte ens uppstart. Antingen nåddes den aldrig från skannern, eller så finns ingen körbar version publicerad.
- Förfrågningsloggen (HTTP-statuskoder per anrop) gav 0 rader för skanner-adresserna, så exakta statuskoder och förfrågnings-ID:n går inte att ta fram härifrån.
- Inga skannade koder finns i loggarna, så inga exempel kan visas.

## Trolig orsak (obekräftad)
Produktuppslaget går direkt till lagrets `scan-status` i WMS-projektet. Samma minut rapporterade jobblistan att WMS var otillgängligt för 68 jobb. Mest sannolikt svarar lagret fel/"hittades inte" eller nekar Planning-nyckeln – inte att produkterna saknas.

## Version
Senast publicerat från denna chatt: `5c3532e` för scanner-api och scanner-command-api. Publiceringsverktyget ger inget versions-ID, så den faktiskt körande versionen kan inte bevisas. `identify_product` och `verify_product` finns i den koden.

## Förslag på nästa steg (alla läsande, kräver ditt OK)
1. Ett ofarligt läsanrop mot lagrets `scan-status` med en känd testkod, för att få fram lagrets exakta statuskod (200/401/404/5xx).
2. Ett ofarligt anrop till scanner-command-api utan inloggning (förväntat svar 401) för att visa om funktionen är publicerad.
3. Läsa lagerprojektets (WMS) egna loggar för `scan-status`, om du ger åtkomst – det är där felet syns.
4. Be skannerteamet om klientens felkod/tidpunkt för ett misslyckat scan.

Inga kodändringar, publiceringar eller inställningsändringar.
