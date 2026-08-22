# Scanner hardening – batchstatus

## 2026-08-22 – WMS-sanning i legacyflödet

Bas: `609ecdb` (`main` efter konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inga migrationer, Edge Functions, secrets, WMS-anrop, feature flags eller miljöer har ändrats och V2 är fortsatt OFF.

### Klart

- Införde ett uttryckligt legacyresultat med `operationId`, `outcome` (`committed`/`rejected`/`unknown`) och `authority`. UI visar lyckat endast för ett explicit `committed` svar med `authority=wms` och samma operation.
- Skickar ett unikt `operation_id` som body-fält och `x-idempotency-key` till alla kvarvarande WMS-mutationer. Legacy auto-retry är avstängd eftersom de gamla WMS-endpointsen ännu inte kan bevisa replay; tappat svar stannar i `UNKNOWN`. V2:s durable retry fortsätter använda exakt samma id.
- Tog bort all optimistisk +1/−1 i legacy packning och retur. Klienten sätter endast serverns exakta kvantitet efter WMS-commit.
- Spärrade lokala legacygenvägar för SKU-minus, okänd produkt, manuell retur, retur-minus och nollställning. De returnerar fail-closed 409 utan databasmutation.
- Spärrade manuell avpackning och manuell packning utan WMS-identitet. Den tidigare gröna texten om lokal packning efter misslyckad Bundle/WMS-synk är borttagen.
- Tog bort den råa `localStorage`-scankön ur scannerorkestratorn. Endast V2:s durable operation queue får persistenta mutationsreplays.
- Flyttade `planning → in_progress` till efter WMS-accept i legacy-scannen.
- Avvisar tvetydig eller saknad lokal rad efter WMS-commit som `UNKNOWN`; ingen första-SKU-/sorteringsmatch väljs och ingen lokal kvantitet skrivs.
- Kontrollerar fel från lokal rad-/kollispegling efter WMS-commit och returnerar `UNKNOWN`/503 i stället för falskt lyckat. Packradsuppdateringen är dessutom organisationsavgränsad.
- Lade till nio körbara regressionstester för WMS-authority, UNKNOWN, idempotensmetadata, lokala genvägar, tvetydig rad, speglingsfel, optimism och raw-kön.

### Verifiering

| Gate | Resultat |
|---|---|
| `git diff --check` | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release/legacy truth | PASS – 158/158 tester |
| Reservationsrad + readiness Deno | PASS – 10/10 tester |
| Time frontend | PASS – 204 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner webbbuild | PASS – 4 998 moduler; huvudchunk 3 212,87 kB / 900,85 kB gzip |
| Time webbbuild | PASS – 4 998 moduler; huvudchunk 3 214,08 kB / 901,23 kB gzip |

### Blockerare och kvarvarande risk

- Full `deno check supabase/functions/scanner-api/index.ts` är **NOT EXECUTED / FAIL**: den befintliga remote-importen `https://esm.sh/@supabase/supabase-js@2` hann inte laddas inom 20 sekunder i den begränsade miljön. Reproduktion: `timeout 20s ./node_modules/.bin/deno check supabase/functions/scanner-api/index.ts` (exit 124). `deno fmt --check` kunde däremot parsa filen.
- Fem Time/Supabase-integrationstestfiler är fortsatt **NOT EXECUTED / FAIL** utan uttryckligen godkänd LOCAL/TEST-backend. Reproduktion: `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`.
- Legacy UNKNOWN kan inte replayas automatiskt säkert förrän WMS-endpointsen garanterar idempotent replay av `operation_id`. UI instruerar kontroll före nytt försök; V2:s durable kö är den avsedda lösningen men är fortsatt avstängd.
- Lokala manuell-/SKU-åtgärder är avsiktligt blockerade när V2 är OFF; endast fysiska WMS-bekräftade legacyflöden kan lyckas.
- Scanner- och Time-bundlarna innehåller fortfarande orelaterade rutter och är cirka 3,2 MB minifierade. Native- och bundleisolering återstår.
- Fysisk Zebra, DataWedge, RFID/API3-AAR och signering är inte verifierade.

### Exakt nästa batch

1. Separera Time och Zebra till egna nativeprojekt, package-id, Capacitor-konfigurationer, ikoner, Gradle- och releaseflöden.
2. Bevisa att Time-byggkedjan inte innehåller DataWedge, RFID eller Zebra API3 och att Scanner-byggkedjan inte skriver om Time-projektet.
3. Gör Zebra-SDK/AAR fail-fast och reproducerbar utan att distribuera licensierad SDK eller secrets.
4. Lägg statiska kontrakt och buildmatris för båda apparna, därefter isolera scannerbundlen från orelaterade rutter.
5. Aktivera inte V2 och driftsätt inget; fysisk Zebra-gate kvarstår.

## 2026-08-22 – Exakt `reservation_line_id` genom hela V2-kontraktet

Bas: `609ecdb` (`main` efter ny konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inga migrationer, Edge Functions, secrets, WMS-mutationer eller feature flags har ändrats i någon miljö och V2 är fortsatt OFF.

### Klart

- För `reservation_line_id` genom command, durable IndexedDB-kö, retry, V2-klient, servergate och WMS-kommandopayload. Samma radidentitet och `operation_id` bevaras vid replay.
- Normaliserar WMS reservationsrader till stabilt rad-id, `source_booking_product_id`, item type och SKU utan att skapa identitet från listordning.
- Matchar varje V2-scan till exakt `booking_products.id` och därefter exakt `packing_list_items.id`. Dubbla SKU-rader, flera WMS-rader eller saknad källrelation blockeras före durable enqueue.
- Verifierar server-side organisation → booking → booking product → packningsrad → WMS-reservationsrad före varje pack-/unpack-/returmutation.
- Fysiska scans använder reservationsrad från allocation eller read-only WMS-identifikation och avvisar artiklar som tillhör annan booking.
- Tog bort första-SKU-matchningen ur V2-flödena för packning och retur. Manuella radknappar går via samma exakta radresolver.
- Lade till körbara tester för unik rad, dubbla SKU-rader, serialiserad allocation, saknad källrelation, främmande booking product och dubbla WMS-rader.

### Verifiering

| Gate | Resultat |
|---|---|
| Konfliktkontroll mot `main` och PR-head | PASS – `609ecdb` / `ba83064`, båda oförändrade |
| `git diff --check` | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release | PASS – 169/169 tester |
| Reservationsrad + readiness Deno | PASS – 10/10 tester |
| Fristående Deno check av nya shared-moduler | PASS |
| Time frontend | PASS – 204 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner webbbuild | PASS – 4 997 moduler; huvudchunk 3 210,33 kB / 900,78 kB gzip |
| Time webbbuild | PASS – 4 997 moduler; huvudchunk 3 211,54 kB / 901,16 kB gzip |

### Blockerare och kvarvarande risk

- WMS-testmiljön måste bekräfta att reservationssvaret faktiskt innehåller stabilt `reservation_line_id` och `source_booking_product_id` för varje rad. Saknad eller tvetydig identitet är avsiktligt fail-closed; inget har driftsatts för att prova detta externt.
- Full `deno check supabase/functions/scanner-operation-v2/index.ts` är fortsatt **NOT EXECUTED / FAIL** på den befintliga okachade `esm.sh/@supabase/supabase-js@2.45.0`-importen. Reproduktion: `timeout 20s ./node_modules/.bin/deno check supabase/functions/scanner-operation-v2/index.ts`.
- Fem Time/Supabase-integrationstestfiler är fortsatt **NOT EXECUTED / FAIL** utan uttryckligen godkänd LOCAL/TEST-backend. Reproduktion: `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`.
- Legacy-flödet kan fortfarande ge lokal framgång efter misslyckad WMS-synk när V2 är OFF. Det är nästa härdningssteg.
- Scanner- och Time-bundlarna är fortfarande cirka 3,2 MB minifierade och innehåller orelaterade rutter. Native- och bundleisolering återstår.
- Fysisk Zebra, DataWedge, RFID/API3-AAR och signering är inte verifierade.

### Exakt nästa batch

1. Ta bort falsk lokal framgång ur legacy pack-/returflöden och låt endast auktoritativt WMS-svar ge lyckad status.
2. Behåll samma `operation_id` över timeout/retry och håll osäkra svar i `UNKNOWN`; skapa ingen ny mutation för samma scan.
3. Blockera eller adaptera direkta legacy-API-anrop så de inte kan kringgå readiness och exakt reservationsrad.
4. Lägg regressionstester för offline, tappat svar, reload och två enheter mot samma rad.
5. Kör hela verifieringsmatrisen igen; aktivera inte V2.

## 2026-08-22 – Obligatorisk fail-closed WMS-readiness

Bas: `609ecdb` (`main` efter ny konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inga Edge Functions, secrets eller feature flags har ändrats i någon miljö och V2 är fortsatt OFF.

### Klart

- Införde en gemensam, read-only servergate som kräver verifierad organisation, personal, aktiv packningssession, booking, reservation, packningsradidentitet, kvitterade kortvarseländringar och färsk WMS-reservationsstatus.
- Kör samma gate före alla Scanner V2-kommandon, inklusive retur. Saknad konfiguration eller otillgängligt WMS blir `UNKNOWN`/503; ingen WMS-mutation startas.
- Gjorde preflight-endpointen mobilautentiserad, organisationsavgränsad och fail-closed. Varning, tom packlista, blockerad rad eller overifierbart WMS ger aldrig klartecken.
- Autokör preflight i både packning och retur och blockerar scaninput, fysisk scanner, durable enqueue samt manuella plus/minus/toggle-operationer tills readiness är godkänd.
- Retur startar/återanvänder en aktiv personalsession. Även legacy-retur kräver nu att sessionen ägs av rätt personal/organisation och matchar packlistan.
- Lade till körbara Deno-tester för saknad session, fel booking, exakt WMS-reservation och ett HTTP-lyckat men overifierbart WMS-svar.
- Låste server-/UI-kontraktet med sex nya regressionskontroller och skärpte två äldre preflight-snapshots.

### Verifiering

| Gate | Resultat |
|---|---|
| Konfliktkontroll mot `origin/main` och PR-head | PASS – båda oförändrade |
| `git diff --check` | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release | PASS – 151/151 tester |
| Readiness Deno-enhetstester | PASS – 4/4 tester |
| Fristående Deno check av shared readiness | PASS |
| Time frontend | PASS – 204 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner webbbuild | PASS – huvudchunk 3,205.79 kB / 899.44 kB gzip |
| Time webbbuild | PASS – huvudchunk 3,207.00 kB / 899.87 kB gzip |

### Blockerare och kvarvarande risk

- Full `deno check supabase/functions/scanner-operation-v2/index.ts` är **NOT EXECUTED / FAIL**: ett befintligt `staff-auth.ts`-beroende på `https://esm.sh/@supabase/supabase-js@2.45.0` saknas i lokal cache och nätanropet timeoutar. Reproduktion: `timeout 20s ./node_modules/.bin/deno check supabase/functions/scanner-operation-v2/index.ts`.
- Fem Time/Supabase-integrationstestfiler är fortsatt **NOT EXECUTED / FAIL** utan uttryckligen godkänd LOCAL/TEST-backend. Reproduktion: `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`.
- `WMS_READINESS_BASE_URL` måste finnas i en uttryckligen avsedd testmiljö och WMS-svaret måste innehålla verifierbar `reservation_id`, `current_state` eller explicit `exists`. Ingen secret eller funktion har driftsatts i denna batch.
- Legacy-API:t kan fortfarande mutera lokalt efter sessionkontroll om det anropas direkt utanför det readiness-spärrade UI:t. Det tas bort i steg 4 när falsk lokal framgång ersätts av det auktoritativa WMS-flödet.
- Scanner- och Time-bundlarna innehåller fortfarande Planning-rutter och är cirka 3,2 MB minifierade. Isolering hör till steg 5–6.
- Fysisk Zebra, DataWedge, RFID/API3-AAR och signering är inte verifierade.

### Exakt nästa batch

1. För `reservation_line_id` genom enqueue, durable kö, V2-kommandot och WMS-gatewayen.
2. Verifiera server-side att booking, reservation, exakt reservationsrad och packningsrad tillhör samma organisation och varandra.
3. Ta bort all första-SKU-matchning och avvisa tvetydig eller saknad reservationsrad före WMS-mutation.
4. Lägg negativa tester för dubbla SKU-rader, fel reservationsrad, annan booking/organisation och replay med samma `operation_id`.
5. Kör full scanner-, Time-, Deno-, typecheck- och buildmatris; aktivera inte V2.

## 2026-08-22 – Reproducerbar CI-bas

Bas: `609ecdb` (`main` efter konfliktkontroll)  
Branch: `scanner-hardening/ci-reproducibility`  
Produktionsaktivering: **nej** – `VITE_SCANNER_TRANSACTION_V2` är fortsatt OFF som standard.

### Klart

- Synkade `package.json` och `package-lock.json`; en ren `npm ci` installerar nu reproducerbart.
- Lade till en versionslåst lokal Deno (`2.9.5`) så backendtester inte beror på en global installation.
- Tog bort `deno.land`-imports från Time-testgaten och ersatte dem med en lokal Node/Deno-kompatibel assertionsmodul.
- Gjorde Time-gaten fail-closed: saknad LOCAL/TEST-backend är FAIL, inte ett falskt PASS. Fjärrtest kräver både explicit URL och explicit opt-in.
- Uppdaterade två stale scannerkontrakt så de verifierar att lagerattestgaten returnerar före packnings- och WMS-identitetswrites.
- Synkade stale Time-kontrakt med den aktiva single-timer-arkitekturen och språkprovidern.

### Verifiering

| Gate | Resultat |
|---|---|
| Ren `npm ci` | PASS – 1 173 paket |
| Canvas/jsdom | PASS – trasigt valfritt `canvas` lämnas inte installerat |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release | PASS – 143/143 tester |
| Time frontend | PASS – 204 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner webbbuild | PASS |
| Time webbbuild | PASS |

### Blockerare och kvarvarande risk

- Fem Time/Supabase-integrationstestfiler är **NOT EXECUTED / FAIL** eftersom ingen godkänd LOCAL/TEST-URL fanns. Reproduktion:
  `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`
- Scannerbuilden är fortfarande för stor och transformerar hela applikationen (senast 4 995 moduler; huvudchunk cirka 3,20 MB minifierad). Isolering hör till steg 5–6.
- WMS-preflight är ännu inte gjort obligatoriskt fail-closed i UI och serveroperation. Det är nästa scannerbatch.
- Fysisk Zebra, DataWedge, RFID/API3-AAR och signering är inte verifierade i denna batch.

### Exakt nästa batch

1. Rebasera/fetcha senaste `main` och kontrollera denna PR:s diff.
2. Kartlägg alla pack-/returentréer i `MobileScannerApp`, `VerificationView`, `ReturnView`, `useScanProcessor` och `scanner-operation-v2`.
3. Inför en gemensam fail-closed readinessmodell som kräver verifierad tenant, användare, aktiv session, booking/reservation samt WMS-status.
4. Blockera UI-handlers och serveroperation före mutationskoden och lägg negativa tester för varje saknad eller mismatchad gate.
5. Kör scanner 143+-sviten, TypeScript och båda byggena; aktivera inte V2.
