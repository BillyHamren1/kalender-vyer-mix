# Plan: GPS-pulse via silent push för alla aktiva appar

## Mål
Garantera ≥1 GPS-ping var ~10:e minut för **alla inloggade enheter** som har platsbehörighet — oavsett om personen "jobbar" eller inte. Vi vill se var alla är, alltid. Löser stationära luckor (lunch, möte, paus) som annars blir 4+ timmars tomrum i kartan.

Detta överensstämmer med **No Workday Logic** — ingen workday-gating, ingen aktivitetsgating. GPS = ren signal.

## Princip
- iOS/Android väcker appen kort när FCM/APNs skickar `content-available: 1` (silent push).
- Appen tar EN `getCurrentPosition()` och postar till `mobile-app-api` precis som vanliga pings.
- Pulsen är på så länge enheten har:
  - giltig device-token registrerad (= inloggad i mobilappen)
  - location permission given (klienten skickar tysk error om nekat → backend kan markera token vilande)
- Återanvänder befintlig FCM/APNs-pipeline (`ios-push-notifications-v1`). Ingen pluginändring.

## Komponenter

### 1. Edge function: `gps-heartbeat-pulse` (ny)
- Körs av pg_cron varje minut.
- SQL:
  - Hämta alla `device_push_tokens` (eller motsvarande FCM-token-tabell) som är `active=true`.
  - Vänster-joina senaste `staff_location_history.recorded_at` per staff.
  - Filtrera: `last_ping IS NULL OR now() - last_ping > interval '9 minutes'`.
  - **Ingen** workday-koll. **Ingen** aktivitets-koll.
  - Night Auto-Start Guard rör INTE GPS-insamling — bara auto-start av tid. Vi pulserar dygnet runt (justerbart per org senare om någon klagar på batteri).
- För varje träff: skicka silent push:
  ```json
  { "aps": { "content-available": 1 }, "type": "gps_pulse", "issued_at": "..." }
  ```
- Logga i ny tabell `gps_pulse_log` (staff_id, device_token_id, sent_at, delivered_ping_id, lag_ms) för observability.
- Sätt `device_push_tokens.last_pulse_failed_count++` om push returnerar invalid → vid 5 misslyckanden markera token inactive.

### 2. Cron-schemaläggning
- `pg_cron`: `* * * * *` → POST till `gps-heartbeat-pulse`.
- SQL körs via supabase insert (anon-key + URL).

### 3. Klient: silent push-handler
- Ny `src/hooks/useGpsPulseHandler.ts`, monteras i `TimeAppLayout` (gäller bara time-appen, scanner-appen exkluderas).
- Lyssnar på FCM `notificationReceived` med `data.type === 'gps_pulse'`.
- Anropar `Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 8000 })`.
- POST till samma endpoint som vanliga pings med `battery_source: 'gps_pulse'`.
- Om permission denied: posta tom statushändelse så backend kan stänga ner pulsen för token.

### 4. iOS-konfig (verifiering)
- `aps-environment` finns (dev). `UIBackgroundModes` innehåller `remote-notification` + `location`. Båda redan satta enligt befintligt push-flöde.

### 5. Observability
- Enkel admin-vy eller SQL: senaste 24h `gps_pulse_log` per staff → medellag (push→ping) + success rate.
- Larma vid <70% delivery på 24h.

## Tester
- Edge function unit test: rätt tokens väljs, throttle på 9 min, inaktiva tokens hoppas över.
- Klient: mocka FCM-event, verifiera att `getCurrentPosition` + ingest-anrop sker.
- Manuellt i preview: lämna telefonen still i 30 min, se att pings kommer ~var 10:e min.

## Tekniska detaljer
- **Nya filer:** `supabase/functions/gps-heartbeat-pulse/index.ts`, `src/hooks/useGpsPulseHandler.ts`, migration för `gps_pulse_log`.
- **Ändrade filer:** `src/shells/time/TimeAppLayout.tsx` (montera handler), `mobile-app-api` ingest (acceptera `battery_source='gps_pulse'`).
- **Pulse-frekvens:** 10 min standard. iOS rate-limitar silent push i värsta fall till ~2-3/tim när systemet tycker appen "missbrukar" → 10 min är säker zon.
- **Android:** FCM data-only med `priority: high` → väcker app omedelbart. Samma handler.
- **Inget rör:** Capgo-plugin, distanceFilter, adaptive location mode, hemzonslogik, time engine.

## Begränsningar (transparent)
- iOS kan ändå throttla en enhet om appen mest stänger sig direkt (vi tar en fix + postar, så normalfallet är OK).
- Telefon avstängd / no-network → ingen ping (förväntat). Markeras i observability.
- Batteripåverkan: ~1 fix var 10:e min = försumbart jämfört med aktiv GPS-tracking.
