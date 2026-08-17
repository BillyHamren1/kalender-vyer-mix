# Ranjan kommer inte in via HUB — diagnos och åtgärd

## Vad loggarna faktiskt visar

Inloggningsförsöket 17 aug 13:39 kom längre än man kan tro — det är inte HUB-signaturen som stoppar honom:

- HUB-verifieringen gick igenom (annars hade inga service_role-anrop skett).
- Hans konto uppdaterades: `PUT /admin/users/228c5ea2-…` (`user_modified`, ranjan@fransaugust.se) kl 13:39:49, status 200.
- Profil och roller skrevs klart: tre rader i `user_roles` (forsaljning, projekt, lager) för Frans August AB med tidsstämpel 13:39:49.598.
- **Sedan tar spåret slut.** Det finns inget `/admin/generate_link` och inget `/verify` i auth-loggen efter 13:39:49, och `auth.users.last_sign_in_at` för Ranjan står kvar på 12:27 medan `updated_at` är 13:39:49.

Slutsats: allt fram till och med rollsynken fungerar. Sessionsskapandet i slutet av `verify-sso-token` (magic link → `verifyOtp`) blir aldrig en lyckad inloggning, så frontend får aldrig några tokens att sätta.

Exakt vilket av de sista stegen som fallerar går **inte** att slå fast idag: edge function-loggarna för `verify-sso-token` är tomma i loggfönstret, och funktionen loggar ingenting mellan rollsynken och det lyckade slutsvaret. Diagnosen måste därför bekräftas innan något "fixas" på måfå.

## Plan

### 1. Gör felet synligt (först)
Lägg till stegvis loggning och strukturerade felsvar i `supabase/functions/verify-sso-token/index.ts`:

- Logga `[SSO] step` före/efter: hub-verify, användarupplösning, profil-upsert, rollsynk, `generateLink`, `verifyOtp`.
- Logga hela felobjektet (status, `code`, `message`) från `generateLink` och `verifyOtp` — idag returneras bara `message`, och undantag kastas in i den generella catchen som `INTERNAL_ERROR`.
- Returnera felkoden även till klienten så HUB-fliken kan visa den.

### 2. Kör om Ranjans inloggning och läs loggen
Låt Ranjan försöka igen (eller trigga samma flöde), läs sedan edge function-loggen och auth-loggen. Då syns exakt vilket steg som brister — de troliga kandidaterna är:

- `generateLink` nekas (t.ex. rate limit eller e-postrelaterad spärr i GoTrue) → `LINK_GENERATION_FAILED`.
- `verifyOtp` misslyckas → `SESSION_CREATE_FAILED`.
- Ett kastat undantag före anropet → `INTERNAL_ERROR`.

### 3. Åtgärda enligt utfallet
Först när steg 2 pekar ut orsaken görs den riktiga fixen. Ingen gissningsändring i auth-flödet innan dess.

### 4. Härdning som redan är känd svaghet (tas med samtidigt)
`user_roles` har unikt index på `(user_id, role)` utan `organization_id`. Rollsynken raderar bara raderna för aktuell org och sätter sedan in nya — för en användare som finns i två organisationer med samma roll ger det `ROLE_INSERT_FAILED` och blockerad inloggning. Det drabbar inte Ranjan idag (han har bara Frans August AB), men det är samma flöde och bör åtgärdas: gör unikheten `(user_id, role, organization_id)` via migration.

## Teknisk detalj

- Filer: `supabase/functions/verify-sso-token/index.ts` (loggning + felsvar), ev. migration för `user_roles`-unikhet.
- Ingen ändring i `useSsoListener.ts` behövs för diagnosen; den vidarebefordrar redan `error_code`/`message` till HUB via postMessage.
- Inga rader raderas i databasen som del av detta.
