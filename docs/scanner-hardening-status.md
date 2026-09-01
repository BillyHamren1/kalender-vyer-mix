# Scanner hardening – batchstatus

## 2026-08-22 – Bakåtriktad granskning och terminalt WMS-bevis

Bas: `609ecdb` (`main` efter konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inget är mergat, driftsatt, signerat eller aktiverat och V2 är fortsatt OFF.

### Klart

- Granskade Scanner bakåt över hela mutationskedjan: durable kö, V2-gateway, exakt reservationsrad, WMS-svar, native-bryggor, Android-säkerhet, auth, bundle och releasegate.
- Kräver nu att varje terminalt svar till kön matchar exakt `operation_id`. Godkända svar måste dessutom matcha exakt `item_id` och innehålla en ändlig, icke-negativ auktoritativ packad/returnerad kvantitet. Avvikelse blir `UNKNOWN`; operationen tas inte bort.
- Flyttade WMS-svarstolkningen till en ren Deno-modul. Transport-/serverfel vinner över motsägelsefull body, `success:false` kan aldrig bli godkänt och HTTP 202 räknas inte som synkron commit.
- Kräver explicit replaymarkör och exakt ekat `operation_id` för duplicate-replay.
- Kräver att varje godkänd WMS-operation ekar exakt `operation_id`, `item_id` och `reservation_line_id`. Saknat eller fel mål blir `UNKNOWN` och återförsöks med samma id.
- Tog bort native diagnosmottagaren som dubblerade DataWedge och loggade hela scanpayloaden. Barcode/EPC och råa extras loggas inte längre.
- Begränsade WebView-behörighet till kamera från Capacitors lokala `https://localhost`; övriga ursprung/resurser nekas.
- Stängde Android-backup, cleartext/mixed content och användarinstallerade CA som trust anchor.
- Dokumenterade obligatorisk DataWedge Component Information med package + signaturkontroll samt kontrollerade Intent API-kategorier för hanterade enheter.
- Gav Scanner en egen auth-provider utan Time-kö, geofence, bakgrundsplats, push eller impersonering.
- Satte Capacitor `includePlugins: []` för Zebra-projektet. Endast de manuellt registrerade DataWedge-/RFID-pluginerna följer med; genererade Gradle-filer innehåller inga orelaterade mobilpluginer.
- Utökade bundleauditen så bakgrundsplats, Time-auth, timerkö och notifications stoppar Scanner-bygget om de återkommer.

### Verifiering

| Gate | Resultat |
|---|---|
| `git diff --check` | PASS |
| Scanner V2/kö/readiness/release/native/bundle/E2E | PASS – 227/227 tester |
| Readiness + WMS-resultat Deno | PASS – 14/14 tester |
| Delad Scanner Deno-check | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Time frontend | PASS – 207 passerade, 3 uttryckligt hoppade; backend NOT EXECUTED |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner build + bundleaudit | PASS – 381 outputmoduler, 10 chunks, 890 648 JS-byte |
| Time build + bundleaudit | PASS – 513 outputmoduler, 15 chunks, 2 616 171 JS-byte |
| Scanner Capacitor sync | PASS – inga npm-nativepluginer, custom DataWedge/RFID ligger kvar |
| Time nativekontrakt | PASS |
| Sammanhållen automatiserad scanner-gate | PASS – 11/11 steg |
| Total scanner-release | BLOCKED – externa gates återstår |

### Blockerare och kvarvarande risk

- WMS-kontraktet måste i godkänd LOCAL/TEST-miljö bevisa att framgång ekar exakt operation, artikel och reservationsrad samt att retry ger samma auktoritativa resultat. Ingen produktionsmiljö används som ersättning.
- Scanner Gradlekompilering kräver licensierad checksummebunden Zebra API3-AAR.
- DataWedge Component Information/signatur, Intent API-kontroll, fysisk barcode, RFID-trigger och API3 måste verifieras på signerad Zebra-build.
- Separata releasesigneringshemligheter och signerad APK/AAB är inte verifierade.
- Full Deno-graf för Scanner Edge Function kräver den externa Supabase-import som inte är tillgänglig i den låsta körmiljön.
- V2 är fortsatt OFF och får inte aktiveras före externa och fysiska gates.

### Exakt nästa batch

1. Förbered en ren extraktion av den godkända Zebra-scannern till Scanner-repot med egen package-, CI-, native- och Supabase-kontraktgräns.
2. Bevara draftläge och gör ingen produktionsaktivering, signering eller WMS-/databasmigration.
3. Kör den extraherade kodbasens reproducerbara web-/Deno-/bundle-/native-kontrakt och dokumentera exakt vad som fortsatt delas via backendkontrakt.
4. Vänta med V2-aktivering och legacyarkivering tills LOCAL/TEST-WMS och fysisk signerad Zebra är gröna och beslutet är uttryckligt.

## 2026-08-22 – Dynamiska driftfall och sammanhållen automatiserad gate

Bas: `609ecdb` (`main` efter konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inget är mergat, driftsatt, signerat eller aktiverat och V2 är fortsatt OFF.

### Klart

- Serialiserade samtidig behandling av samma durable operation i en appinstans. Appstart, online-event, recovery-timer och foreground-scan delar nu samma pågående promise och kan inte skicka samma `operation_id` parallellt.
- Behöll parallell behandling mellan oberoende scanner-lanes så att skyddet inte skapar global köblockering.
- Lade dynamiska tester för samtidig drain, foreground/recovery-race, oberoende lanes och två enheter mot exakt samma reservationsrad.
- Tvåenhetstestet verifierar att varje enhet bevarar sitt eget `operation_id`, `device_id` och `reservation_line_id`, medan en simulerad atomisk WMS-gräns accepterar exakt en operation och avvisar överkapacitet.
- Gjorde den körbara E2E-drivern fail-closed för `itemId`, `reservationId` och `reservationLineId`. Saknad exakt identitet stoppas före enqueue och alla gatewaypayloads bevarar reservationsraden.
- Uppdaterade E2E-fixturkontraktet för kvantitet, serienummer, retur, felaktig retur, tenant B och överpackning. Saknade fält blir `NOT_EXECUTED`, aldrig falskt PASS.
- Ersatte det tidigare smala `test:scanner`-kommandot med automatisk upptäckt av hela Scanner-sviten.
- Lade `test:scanner:gate`, en sammanhållen matris för Scanner, Deno, TypeScript, Time-frontend, timeline, båda webbbyggena, bundleaudits och Time-nativekontrakt.
- Gaten skiljer automatiserbart PASS från extern releaseberedskap. WMS/Supabase-E2E, API3/Gradle, fysisk Zebra, signering och full extern Edge-graf rapporteras uttryckligen som BLOCKED.
- Gjorde Time-gaten körbar i frontend-only-läge; backend markeras då uttryckligen `NOT EXECUTED`.

### Verifiering

| Gate | Resultat |
|---|---|
| `git diff --check` | PASS |
| Scanner V2/kö/readiness/release/native/bundle/E2E | PASS – 219/219 tester |
| Reservationsrad + readiness Deno | PASS – 7/7 tester |
| Delad Scanner Deno-check | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Time frontend | PASS – 207 passerade, 3 uttryckligt hoppade; backend NOT EXECUTED |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner build + bundleaudit | PASS – 392 outputmoduler, 13 chunks, 909 281 JS-byte |
| Time build + bundleaudit | PASS – 513 outputmoduler, 15 chunks, 2 616 171 JS-byte |
| Time nativekontrakt | PASS |
| Sammanhållen automatiserad scanner-gate | PASS – 11/11 steg |
| Total scanner-release | BLOCKED – externa gates återstår |

### Blockerare och kvarvarande risk

- Godkänd LOCAL/TEST WMS- och Supabase-miljö saknas för den verkliga E2E-/idempotensgaten. Ingen produktionsmiljö får användas som ersättning.
- Scanner Gradlekompilering kräver licensierad checksummebunden Zebra API3-AAR.
- Fysisk Zebra, DataWedge-broadcast, RFID-trigger och API3 är inte verifierade.
- Separata releasesigneringshemligheter och signerad APK/AAB är inte verifierade.
- Full Deno-graf för Scanner Edge Function kräver den externa Supabase-import som inte är tillgänglig i den låsta körmiljön.
- V2 är fortsatt OFF och får inte aktiveras före externa och fysiska gates.

### Exakt nästa batch

1. Granska hela scannerområdet bakåt mot fail-closed-, WMS-authority-, exakt-rad-, durable-kö-, native- och bundlekontrakten.
2. Reparera varje verifierbar lucka och kör hela `npm run test:scanner:gate` efter ändringarna.
3. När den bakåtriktade granskningen är grön, förbered en ren extraktionsbranch/repo-PR för Scanner.
4. Aktivera inte V2, skapa ingen signerad release och arkivera inget innan uttryckligt beslut och fysisk Zebra-verifiering.

## 2026-08-22 – Isolerade Scanner- och Time-bundlar

Bas: `609ecdb` (`main` efter konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inget är mergat, driftsatt, signerat eller aktiverat och V2 är fortsatt OFF.

### Klart

- Gav Scanner och Time varsin verklig Vite-entry (`main-scanner.tsx` respektive `main-time.tsx`). De går inte längre via den fulla `App.tsx`-grafen.
- Flyttade gemensam boot/recovery till en liten återanvändbar bootstrap och lade respektive appskal bakom en explicit, separat applikationsrot.
- Lade ett genererat `bundle-audit.json` i varje mobilbuild med varje outputchunks exakta modullista och byteantal.
- Gjorde bundleauditen obligatorisk i `build:scanner` och `build:time`. Bygget failar på fel entry, förbjudna appfamiljer eller överskriden budget.
- Låste Scanner till högst 1 150 000 byte JavaScript och Time till högst 3 150 000 byte JavaScript. Aktuella utfall är 1 042 036 respektive 3 078 997 byte.
- Scanneroutputen innehåller inte `App.tsx`, Time-skalet eller projekt-, ekonomi-, personal-, admin- och Time-rutter.
- Timeoutputen innehåller inte Zebra-/lagerscannerns app, routes, hooks, service- eller scannerkomponenter.
- Ersatte Time-appens tidigare lager-/Zebra-yta med en tunn kamera-/filbaserad QR- och streckkodsläsare. Den kan läsa/kopiera en kod men innehåller inga lager- eller WMS-mutationer.
- Tar bort den preview-specifika externa `gptengineer.js`-script-taggen ur båda nativebyggenas HTML.
- Lade fyra körbara kontraktstester för separata entries, Time-gränsen, obligatoriska bundlegates och native-HTML.

### Verifiering

| Gate | Resultat |
|---|---|
| `git diff --check` | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release/native/bundle | PASS – 168/168 tester |
| Bundleisoleringskontrakt separat | PASS – 4/4 tester |
| Reservationsrad + readiness Deno | PASS – 10/10 tester |
| Time frontend | PASS – 207 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Scanner bundleaudit | PASS – 367 outputmoduler, 12 chunks, 1 042 036 JS-byte |
| Scanner webbbuild | PASS – appchunk 860,28 kB / 251,11 kB gzip; tidigare 3 212,87 / 900,85 kB |
| Time bundleaudit | PASS – 489 outputmoduler, 14 chunks, 3 078 997 JS-byte |
| Time webbbuild | PASS – appchunk 2 891,41 kB / 816,29 kB gzip; tidigare 3 214,08 / 901,23 kB |
| Full web-entry efter gemensam bootrefaktor | PASS |
| Time + Scanner Capacitor sync | PASS – separata outputs kopierade till respektive nativeprojekt |

### Blockerare och kvarvarande risk

- Time är isolerad från lagerscannern men dess egen appchunk är fortfarande 2,89 MB minifierad. Vidare route-lazyloading är en separat Time-optimering och blockerar inte Scanner-gaten.
- Scanner appchunk är 860 kB minifierad. Den största kvarvarande delen är den aktiva scannerupplevelsen och dess kamera-/WMS-klienter; budgeten stoppar återväxt över 1,15 MB total JavaScript.
- Time `assembleDebug` är fortsatt **NOT EXECUTED / FAIL** eftersom Gradle 8.14.3 inte kan hämtas i den begränsade miljön. Reproduktion: `node scripts/build-android.js time --assemble-debug --skip-build`.
- Scanner Gradlekompilering är fortsatt **NOT EXECUTED / FAIL** utan licensierad API3-AAR och SHA-256. Reproduktion: `npm run android:scanner:verify` med kontraktet i `native/scanner/ZEBRA_SDK.md`.
- Fem Time/backendintegrationstestfiler är fortsatt **NOT EXECUTED / FAIL** utan uttryckligen godkänd LOCAL/TEST-backend. Reproduktion: `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`.
- Fysisk Zebra, DataWedge-broadcast, RFID-trigger, API3, signering och signerad APK/AAB är inte verifierade.

### Exakt nästa batch

1. Kör och komplettera Scanner V2-/kö-/readiness-/release-gaten med dynamiska scenarier för offline, tappat svar, reload, två enheter, idempotens och exakta reservationsrader.
2. Lägg en sammanhållen automatiserbar release-matris som kör Scanner, Time, Deno, bundleaudits och nativekontrakt utan att felaktigt markera externa gates gröna.
3. Granska hela scannerområdet bakåt mot fail-closed-, WMS-authority- och bundlekontrakten och reparera verifierbara luckor.
4. När alla automatiserbara gates är gröna, förbered en ren extraktionsbranch för Scanner utan att aktivera V2, skapa release eller arkivera legacy.

## 2026-08-22 – Isolerade Time- och Zebra-nativeprojekt

Bas: `609ecdb` (`main` efter konfliktkontroll)

Branch/PR: `scanner-hardening/ci-reproducibility` / draft-PR #7

Produktionsaktivering: **nej** – inget är mergat, signerat, driftsatt eller aktiverat och V2 är fortsatt OFF.

### Klart

- Ersatte det delade muterbara `android/` med två fasta projekt: `native/time/android` (`se.eventflow.time`) och `native/scanner/android` (`se.eventflow.scanner`).
- Gav apparna separata webboutputs (`dist-time`/`dist-scanner`), Androidsökvägar, ikoner, Gradleprojekt, package-id, config, signeringsvariabler och releasekommandon.
- Ersatte configkopiering och regex-patchning av Gradle med en stabil `capacitor.config.ts`-dispatcher. `CAPACITOR_APP_MODE` väljer config read-only; inget buildscript skriver längre om en annan apps filer.
- Tog bort scanner-iOS-kommandona. Zebra Scanner är Android-only; befintligt iOS-projekt ägs endast av Time.
- Skapade ett rent Capacitor 8-projekt för Time. Dess Java-källor innehåller varken DataWedge, Zebra RFID eller API3; scanner-pluginerna finns endast i Zebra-projektet.
- Tog bort Firebase/google-services från Zebra-projektet. Time har en separat Firebase-gate och kräver uttrycklig `EVENTFLOW_TIME_GOOGLE_SERVICES_JSON_PATH` för release.
- Gav Time och Scanner separata release-signeringar som failar om appens egna keystorevariabler saknas. Keystores, servicefiler och SDK-binärer ignoreras av Git.
- Gjorde Zebra API3 till ett explicit licensierat bygginput via `ZEBRA_API3_AAR_PATH` + `ZEBRA_API3_AAR_SHA256`. SHA-256 verifieras före staging; saknat eller felaktigt input stoppar före Capacitor/Gradle.
- Flyttade Gradles skrivbara cache till `.gradle-eventflow/` med CI-override `EVENTFLOW_GRADLE_USER_HOME`.
- Lade till sex körbara native-isoleringstester för paths, package-id, configintegritet, plugin-gränser, signering och API3 fail-fast.

### Verifiering

| Gate | Resultat |
|---|---|
| `git diff --check` | PASS |
| TypeScript `tsc --noEmit` | PASS |
| Scanner/V2/kö/readiness/release/native isolation | PASS – 164/164 tester |
| Native isolation separat | PASS – 6/6 tester |
| Reservationsrad + readiness Deno | PASS – 10/10 tester |
| Time frontend | PASS – 204 passerade, 3 uttryckligt hoppade |
| Deno pure timeline | PASS – 6/6 tester |
| Time Capacitor sync | PASS – separat projekt, 8 förväntade Capacitor/Time-pluginer, inga Zebra-pluginer |
| Scanner Capacitor sync | PASS – separat projekt och korrekta relativa pluginpaths |
| Time webbbuild | PASS – `dist-time`, 4 998 moduler; huvudchunk 3 214,08 kB / 901,23 kB gzip |
| Scanner webbbuild | PASS – `dist-scanner`, 4 998 moduler; huvudchunk 3 212,87 kB / 900,85 kB gzip |
| Scanner utan API3-AAR | EXPECTED FAIL – stoppar före sync/Gradle med exakt SDK-kontrakt |

### Blockerare och kvarvarande risk

- Time `assembleDebug` är **NOT EXECUTED / FAIL** efter godkänd config, webbcopy och Capacitor-sync eftersom den begränsade miljön inte kan hämta `https://services.gradle.org/distributions/gradle-8.14.3-all.zip` (`java.net.SocketException: Network is unreachable`). Reproduktion: `node scripts/build-android.js time --assemble-debug --skip-build`.
- Scanner Gradlekompilering är **NOT EXECUTED / FAIL** utan den licensierade API3-AAR-filen och dess SHA-256. Reproduktion: `npm run android:scanner:verify`; godkänd körning kräver variablerna dokumenterade i `native/scanner/ZEBRA_SDK.md`.
- Release-signering är avsiktligt inte körd; separata keystores, lösenord och Time Firebase-konfiguration saknas i denna säkra runner.
- Fem Time/Supabase-integrationstestfiler är fortsatt **NOT EXECUTED / FAIL** utan uttryckligen godkänd LOCAL/TEST-backend. Reproduktion: `TIME_REPORTING_BACKEND_TEST_URL=http://127.0.0.1:54321 npm run test:time-reporting`.
- De separata webboutputs innehåller fortfarande orelaterade rutter och är cirka 3,2 MB minifierade. Nativegränsen är nu ren, men entry-/bundleisolering återstår.
- Fysisk Zebra, DataWedge-broadcast, RFID-trigger, API3 och signerad APK/AAB är inte verifierade.

### Exakt nästa batch

1. Skapa en scanner-specifik Vite-entry/router som endast importerar Scanner-skalet; inga kalender-, projekt-, ekonomi-, personal- eller Time-rutter får finnas i output.
2. Lägg en bundlemanifest-gate som failar på förbjudna chunks/modulnamn och sätt en mätbar storleksbudget.
3. Gör motsvarande tunn Time-entry så Time inte importerar Zebra-scannerflödet; kamera/QR får använda ett separat tunt kontrakt.
4. Kör scanner-, Time-, Deno-, typecheck-, båda webbbyggena och Capacitor-sync igen. Android Gradle förblir FAIL tills Gradle-distribution respektive licensierad API3-AAR är tillgängliga.
5. Aktivera inte V2 och skapa ingen signerad release före fysisk Zebra-gate.

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
