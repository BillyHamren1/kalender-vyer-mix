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
| Bundle/WMS | quantity_owner | BillyHamren1/bundle-builder-base | Ägar-RPC, kvotkontroll, projektionsfält och SQL-test under arbete |
| Scanner | scanner_ui | BillyHamren1/datacapture-hub | Manuell UI, kvitto, beständig osäker operation och tester under arbete |

Nästa steg: granska ägar-RPC mot verkliga lås/kvoter, kör tvärgående
kontraktstester och appens tester, verifiera migrations- och deployordning.
Behåll alla ändringar på separata granskningsgrenar till integrationen är
verifierad. Aktivera inte bara klientknappar utan ägarstöd.
