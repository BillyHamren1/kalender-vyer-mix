# Scanner hardening – batchstatus

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
