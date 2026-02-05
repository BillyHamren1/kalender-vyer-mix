

## Fixa SSO: Byt till direkt session-skapande

### Problemorsak
Nuvarande implementation använder:
1. Edge function → `generateLink` (magic link) → returnerar `hashed_token`
2. Frontend → `verifyOtp(token_hash)` → försöker verifiera

Detta misslyckas med "Email link is invalid or has expired" eftersom magic link tokens är extremt kortlivade och engångs.

### Lösning
Byt till att **skapa sessionen direkt** i edge function och returnera fullständiga tokens som frontend sätter via `setSession()`.

### Tekniska ändringar

#### 1. Edge Function (`verify-sso-token/index.ts`)
Istället för `generateLink`, använd en av dessa approaches:

**Approach A - Signera en custom JWT (rekommenderas)**
```typescript
// Generera access_token och refresh_token direkt
const { data: sessionData, error } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: payload.email,
  options: { redirectTo: '/' }
});

// Sedan omedelbart verifiera den själv för att få sessionen
// ELLER använd admin.createUser + admin.updateUserById för att sätta session
```

**Approach B - Skapa användare och generera session direkt**
Använd `admin.createUser` om användaren inte finns, sedan `admin.generateLink` med omedelbar verifiering på serversidan.

**Approach C - Använd `signInWithPassword` med en genererad engångslösenord**
Edge function sätter ett tillfälligt lösenord, loggar in, och returnerar sessionen.

#### 2. Frontend (`useSsoListener.ts`)
Byt från `verifyOtp` till `setSession`:

```typescript
// FÖRE (fel):
const { error } = await supabase.auth.verifyOtp({
  token_hash: data.hashed_token,
  type: 'magiclink',
});

// EFTER (korrekt):
const { error } = await supabase.auth.setSession({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
});
```

### Implementation

#### Edge Function - Ny approach
```typescript
// Efter signaturverifiering, skapa session direkt:

// 1. Säkerställ användaren finns
let userId = payload.user_id;
const { data: existingUser } = await supabase.auth.admin.getUserById(userId);

if (!existingUser?.user) {
  // Skapa användaren om den inte finns
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    id: userId,
    email: payload.email,
    email_confirm: true,
    user_metadata: { full_name: payload.full_name }
  });
  if (error) throw error;
}

// 2. Generera JWT-session direkt (kräver custom JWT-signering)
// Alternativt: Använd en workaround med tillfälligt lösenord
const tempPassword = crypto.randomUUID();
await supabase.auth.admin.updateUserById(userId, { password: tempPassword });

const { data: session, error } = await supabase.auth.signInWithPassword({
  email: payload.email,
  password: tempPassword,
});

// Returnera access_token och refresh_token
return { 
  access_token: session.session.access_token,
  refresh_token: session.session.refresh_token 
};
```

#### Frontend - Sätt session direkt
```typescript
const { data: sessionData, error } = await supabase.auth.setSession({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
});
```

### Filer som ändras
| Fil | Ändring |
|-----|---------|
| `supabase/functions/verify-sso-token/index.ts` | Byt från `generateLink` till direkt session-skapande |
| `src/hooks/useSsoListener.ts` | Byt från `verifyOtp` till `setSession` |

### Säkerhetsnoteringar
- HMAC-SHA256 signaturverifiering sker fortfarande först
- Tillfälligt lösenord är aldrig exponerat till frontend
- Session skapas endast för verifierade SSO-tokens

