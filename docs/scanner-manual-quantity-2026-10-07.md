# Scanner: manuell antalsregistrering

Användarbeslut 2026-10-07: artiklar får sakna registrerad individ och kod.
Manuellt registrerat packat antal ska vara ägarsystemets sanning. Okänt
totalt lagersaldo är null, inte noll eller ett påhittat tillgängligt antal.

## Denna leverans

- Planning vidarebefordrar PACK_QUANTITY / UNPACK_QUANTITY med exakt
  reservationsrad och artikel-ID, ett heltal 1–1000, ingen scan-kod eller
  individ. Organisation och aktör kommer fortsatt från autentiserad session.
- Ångra plock med appens `reason` avvisas inte längre som unexpected_field.
  Orsaken skickas med till WMS. Befintliga individklienter utan reason
  förblir kompatibla; ny manuell avpackning kräver orsak.
- Time-WMS-projektionens manuella och individuella packmängder förmedlas
  separat. Saknad mängd förblir okänd; total packmängd används aldrig som
  gissning om vad som får packas upp manuellt.

## Verifiering

- 28 riktade Vitest-tester PASS (gateway + läsprojektion).
- Strikt TypeScript-kontroll av de två ändrade modulerna PASS.
- Ingen produktionsmutation, migration eller deploy genomförd.
- Kräver motsvarande Bundle/WMS och Scanner-klientändringar före aktivering.
- Manuell avpackning är inte bevis på formellt avslutad retur.

## Samordnade spår

| Spår | Ansvar | Bas/gren | Status |
| --- | --- | --- | --- |
| Planning | root | cfbd81f2a81557a2fe08677cb24070662d8c2825 / codex/scanner-manual-quantity-20261007 | Kod + riktade tester klara |
| Bundle/WMS | quantity_owner | BillyHamren1/bundle-builder-base PR #51 | Ägar-RPC, gemensam kvot, projektionsfält; 102 riktade tester + PostgreSQL/WASM-test PASS |
| Scanner | scanner_ui | BillyHamren1/datacapture-hub PR #50 | Manuell UI, kvitto, beständig osäker operation; 43 riktade/befintliga tester och TypeScript för hämtad källkod PASS |

## Tvärgående integration

`scripts/scanner-manual-quantity-integration.mjs` kör de riktiga modulerna från
Scanner, Planning och WMS tillsammans med den nya SQL-funktionen i isolerad
PostgreSQL/WASM. Testet verifierar PACK 3, identisk retry utan dubblering,
ändrad payload med samma ID, kvotöverskridande och UNPACK 2 med orsak.
Slutläget är 1 packad, exakt 2 lagerhändelser och 0 skapade individer. PASS.

Kör med Node 24 och de samordnade granskningsgrenarna utcheckade:

```sh
SCANNER_REPO_DIR=../datacapture-hub WMS_REPO_DIR=../bundle-builder-base node --experimental-strip-types scripts/scanner-manual-quantity-integration.mjs
```

Scanner-installationen behöver sina ordinarie beroenden. Installera PGlite i
isolerad testmiljö; ange vid behov `PGLITE_MODULE` till dess modulfil.
Testet använder ingen anslutning till produktionsdatabas.

## Faktisk leveransstatus och kvarvarande grindar

- Planning PR: https://github.com/BillyHamren1/kalender-vyer-mix/pull/52
- WMS PR: https://github.com/BillyHamren1/bundle-builder-base/pull/51
- Scanner PR: https://github.com/BillyHamren1/datacapture-hub/pull/50
- WMS Time-outbound CI 37593218103 verifiering PASS, deployment SKIPPED.
  Bred WMS-CI och Scanner-CI pågick vid checkpoint; inte redovisade som gröna.
- Planning GitHub Actions 37592392245 stoppades i det befintliga steget
  `Critical production dependency audit`, före tester/lint/build. Kritiska
  fynd gäller bland annat Capacitor och tinypool. Manifest och lockfil är
  oförändrade i denna leverans; ingen säkerhetsgrind har kopplats bort.
- De lokala resultaten ovan innebär inte att hela CI eller produktionsbygget
  är grönt. Beroendegrinden måste lösas före release.
- WMS-migrationen ligger avsiktligt i `db/pending-migrations`. Ingen migration,
  edge function, main-gren eller Scanner-deploy har aktiverats.
- Före aktivering: verifiera migrationen mot fullständigt staging-schema och
  samtidiga klienter. Kör WMS-migrationen först, sedan WMS-kommandofunktionen
  och Time-WMS-projektionen, sedan Planning och sist Scanner-klienten.
- Efter aktivering krävs ett godkänt praktiskt prov av packa utan kod,
  blanda med individ, ångra, avbruten anslutning och identisk retry.
- Formell retur och ett känt totalt lagersaldo är separata förmågor och
  påstås inte vara färdigställda av denna ändring.

## Uppföljning: leveransblockeringen åtgärdad 2026-10-07

- Capacitor Android/iOS/core/CLI är exakt låsta till 8.5.2.
- Vitest uppdaterat till 4.1.11; den sårbara tinypool-kedjan är borttagen.
  Node 22-typer uppdaterade för testverktygets kompatibilitetskrav.
- npm- och Bun-textlåsfiler omgenererade med pakethanterarna.
- Säkerhetskontrollen är oförändrad och passerar: 0 kritiska fynd.
  Övriga advisory-nivåer är inte förklarade åtgärdade av detta arbete.
- Tre föråldrade wiring-tester ersatta med kontroller av det aktiva signerade
  Time-WMS-flödet och körbara ID-/status-/packbarhets-/dubbleringskontroller.
- Hela Scanner-read-gaten lokalt: 135/135 tester, Contract lint och
  produktionsbygge PASS med de nya beroendena.
- Tvärgående manuell antalshantering med faktisk SQL i isolerad PostgreSQL/WASM
  fortsatt PASS.
- Scanner PR #50:s fulla CI är grön, inklusive web-E2E, Androidbygge, TypeScript,
  lint, tester, build och isolerade DB-tester. WMS PR #51:s Scanner-/Time-gater
  är gröna. WMS Menu Catalogue-gatens typecheck-fel identifierat som Object.hasOwn i
  vårt nya test: ersatt lokalt med Object.prototype.hasOwnProperty.call för
  projektets äldre TypeScript-lib. Endast en semantiskt likvärdig testrad ändras.
- Detta är en källkods- och CI-rättning. Ingen produktionsdeploy, datamigration,
  merge eller mobilrelease är genomförd. Staging med fullständigt WMS-schema
  och flera samtidiga klienter återstår före aktivering.

### Checkpoint efter automatisk granskningsspärr

Push till den befintliga PR #52-grenen nekades av automatisk godkännandekontroll
med skälet att export av kod till en offentlig GitHub-destination kräver explicit
användarauktorisation. Samma besked kvarstod efter verifiering av GitHub-PR,
remote, befintlig head, exakt ändringslista och hemlighetssökning. Inget alternativt
publiceringsverktyg används för att kringgå beslutet.

Lokalt verifierad Planning-commit bygger direkt på 3bc4e5836fc18d58510e1892004ffe4a31439ca2.
WMS-testfix är förberedd mot 2067f6a9f1a404af863ff10fe229b1d8ae1ab952 i
../owner/fix-ci-hasown.patch. Nästa steg efter uttryckligt godkännande: publicera
dessa rättningar till samma PR #52 respektive #51, verifiera remote-SHA och följ
server-CI. Ingen main-merge eller produktionsdeploy ingår i denna push.

## Tillägg 2026-10-08: manuella orderrader utan lagerartikel

- Gateway accepterar explicit `itemTypeId: null` enbart för antalskommandon.
  Saknat, tomt eller ogiltigt artikel-ID avvisas. Individkommandon kräver UUID.
  Bundle verifierar kanonisk `line_type = manual`, utan artikel- eller paketkoppling.
- Aktiv Scanner-projektion vidarebefordrar ägarens `lineType`/`line_type` som
  `line_type`. Null artikelkoppling gissas aldrig vara en manuell orderrad.
- Lokal verifiering: 39 riktade tester, totalt 146 kontrakttester, kontraktlint,
  strikt TypeScript och produktionsbygge PASS. Produktionsaudit har 0 kritiska
  fynd vid omkörning; ingen ändring av auditgrind eller beroenden behövdes.
- Integrationsskriptet omfattar nu både lagerartikel och manuell null-artikel:
  packning, retry, idempotenskonflikt, kvot, ångra och felaktig null-identitet.
- Samordnad driftsättning: Bundle-migration och ägarfunktioner först, därefter
  Planning `scanner-command-api` och `scanner-api`, därefter Scanner-klient.
  Befintliga autentiserings- och signerade transporthemligheter bevaras.
