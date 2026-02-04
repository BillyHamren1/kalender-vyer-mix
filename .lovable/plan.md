
## Målet
Fixa att man inte kan logga in med lösenord på `/auth` trots “rätt” lösen, och samtidigt säkerställa att användare får roller så att de inte fastnar på “Åtkomst nekad” efter inloggning.

## Vad jag ser i systemet just nu (orsaksanalys)
- För användaren `billy.hamren@fransaugust.se` finns ett konto i `auth.users` och e-post är bekräftad.
- Det finns en `encrypted_password` (dvs ett lösenord är satt i Supabase Auth).
- Det finns **inga roller** i `public.user_roles` för Billy (tomt resultat), vilket innebär att även om inloggning fungerar kommer `ProtectedRoute` sannolikt att stoppa användaren med “Åtkomst nekad”.
- Auth-loggar visar att Billy nyligen kunde logga in via OTP/magic link (inte via lösenord), men lösenordsinloggning ger “Invalid login credentials”.

Det mest sannolika är därför:
1) Lösenordet i “Hubben” är inte samma som lösenordet i Supabase Auth (sync har inte uppdaterat), eller så “syncen” returnerar success utan att faktiskt uppdatera pga hur befintlig användare hittas.
2) Roller har inte synkats in → access blockeras även efter lyckad login.

## Lösning – vad jag kommer implementera

### A) Gör `receive-user-sync` robust (så lösen + roller alltid synkar korrekt)
**Problem i nuvarande implementation:**
- Den letar befintlig användare via `adminClient.auth.admin.listUsers()` och gör en `.find(u => u.email === email)`.
  - Detta kan fallera vid:
    - pagination/limit (användaren ligger inte i första “sidan” av listUsers)
    - case/whitespace mismatch (Hubben skickar t.ex. `Billy.Hamren@...` eller trailing space)
  - När den inte hittar användaren försöker den skapa ny → `already been registered` → returnerar `success: true` men **uppdaterar inte lösen/roller**. Då ser Hubben “OK”, men inget händer.

**Ändringar jag gör i edge-funktionen (`supabase/functions/receive-user-sync/index.ts`):**
1. **Normalisera e-post** direkt:
   - `email = email.trim().toLowerCase()`
2. **Deterministisk lookup av user_id**:
   - Primärt: slå upp `public.profiles` på `email` och hämta `user_id` (ni har `profiles.email`-kolumn).
   - Fallback: om profilen saknas, använd `listUsers` men hantera pagination (loopa sidor tills hittad eller slut).
3. Om användaren hittas:
   - Uppdatera lösenord via `adminClient.auth.admin.updateUserById(userId, { password })` när `password` finns.
   - Upserta/uppdatera `profiles` (sätt `full_name`, `organization_id`, och säkerställ `email` matchar).
   - Synka roller atomiskt:
     - ta bort befintliga roller för user_id
     - lägg in nya validerade roller (endast `admin|forsaljning|projekt|lager`)
4. Om användaren inte hittas:
   - Skapa ny användare (`createUser`) med `email_confirm: true` och password om det skickas.
   - Skapa/synka roller och profil som idag.
5. **Om `createUser` svarar “already been registered”**:
   - Tolka detta som “användaren finns men lookup missade” och gör en ny lookup via `profiles`/pagination → fortsätt med password+roles update istället för att returnera “success” direkt.
6. Förbättra svarspayload (utan känslig data) så Hubben kan logga vad som faktiskt hände:
   - exempel: `{ success: true, user_id, actions: { passwordUpdated: true/false, rolesSynced: n, profileUpdated: true/false }, mode: "existing|created" }`

**Varför detta fixar login-problemet:**
- Hubben kan då garanterat sätta rätt lösenord i Supabase Auth för existerande användare (även om användarlistan är stor eller e-post casing skiljer).
- Roller kommer samtidigt in i `public.user_roles`, så användaren får access efter login.

---

### B) Gör fallback-inloggningen på `/auth` mer “idiotsäker” (så man alltid kan komma vidare)
Även om syncen fixas är det bra att ha en manuell väg när lösenord är osäkert.

**Ändringar i frontend:**
1. Uppdatera `src/pages/Auth.tsx`:
   - Lägg till val:
     - “Logga in med lösenord” (nuvarande)
     - “Skicka inloggningslänk” (magic link) till samma e-post
     - “Glömt lösenord” (password reset) som skickar återställningsmail
   - Tydliga felmeddelanden som skiljer på:
     - fel lösen
     - konto saknar behörighet (roller saknas) – (se punkt C nedan)
2. Lägg till ny route och sida för återställning:
   - Ny sida: `src/pages/AuthResetPassword.tsx` (eller motsvarande)
   - Ny route i `src/App.tsx`: `/auth/reset`
   - Flöde:
     - Användaren klickar “Glömt lösenord” → `supabase.auth.resetPasswordForEmail(email, { redirectTo: ${origin}/auth/reset })`
     - När de kommer tillbaka till `/auth/reset` får de sätta nytt lösenord (`supabase.auth.updateUser({ password })`)
     - Redirect till appen efter lyckat byte

**Obs (krav i Supabase settings):**
- För magic link och password reset måste Supabase Auth ha korrekta Redirect URLs:
  - Preview URL: `https://id-preview--d42a96b9-4d25-4701-b40a-d3fe594418b5.lovable.app`
  - Published URL: `https://kalender-vyer-mix.lovable.app`
  - Dessa måste ligga i Auth → URL Configuration → Additional Redirect URLs (och Site URL bör vara rätt miljö).

---

### C) Förbättra “Åtkomst nekad” så support blir snabb (roller saknas idag)
Eftersom Billy just nu har 0 roller kommer han troligen stoppas efter login även när lösenordet väl fungerar.

Jag uppdaterar `src/components/auth/ProtectedRoute.tsx` (eller skapar en liten komponent) så att “Åtkomst nekad”-vyn:
- visar vilken e-post som är inloggad
- visar att inga roller är synkade (t.ex. “Inga roller hittades för ditt konto”)
- visar vilka roller som krävs (admin/projekt/lager)
- ger en enkel knapp “Logga ut” (finns redan) och ev. “Kopiera user-id” för felsökning

Detta ändrar inte säkerheten, bara gör problemet begripligt för användaren.

---

## Testplan (hur vi verifierar att det funkar)
1. Kör en user-sync från Hubben för Billy:
   - med `email`, `password` (det ni vill ska gälla), och `roles` (minst en av: `admin|projekt|lager` för planning access).
2. Försök logga in på `/auth` med lösenordet.
3. Verifiera att användaren inte får “Åtkomst nekad”.
4. Testa även “Skicka inloggningslänk” och “Glömt lösenord”:
   - att e-post kommer fram
   - att redirect går tillbaka till rätt URL
   - att nytt lösenord fungerar efter reset

---

## Filer som berörs
- Backend:
  - `supabase/functions/receive-user-sync/index.ts`
- Frontend:
  - `src/pages/Auth.tsx`
  - `src/App.tsx` (ny route `/auth/reset`)
  - Ny fil: `src/pages/AuthResetPassword.tsx` (reset-flöde)
  - `src/components/auth/ProtectedRoute.tsx` (bättre “Åtkomst nekad”-info)

---

## Risker / edge cases jag hanterar
- Hubben skickar e-post med blandad casing eller whitespace → normalisering.
- Större användarbas än listUsers default → pagination eller profiles-lookup.
- `createUser` returnerar “already registered” → behandla som lookup-fel och fortsätt uppdatera.
- Roller saknas → användare kan logga in men blockas; vi gör detta synligt + fixar sync.

