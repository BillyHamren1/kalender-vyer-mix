# Scanner hardening – batchstatus

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
