

## Problem
Edge-funktionen `verify-sso-token` skriver over anvandares riktiga losenord med ett slumpmasigt UUID varje gang SSO-flodet kors. Detta gor att:
- Direkt inloggning via /auth slutar fungera for alla anvandare som nagonsin loggat in via Hub
- Losenordet ersatts permanent och kan inte aterstallas utan manuell atgard

## Losning
Byt ut "temp password"-metoden mot Supabase Admin API:s `generateLink` med `magiclink`-typ. Detta skapar en session **utan att rora anvandares losenord**.

Flodet blir:
1. Verifiera SSO-token (oforandrat)
2. Skapa/uppdatera anvandare idempotent (oforandrat)  
3. Tilldela roller (oforandrat)
4. **NY METOD**: Anvand `admin.generateLink({ type: 'magiclink', email })` for att fa en `hashed_token`
5. **NY METOD**: Anvand `verifyOtp({ token_hash, type: 'magiclink' })` for att skapa en riktig session
6. Returnera `access_token` och `refresh_token` (oforandrat)

## Paverkade filer

### 1. `supabase/functions/verify-sso-token/index.ts`
- **Ta bort**: Steg 4 (sat temporart losenord) och Steg 5 (logga in med temp-losenord)
- **Ersatt med**: `admin.generateLink({ type: 'magiclink', email })` foljt av `verifyOtp({ token_hash, type: 'magiclink' })` for att hamta session-tokens
- Inga andra delar av funktionen andras

### 2. Aterstall losenord for paverkade anvandare
- Kora en losenordsaterstallning via Supabase admin for `billy.hamren@fransaugust.se` och eventuellt andra paverkade anvandare, eller informera dem att anvanda "Skicka inloggningslan" pa /auth-sidan for att komma in igen

## Tekniska detaljer

Nuvarande kod (tas bort):
```text
// Steg 4: Temporart losenord
const tempPassword = crypto.randomUUID();
await supabase.auth.admin.updateUserById(userId, { password: tempPassword });

// Steg 5: Logga in
const { data: sessionData } = await supabase.auth.signInWithPassword({
  email, password: tempPassword
});
```

Ny kod (ersatter ovan):
```text
// Steg 4: Generera magiclink for att skapa session utan att andra losenord
const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: normalizedEmail,
});

// Steg 5: Verifiera OTP-token for att fa session
const { data: sessionData, error: verifyError } = await supabase.auth.verifyOtp({
  token_hash: linkData.properties.hashed_token,
  type: 'magiclink',
});
```

## Risker och avvagningar
- `generateLink` + `verifyOtp` ar den rekommenderade metoden fran Supabase for server-side session-skapande
- Befintliga anvandares losenord bevaras intakt
- Inga UI-andringar kravs - returnerade tokens hanteras identiskt av klienten
- Anvandare som redan fatt sina losenord overskrivna behover anvanda "Skicka inloggningslan" for att komma in igen, eller sa kan vi aterstalla deras losenord manuellt

