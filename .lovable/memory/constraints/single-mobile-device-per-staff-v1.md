---
name: Single Mobile Device Per Staff
description: En staff kan vara inloggad på endast EN mobil-enhet. Senaste login revokerar alla tidigare mobil-tokens via active_mobile_session_id-rotation.
type: constraint
---

## Regel

Vid `handleLogin` i både `mobile-app-auth` och `mobile-app-api`:
1. Generera ny `sessionId = crypto.randomUUID()`.
2. `UPDATE staff_members SET active_mobile_session_id = sessionId, active_mobile_session_at = now() WHERE id = staff_id`.
3. Baka in `sessionId` i token-payloaden (`btoa({ staffId, sessionId, timestamp, expiresAt })`).

Vid alla authenticerade anrop (mobile-app-api + `_shared/staff-auth.ts` för snapshot-endpoints):
- Läs `staff_members.active_mobile_session_id`.
- Om kolumnen är satt OCH tokenens `sessionId` ≠ kolumn-värdet → 401 `{ error, code: 'token_revoked' }`.
- Om kolumnen är NULL (legacy) → släpp igenom (bakåtkompatibilitet).

Token-rotation (`maybeRotateToken`) behåller den befintliga `sessionId` — sliding refresh bryter aldrig single-device-regeln.

Klient (`mobileApiService` → `MobileAuthContext`):
- 401 med `code === 'token_revoked'` triggar `mobile-session-revoked`-event med reason-meddelande.
- `MobileAuthContext` rensar auth + visar toast "Sessionen avslutades på en annan enhet."

## Varför

Två iPhones inloggade på samma konto ger dubbla GPS-pings utan dedup
(`raw-gps-ingestion-no-dedupe-v1`) och förstör admin-tidsrapporten med
"solfjäder"-mönster på kartan (pings 2 ms isär men 19 km ifrån varandra).
Backenden måste enforca "en aktiv enhet per staff".

## Inte i scope

- Webb-sessioner (admin-portalen via Supabase JWT) påverkas INTE — bara mobila tokens.
- Befintlig GPS-data städas INTE (`never-delete-db-rows-without-explicit-request-v1`).
- view-as från admin (`x-view-as-staff`) påverkas inte — det går via admin-användarens egen aktiva session.
