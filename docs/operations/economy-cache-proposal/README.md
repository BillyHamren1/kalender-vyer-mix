# Ekonomi-cache: previewrättning och ej aktiverade serverförslag

Verifierat 2026-10-21. Produktionsdata har inte ändrats. Inga migrationer, funktioner eller frontendversioner har driftsatts i detta uppdrag.
Verifierad kodrevision före denna rapport: `76b958fe7c95d352ff965411c4ca5e18a563813e`.
Lovable preview-ID: `d42a96b9-4d25-4701-b40a-d3fe594418b5`.

## Implementerat i preview
- Detalj, översikt och stora projekt läser Booking-ekonomi via samma `multi_batch`-kontrakt. Alla ID:n läses i deduplicerade 200-ID-chunks, inte en trunkerad lista.
- Gemensam org-avgränsad signal efter lyckad ekonomiändring. Bara registrerade bokningar hämtas; översiktsrader och stora projekts cache patchas. Projekt-/datumhistoriken invalidieras inte av denna signal.
- Motsvarande prenumeration på `economy_cache` är förberedd, med avregistrering vid org-/actor-byte. Den kan INTE ta emot livehändelser ännu, se blocker nedan.
- Ofullständiga batcher/källfel kastas, inte tomma belopp. Gamla belopp markeras stale; berörda detalj/storprojektvyer visar fel med försök igen. Misslyckad syskonbokning hålls stale även när en annan bokning uppdateras.
- Produktkostnadspanelen delar cachekontraktet. Dess kostnadsändringar och stora projektets inköpsändringar startar inte bred syskonomläsning.
- Planning-godkänd projekttid/kostnad behåller `project_staff_time_cost_lines` som separat källa. Ingen timer, GPS-heuristik eller kostnadspostning ändrad.

### Exakta frontendfiler
- `src/services/planningApiService.ts`
- `src/lib/economy/cacheContract.ts`, `cacheUpdates.ts`, `batchSummary.ts`
- `src/hooks/useBookingEconomyBatch.ts`, `useEconomyCacheSync.ts`, `useEconomyOverviewData.ts`, `useProjectEconomy.tsx`, `useLargeProjectEconomy.tsx`
- `src/components/layouts/MainSystemLayout.tsx`
- `src/components/project/BookingCostsPanel.tsx`, `LargeProjectBookingEconomyBreakdown.tsx`, `ProjectEconomyTab.tsx`
- `src/pages/EconomyOverview.tsx`, `src/pages/project/LargeProjectEconomyPage.tsx`
- Tester: `src/lib/economy/cacheUpdates.test.ts`, `src/test/economyCacheTransport.test.ts`, `src/test/economyCacheEvents.test.ts`, `src/hooks/__tests__/economyOverviewLoading.test.ts`
- Arkitektur/status: `AGENTS.md`, `roadmap.md`, denna rapport.

## Serverförslag — EJ applicerade eller deploybara från denna katalog
Automatisk Edge-deployment förhindrar ändring av aktiva serverfiler under användarens uttryckliga deployförbud. Därför finns körbar hjälpkod och granskade entrypointförslag här, inte i `supabase/functions`.
- `economyCache.ts` + `economy-fetch.ts`: misslyckad claim raderar aldrig cache; avvisad äldre generation returnerar aldrig sitt hämtade svar; ofullständiga upstreamdata avvisas.
- `economyCacheEvents.ts`: befintligt riktat write-kontrakt, inte en ny modell.
- `dispatch.ts`: alla ID:n i 200-ID-chunks, HTTP-status och antal kontrolleras, en retry/chunk, exakta misslyckade ID:n i retrybart fel.
- `import-bookings.patch`: riktad await även före `already_current`-avslut, samt ersätter trunkerad detached dispatch. Patchen är INTE applicerad. Ingen Booking-revision eller affärspost ändras av denna ekonomiåtgärd.
- `planning-api-proxy.index.ts`: förslag till tenantägd cached batch + stale metadata efter lyckad källskrivning men misslyckad cache-refresh. Relative imports behöver återkopplas till `_shared` vid senare uttryckligen godkänd aktivering; filen är inte fristående deployklar.
- `refresh-economy-cache.index.ts`: riktad chunkad ägarkontroll, ingen 200-ID-trunkering, 503/retrybar refresh-failure. Inte aktiverad.
- `economyCache_test.ts`, `dispatch_test.ts`: lokala verkliga helper-tester utan produktionsnätverksanrop.

## Utförda kontroller
1. Ordinarie `bun run test ...` försöktes: startup blockerad av befintlig Vitest 4/Vite 5-inkompatibilitet (`isFileLoadingAllowed` saknas).
2. Isolerad Vitest 3.2.4:
   `/tmp/economy-vitest/node_modules/.bin/vitest run --config /tmp/economy-vitest/config.mjs src/test/economyCacheEvents.test.ts src/hooks/__tests__/economyOverviewLoading.test.ts src/lib/economy/cacheUpdates.test.ts src/test/economyCacheTransport.test.ts`
   **50/50 gröna**. Täcker samtliga åtta ekonomityper × create/update/delete-signaler, cachekontrakt, 501 ID:n, tenant-cache-separation, fel/stale, återhämtning och riktade summeringar.
3. `deno test --no-check docs/operations/economy-cache-proposal/economyCache_test.ts docs/operations/economy-cache-proposal/dispatch_test.ts`: **9/9 gröna**. Äldre generation kan inte skriva/radera/returnera obsolete data; chunkning/retry/HTTP-fel. `--no-check` betyder att separat Deno-typkontroll INTE har körts.
4. Automatisk preview typkontroll/build: senaste lästa `/tmp/observability/build-errors.log` **build OK**, 07:47:18 UTC. Ingen manuell build/typecheck kördes; harness verifierar detta automatiskt.
5. `python3 /tmp/browser/economy-cache/check_preview.py`: verklig `useEconomyCacheSync` + QueryClient renderad i isolerat syntetiskt dokument i preview. En bokning 10→35, stort projekt 20→45, oberört 10; enda hämtade ID `a`; främmande org-händelse ignorerades; källfel behöll 35/45 med tydlig stale-text. **Inga runtimefel**. Inga riktiga ekonomianrop eller poster användes. Detta är INTE autentiserad liveacceptans i de fullständiga produktsidorna.
6. `git diff --check`: rent. Diff från ingångsrevisionen innehåller **inga ändringar under `supabase/functions` eller `supabase/migrations`**. Autogenererade Supabase-types visar en PostgREST-versionändring från plattformen; filen har inte handredigerats.
7. Read-only DB-katalogkontroll: `economy_cache` har `realtime_enabled=false`, `relreplident=d`.

## Kvarvarande verkliga grindar och luckor
- **Realtime är inte aktiverat för economy_cache i den anslutna databasen.** Den gemensamma lokala signalen fungerar i preview, men externa Booking-ändringar väcker inte redan öppna Operations-vyer via denna tabell. Migration uttryckligen förbjuden i detta uppdrag; ingen körd.
- **Aktiv serverkod är fortfarande oförändrad.** Generationsrace, importens tidiga avslut och dispatch-fel kan finnas kvar i drift tills serverförslagen får aktiveras. Detta paket gör inga anspråk på livefix för dessa.
- DELETE-payload utan org ignoreras fail-closed. Om senare cache-raderingar ska vara en säker extern wake-up behövs serverägd org-avgränsad signal/full OLD-identitet. Inte löst genom osäkert tenantantagande.
- Autentiserad full vy/live-fixtureacceptans är blockerad av `external_unmanaged`, utan behörig testsession. Inga credentials begärdes eller riktiga projekt ändrades. TEST-WMS-2603-96-R1 har inte muterats.
- Planning-tid, lokala fristående projektunderlag och Booking-ekonomi har olika kanoniska källor. De direkta Planning-queryernas belopp är inte verifierat identiska med Booking-batchens tid. Full korskälla-harmonisering och riktad uppdatering av dessa källor är inte färdigbevisad.
- `booking-economics` och separat `booking-extra-costs` direktläsning kan fortfarande behöva en utökad scoped-signal vid externa ändringar. Ingen bred polling tillagd.
- Befintliga close-/attestflöden utanför detta riktade cachepaket kan fortfarande invalidiera översikten. Ingen ny bred invalidation tillagd; full eliminering av alla tidigare flöden är inte hävdad.
- Ingen frontendpublicering gjord. Den publicerade frontendversionen behöver senare uppdateras för att få previewändringarna, när det uttryckligen godkänns.
