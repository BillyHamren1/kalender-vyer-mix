# En enhet per staff (senaste login vinner)

## Bekräftad diagnos
För Toms Nauzers 2026-06-02 finns pings 2 ms isär men 19 km ifrån varandra. Det är fysiskt omöjligt — två klienter pingar parallellt mot `mobile-app-api`, och eftersom `raw-gps-ingestion-no-dedupe-v1` accepterar allt råmaterial får vi en "solfjäder" i kartan och kaotiska visits/travels i dayPartition.

Vår enhetsfingerprint (`platform|device_model|app_id|app_build`) såg dem som "1 enhet" → vi måste införa ett riktigt device-id för att kunna skilja och retira.

## Mål
1. Vid mobil-login: invalidera ALLA tidigare `mobile_app_tokens` för samma `staff_id` (senaste vinner).
2. Gamla telefonens token slutar funka → dess `mobile-app-api`-anrop får 401 → klienten loggar ut tyst.
3. GPS-pings från okänd/utloggad token avvisas (eller flaggas), så pipeline blir ren framåt.
4. Befintlig brusig GPS-data röras INTE (per `never-delete-db-rows`). Vi filtrerar bara nytt brus.

## Genomförande

### 1. Backend — token-rotation
`supabase/functions/mobile-app-api/` (login-action):
- Vid lyckad login efter att en ny `mobile_app_tokens`-rad skapats, kör `UPDATE mobile_app_tokens SET revoked_at = now(), revoked_reason = 'superseded_by_newer_login' WHERE staff_id = $1 AND id != $newId AND revoked_at IS NULL`.
- I auth-middleware (`_shared/staff-auth.ts` eller motsvarande): avvisa token där `revoked_at IS NOT NULL` med 401 `token_revoked`.

Migration: lägg till `revoked_at timestamptz`, `revoked_reason text` på `mobile_app_tokens` om de saknas.

### 2. Klient — tyst utloggning
`src/contexts/MobileAuthContext.tsx` (eller motsvarande): vid 401 med kod `token_revoked` → rensa lokal token, navigera till `/m/login`, visa toast "Du loggades ut för att kontot är aktivt på en annan enhet".

### 3. Hård spärr i ping-mottagningen (skyddsnät)
`mobile-app-api` `report_location`-action: om token är revoked eller saknas → returnera 401 utan att skriva till `staff_location_history`. Detta säkrar att även en cachead/återanvänd token från gammal enhet inte kan smutsa data.

### 4. Admin-synlighet (litet)
StaffTimeReports-detalj: när dagen har pings som överlappar i tid men ligger >2 km isär inom <60 s, visa en liten varningschip "Möjligt flera enheter under perioden X–Y". (Pure UI, läser bara på data — ingen mutation.)

## Test
- Vitest: `tokenRotation.test.ts` — sätt upp två tokens, anropa login, verifiera att äldre raden får `revoked_at`.
- Edge function test: `mobile-app-api/login_test.ts` + `mobile-app-api/auth_revoked_test.ts` (401 på revoked token).
- Contract: lägg `multipleDeviceDetection.test.ts` som ger två ping-strömmar och verifierar att admin-varningen triggar.
- Kör `bash scripts/test-time-reporting.sh` efter ändring för att säkra att inget i write-paths gick sönder.

## Inte i scope
- Ingen DELETE/UPDATE av befintliga `staff_location_history`-rader (per memory).
- Ingen ändring av dedupe-logik i dayPartition utöver det vi redan gjort (`SHORT_STAY_MAX_MS` flap-fix).
- Ingen "tvinga ut" av gamla webb-sessioner (admin-portalen) — påverkar bara mobile_app_tokens.

## Memory-uppdatering
Lägg `mem://constraints/single-mobile-device-per-staff-v1.md`: "Vid mobil-login revokeras alla tidigare mobile_app_tokens för samma staff_id. Auth-middleware returnerar 401 token_revoked. Skyddar GPS-pipeline från parallella enheter."
