## Vad jag hittat i datan

| Kontroll | Resultat |
|---|---|
| `staff_members` (Raivis Minalto) | Finns, org `Frans August AB` |
| `staff_accounts` (lösenord-hash) | Finns, skapad 2026-04-15 ✅ |
| `auth.users` rad | Saknas — men det krävs inte; mobil-login går via `staff_accounts` |
| `active_mobile_session_id` | NULL → han har aldrig slutfört en login |
| Edge-loggar `mobile-app-auth` | **0 anrop senaste timmen** |
| Edge-loggar `mobile-app-api` | Många 200 OK (men från en annan staff, inte Raivis) |

Han svarar att felet är "Login failed" på senaste TestFlight-build, med standardlösen Frasse123.

**Slutsats:** Hans login-request når aldrig backend. Om e-post/lösen var fel skulle vi sett 401-poster i `mobile-app-auth`-loggen. Det gör vi inte. Något bryter mellan iOS-appen och Supabase.

## Mest sannolika orsaker (i prioritetsordning)

1. **TestFlight-builden har inte rätt Supabase-URL/anon-key** — om `VITE_SUPABASE_URL` saknades vid native-build går fetch mot en tom/fel host → "Failed to fetch" → frontend visar "Login failed".
2. **Nätverk på hans iPhone** — captive portal, företags-VPN eller IPv6-only carrier som blockar Supabase.
3. **iOS ATS / cleartext** — om den aktiva `capacitor.time.config.ts` har `server.url` satt till en `http://`- eller preview-domän som inte längre svarar, blockar iOS requesten.
4. **E-post stavfel i input-fältet** (autocorrect lägger till mellanslag / stor bokstav). Vi `ilike`-matchar men ledande blanksteg fångas inte alltid.

## Plan — verifiera utan att gissa

### Steg 1: Bekräfta att requesten verkligen inte kommer fram
Be Raivis försöka logga in **medan vi tittar live**, sedan kör jag en analytics-query mot `function_edge_logs` filtrerad på `mobile-app-auth` för senaste 5 min. Tre utfall:

- **Inget anrop syns** → klientproblem (build-URL eller nät). Gå till steg 2.
- **401 syns** → fel lösen/e-post. Gå till steg 3.
- **500 syns** → serverbugg. Jag tittar på felet och fixar.

### Steg 2: Klientproblem
Be honom:
- Öppna TestFlight-appen → kontrollera version + build-nummer (skickar mig en skärmdump).
- Testa logga in på **WiFi** vs **mobilnät** — om bara ena funkar är det nätverket.
- Försöka logga in med en *annan* användare på samma telefon — om det också faller är det 100 % build/nätverk, inte hans konto.

Om alla användare faller på den TestFlight-builden behöver vi göra en ny iOS-build där `VITE_SUPABASE_URL` och `VITE_SUPABASE_PUBLISHABLE_KEY` garanterat är inbakade.

### Steg 3: Lösenordsproblem
Återställ hans `staff_accounts.password_hash` till hash av "Frasse123" via en liten migration (en rad UPDATE — jag visar SQL först och inväntar OK eftersom det rör en användares credentials).

### Steg 4 (om steg 1–3 inte räcker): tillfällig diagnostik-logg
Lägga till en `console.log('[mobile-app-auth] identifier=', normalizedIdentifier, 'matchedEmailStaff=', matchedEmailStaff)` i `supabase/functions/mobile-app-auth/index.ts` så vi ser exakt vilken identifier hans app skickar nästa gång han försöker. Tas bort efteråt.

## Vad jag INTE gör utan grönt ljus

- Skapar inte en `auth.users`-rad åt honom (mobil-login behöver det inte).
- Rör inte några GPS-/time-tabeller.
- Skriver inte över hans lösenord-hash förrän steg 1 sagt att det är ett 401-problem.

## Vad jag behöver från dig nu

1. Be Raivis trycka "Logga in" **just nu**, och säg till mig när han gjort det — jag kollar loggen direkt.
2. Skicka gärna skärmdump på exakta felmeddelandet + TestFlight-versionen.
