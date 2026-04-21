

## Diagnos: "hittades inte" + "Session expired" vid scanning

### Kedjan vid en scanning

```text
Scanner-app (Android/Zebra)
   │  scannedValue (SKU eller serienr)
   ▼
useScanProcessor.handleScan
   │  verifyProductBySku(packingId, sku, verifierName)
   ▼
scannerService.callScannerApi('verify_product')
   │  POST https://pihrhltinhewhoxefjxv../scanner-api
   │  body: { action, token, packingId, sku, verifiedBy }
   ▼
scanner-api edge function
   │  1. verifyToken(token) ← lokal base64 (24h)
   │  2. lookup packing → booking_number
   │  3. POST allocate-instance @ WMS (pnvvnvywphfvmwdmqqzs)
   │     headers: Bearer PRICELIST_API_KEY, x-organization-id
   │     body: { serial_number, reservation_id, booking_number }
   │  4. matcha returnerad SKU mot packing_list_items
   ▼
Svar tillbaka till scannern
```

### Vad de två felen faktiskt betyder

**1. "Session expired"** kommer ENDAST från `scannerService.ts` rad 23-26:
```ts
if (response.status === 401) { clearAuth(); throw new Error('Session expired'); }
```
Det triggas när scanner-api kastar 401 — vilket i sin tur sker när:
- token är >24h gammal, ELLER
- token saknar staffId/expiresAt, ELLER
- staff_members-raden inte hittas via `id = staffId` (rad 46-48 i scanner-api).

Tokenformatet är **base64 av `{staffId, expiresAt}`** (samma som mobile-app-api). Om scanner-appen sparat en gammal token i lokal storage så loggas användaren ut vid första scan och får "Session expired" tills hen loggar in på nytt.

**2. "hittades inte"** kommer från två olika ställen i scanner-api:
- Rad 395: `Enheten "X" hittades inte i lagersystemet` ← WMS `allocate-instance` returnerade **404** för serienumret.
- Rad 815: `Produkt "X" hittades inte` ← gäller bara `identify_product`-läget.

Loggarna för scanner-api de senaste 90 minuterna visar **bara boot/shutdown — inte ett enda `[verify_product]`- eller `[allocate-instance]`-anrop**. Det betyder att antingen:
  a) Inga scans har faktiskt gjorts under perioden, eller
  b) Scannern slänger requesten innan den når edge function (offline / fel URL / CORS / nätverksfel), eller
  c) Token är ogiltig och scannerService kastar "Session expired" *innan* vi ens skickar — fast det stämmer inte, requesten skickas alltid och 401 returneras av servern.

Sannolikast: **(a)** under den period jag tittade. Vi behöver färska loggar från en faktisk scan för att se vilket av WMS-svaren (404/409/timeout) som triggar "hittades inte".

### Vad jag vill göra för att lösa det (kräver default mode)

**Steg 1 — Hämta verkliga signaler från en aktiv scan**
- Be dig göra en scan precis innan jag tittar i loggarna, så jag fångar:
  - `[scanner-api] → verify_product` i client-loggen (bekräftar att requesten skickas)
  - `[allocate-instance] Request` + `Response` i edge-loggen (visar WMS-status och body)
- Då vet vi exakt om felet är 401 (token), 404 (WMS hittar inte serienr), eller "no SKU returned".

**Steg 2 — Förbättra felsignalering så vi slipper gissa nästa gång**
I `supabase/functions/scanner-api/index.ts`:
- Logga alla token-401:or med orsak (`expired`, `bad_format`, `staff_not_found`) som `console.warn` så de syns i edge-loggen.
- I `verify_product`: logga alltid `serialNumber`, `bookingNumber`, `ORG_ID` innan WMS-anropet (idag loggas det bara delvis vid `console.log('[allocate-instance] Request')`).
- Skicka tillbaka en kort `debugCode` (t.ex. `WMS_404`, `WMS_409`, `NO_SKU`, `LOCAL_NO_MATCH`) i svaret så frontend kan visa mer specifik text än bara "hittades inte".

**Steg 3 — Token-livslängd & auto-refresh**
- I `src/services/scannerService.ts`: när `Session expired` kastas, visa en tydlig toast + redirecta till login, istället för att den bara dyker upp på nästa scan utan kontext.
- Överväg att förlänga `TOKEN_EXPIRY_HOURS` (idag 24h) eller införa silent refresh (samma mönster som mobile-app-api) — i lagermiljö loggar personalen sällan ut/in.

**Steg 4 — Verifiera WMS-API-nyckel**
- `PRICELIST_API_KEY` används mot `https://pnvvnvywphfvmwdmqqzs.supabase.co`. Om WMS roterat nyckeln eller om `x-organization-id` inte längre matchar deras tenant så returnerar `allocate-instance` 404/401 för **allt**. Vi pingar `allocate-instance` med ett känt giltigt serienummer för att verifiera att integrationen lever.

### Frågor till dig innan jag drar igång

Jag behöver veta vilket av tre scenarion det är, för åtgärden skiljer sig:

1. **"Session expired"** — händer det direkt vid första scan när du precis öppnat appen, eller efter en stund?
2. **"hittades inte"** — gäller det *alla* scans nu, eller bara vissa serienummer/SKU:er? Funkade samma streckkoder igår?
3. Vill du att jag bara lägger på bättre loggning + felkoder först (snabbt, säkert), eller vill du också att jag ändrar token-livslängden direkt?

