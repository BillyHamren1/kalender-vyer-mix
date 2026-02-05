
## Fixa SSO Race Condition

### Problemet
Loggarna visar att edge function:en anropas 10+ gånger på samma sekund med samma email. Varje anrop genererar en ny magic link, vilket invaliderar alla tidigare. När frontend sedan kör `verifyOtp` med den första tokenen är den redan ogiltig.

Felet "Email link is invalid or has expired" uppstår för att:
1. Hubben skickar SSO_TOKEN flera gånger (eller postMessage triggas multipelt)
2. `isProcessingRef` skyddar inte mot parallella asynkrona anrop som redan startats
3. Supabase magic link tokens är engångs-tokens

### Lösning
Ändra autentiseringsflödet till att använda Supabase Admin API för att generera en fullständig session direkt, istället för magic link som måste verifieras separat.

### Tekniska ändringar

#### 1. Edge Function - Returnera session direkt
Uppdatera `verify-sso-token` att använda `admin.generateLink` med korrekt hantering och returnera `hashed_token` som kan verifieras klient-sidan, MEN lägg också till möjlighet att returnera komplett session.

Alternativt: Använd en helt annan approach - generera en custom session token som kan sättas direkt.

#### 2. Frontend - Starkare deduplicering
Förbättra `useSsoListener` med:
- **Token-fingerprint tracking**: Spara hash av senast processade token i sessionStorage
- **Striktare lås**: Sätt flag INNAN async-anrop påbörjas, med timeout-reset
- **Debounce**: Vänta några ms innan verifiering startar för att undvika parallella anrop

#### 3. Alternativ: Session direkt via Admin API
Istället för magic link, kan edge function:en skapa sessionen direkt och returnera access_token + refresh_token som frontend sätter via `supabase.auth.setSession()`.

### Rekommenderad implementation

```text
┌──────────────────────────────────────────────────────────────┐
│  FÖRE (nuvarande - race condition)                           │
├──────────────────────────────────────────────────────────────┤
│  Hub → postMessage (x5)                                       │
│    ↓                                                          │
│  useSsoListener → verifySsoToken (x5 parallellt)             │
│    ↓                                                          │
│  Edge Function → generateLink (x5) → 5 olika tokens          │
│    ↓                                                          │
│  Frontend → verifyOtp med token #1 → INVALID (redan ersatt)  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  EFTER (fixat)                                                │
├──────────────────────────────────────────────────────────────┤
│  Hub → postMessage (x5)                                       │
│    ↓                                                          │
│  useSsoListener → token-fingerprint check → endast 1 anrop   │
│    ↓                                                          │
│  Edge Function → generateLink → 1 token                       │
│    ↓                                                          │
│  Frontend → verifyOtp → SESSION ESTABLISHED                   │
└──────────────────────────────────────────────────────────────┘
```

### Filer som ändras
- **src/hooks/useSsoListener.ts** - Lägg till token-fingerprint tracking för att förhindra duplicerade verifieringar
- **supabase/functions/verify-sso-token/index.ts** - Eventuellt optimera för att hantera duplicerade requests

### Säkerhetsnotering
Denna ändring påverkar inte säkerheten - signaturverifieringen sker fortfarande i edge function:en.
