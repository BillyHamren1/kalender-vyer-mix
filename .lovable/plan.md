

# Håll alla användare inloggade — eliminera oavsiktliga utloggningar

## Problem (rotorsaker)

**Mobil (Time-app):**
- Egen token i `mobile-app-api` har **hård 24h expiry** (`TOKEN_EXPIRY_HOURS = 24`) och **ingen refresh-mekanism**. Efter 24h → 401 → `clearAuth()` → tillbaka till login-skärmen.
- `verifyToken()` returnerar bara `valid:false` när tiden gått ut, aldrig en förnyad token.

**Webb (Planning):**
- `AuthContext` behandlar `event === 'TOKEN_REFRESHED' && !session` som "logga ut nu". I praktiken kan refresh-eventet komma med tom session vid tillfälliga nätverksfel/sleep — då blir användaren oväntat utloggad trots att refresh-token fortfarande är giltig.
- `getSession()`-error → setSession(null) ger samma symptom vid tillfälliga fel.

## Lösning

### 1. Mobil: rullande token (sliding 30-dagars session + auto-refresh)

**`supabase/functions/mobile-app-api/index.ts`**
- Höj `TOKEN_EXPIRY_HOURS` från 24 → **720 (30 dagar)**.
- Lägg till `refreshThresholdHours = 168` (7 dagar). När en request kommer in med en token som är nära utgång (<7 dagar kvar) eller äldre än 7 dagar sedan utfärdande, generera en **ny token** och skicka tillbaka i response-headern `X-New-Token`.
- `verifyToken()` returnerar även `issuedAt` så servern kan avgöra om refresh behövs.

**`src/services/mobileApiService.ts`**
- I `callApi()`: läs `X-New-Token` från response, och om satt → `localStorage.setItem(TOKEN_KEY, newToken)`. Helt transparent för UI.
- Behåll 401 → clearAuth (men det händer nu bara om token verkligen är 30 dagar gammal eller manuellt återkallad).

**`src/contexts/MobileAuthContext.tsx`**
- Behåll nuvarande "tysta" beteende: nätverksfel/timeout vid `me()` → behåll session.
- Ta bort 8s-timeout som "ger upp" — låt API-lagret styra (15s default) men logga inte ut vid timeout.

### 2. Webb: stoppa felaktiga utloggningar i `AuthContext`

**`src/contexts/AuthContext.tsx`**
- Ta bort blocket som sätter `setSession(null)` på `TOKEN_REFRESHED && !session`. Behåll bara `SIGNED_OUT` som utloggningssignal.
- Vid `getSession()`-error: **logga felet men behåll befintlig state** (försök igen om 30s i stället för att nolla användaren).
- Lägg till tyst bakgrunds-retry: om `getSession()` failar pga nätverk, schemalägg en ny `getSession()` om 30s utan att rendera login-skärmen.

### 3. Diagnostik

- Logga i konsolen varje gång token förnyas (mobil) och vid varje `SIGNED_OUT`/`TOKEN_REFRESHED` (webb), med orsak. Detta så att vi kan bekräfta i fält att utloggningarna upphör.

## Vad ändras INTE
- Inloggnings-flödet (email + lösen) är oförändrat.
- Logout-knappen fungerar som vanligt — explicit `logout()` rensar token direkt.
- Scanner-appen påverkas inte.
- RLS, edge function-säkerhet eller behörigheter rörs inte.

## Filer som kommer ändras
- `supabase/functions/mobile-app-api/index.ts` — 30-dagars token + sliding refresh via `X-New-Token`-header
- `src/services/mobileApiService.ts` — läs `X-New-Token` och uppdatera localStorage transparent
- `src/contexts/MobileAuthContext.tsx` — ta bort tidig 8s-timeout som råkar logga ut
- `src/contexts/AuthContext.tsx` — sluta nolla session vid `TOKEN_REFRESHED` utan session och vid `getSession()`-fel

## Effekt
- Mobilanvändare hålls inloggade i upp till 30 dagar och förnyas automatiskt så länge de använder appen ≥ en gång i veckan.
- Webbanvändare slutar bli oväntat utloggade vid tillfälliga nätverkshicka/sleep-resume.

