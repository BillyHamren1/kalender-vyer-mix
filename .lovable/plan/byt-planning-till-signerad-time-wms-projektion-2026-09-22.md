# Byt Planning till signerad Time-WMS-projektion

## Mål
Planning ska sluta läsa den trasiga `get-packing-list`-vägen och i stället använda Time-WMS-projektionen med den sparade `PLANNING_WMS_HMAC_SECRET`.

## Genomförande
- Lägg en gemensam serverfunktion som bygger det exakta JSON-kontraktet, signerar råtexten med HMAC-SHA256 och skickar POST till `time-wms-outbound/outbound/projection`.
- Bind varje anrop till bokning, bokningsnummer, organisation och verklig aktör. Saknad nyckel eller aktör stoppar anropet tydligt.
- Anpassa WMS-normaliseringen till projektionens svar utan att ändra packade antal, återuppliva exkluderade rader eller skapa dubletter.
- Byt både packlistesynken och scannerns read-only-projektion från den gamla endpointen.
- Lägg kontraktstester för exakt body/signatur, tenant/actor-binding, response-normalisering, idempotens och fail-closed.
- Kör riktade Vitest-tester, typkontroll och previewkontroll. Deploya endast berörda Edge Functions och verifiera de angivna bokningarna två gånger där åtkomst medger det.

## Tekniska detaljer
- Secret: `PLANNING_WMS_HMAC_SECRET` (endast servermiljö).
- Signaturunderlag: `timestamp.nonce.rawBody`; HMAC-SHA256 i hex.
- Ingen anon-nyckel eller direkt webbläsartrafik används mot Time-WMS.
- Inga deletes, migrationer eller breda backfills.
