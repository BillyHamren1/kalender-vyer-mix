
# Säkerställ att push-tokens alltid är färska

## Problem
- Webb skickar DM → backend hämtar `device_tokens` → token är >30 dagar gammal → FCM svarar `UNREGISTERED` (eller tyst fail) → notisen kommer aldrig fram.
- `send-push-notification` raderar redan UNREGISTERED-tokens, men ingen ny token registreras automatiskt eftersom mobilappen bara kör `PushNotifications.register()` en gång per session och `'registration'`-eventet emitteras inte alltid om token är cachad.
- Resultat: efter raderingen står staffen helt utan token tills appen råkar emittera ett nytt registration-event.

## Lösning (3 lager)

### 1. Mobil: tvinga fram ny token vid varje app-start + heartbeat-refresh
**Fil:** `src/services/pushNotificationService.ts`
- Behåll `'registration'`-listenern men gör om `initPushNotifications` så att den:
  - Alltid kör `PushNotifications.register()` (idempotent på native, triggar nytt token-event om systemet vill rotera).
  - Lyssnar på `appStateChange` (Capacitor App-plugin, redan installerad) → vid `isActive=true` anropas `register()` igen om senaste lyckade registrering är >24h sedan (spårat i `localStorage`).
- I `mobileApi.registerPushToken` skicka även en lokal timestamp så vi kan logga drift.

### 2. Backend: refresh-fält + auto-cleanup
**Migration (schema):**
- Lägg till `last_refreshed_at timestamptz` (default `now()`) på `device_tokens` (kolumnen är skild från `updated_at` så vi kan se att klienten verkligen pingade in).

**Edge function `mobile-app-api` (`handleRegisterPushToken`):**
- Sätt även `last_refreshed_at = now()` vid varje upsert.
- Logga tydligt om en token byts ut för samma `staff_id` (gammalt prefix → nytt prefix).

**Edge function `send-push-notification`:**
- Behåll UNREGISTERED-radering, men lägg till radering även vid FCM-fel `INVALID_ARGUMENT` med detail `INVALID_ARGUMENT` på fältet `token`.
- Lägg till strukturerad logg `[FCM] stale_token_purged staff=… age_days=…` så vi ser att rensningen sker.

### 3. Server-side städning av riktigt gamla tokens
**Migration (data-säker SQL i ny edge function `cleanup-stale-device-tokens`, körs av cron):**
- Radera `device_tokens` där `last_refreshed_at < now() - interval '30 days'`.
- Schemalägg via `pg_cron` (eller manuell trigger från admin) — körs en gång per natt.
- Detta tvingar mobilappen att registrera om vid nästa app-start, vilket nu sker säkert tack vare lager 1.

## Vad som INTE ändras
- `direct_messages`-flödet rörs inte.
- DM-trigger / broadcast-trigger oförändrade.
- Befintliga tokens som faktiskt är giltiga lever vidare.
- Scanner-appen påverkas inte (push är redan disabled där).

## Effekt för Markus / Raivis / övriga
- Nästa gång de öppnar Time-appen tvingas en ny token registreras hos FCM och sparas i `device_tokens` med ny `last_refreshed_at`.
- Webb-DM:s börjar nå fram igen så fort den nya token ligger i tabellen (sekunder efter app-open).
- 30-dagars-cron säkerställer att vi aldrig hamnar i samma stale-läge igen.

## Filer som kommer ändras
- `src/services/pushNotificationService.ts` — re-register vid app resume + 24h-refresh-policy
- `supabase/functions/mobile-app-api/index.ts` — sätt `last_refreshed_at`, logga rotation
- `supabase/functions/send-push-notification/index.ts` — bredare invalid-token-rensning + tydligare loggar
- `supabase/functions/cleanup-stale-device-tokens/index.ts` (ny) — nattlig rensning
- Migration: lägg till `last_refreshed_at` på `device_tokens` + pg_cron-jobb
