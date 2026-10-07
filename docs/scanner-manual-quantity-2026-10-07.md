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
