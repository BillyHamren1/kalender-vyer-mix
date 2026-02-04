
# SSO-integration med EventFlow Hub

## Översikt
Implementerar SSO (Single Sign-On) för att användare automatiskt ska loggas in i Planerings-modulen när de navigerar från EventFlow Hub.

## Hur det fungerar

```text
┌─────────────────────┐          ┌─────────────────────────────────┐
│   EventFlow Hub     │          │   Planerings-modulen            │
│                     │          │   (kalender-vyer-mix)           │
│                     │          │                                 │
│  Användare klickar  │          │  1. useSsoListener fångar token │
│  på Planering       │──────────│  2. Skickar till Edge Function  │
│                     │          │  3. Verifierar signatur         │
│  Genererar SSO-     │          │  4. Skapar Supabase-session     │
│  token med HMAC     │          │  5. Användaren är inloggad!     │
└─────────────────────┘          └─────────────────────────────────┘
        │                                     │
        │     Via URL: #sso_token=...         │
        │     Via postMessage (fallback)      │
        └─────────────────────────────────────┘
```

---

## Del 1: Edge Function `verify-sso-token`

Skapar en ny Edge Function som:
- Tar emot SSO-token från frontend
- Normaliserar `full_name` (strippar icke-ASCII-tecken som å, ä, ö)
- Verifierar HMAC-SHA256 signatur mot delad hemlighet
- Kontrollerar att token inte är utgången
- Skapar en Supabase-session via Admin API (magic link)
- Returnerar access token för klienten

**Fil:** `supabase/functions/verify-sso-token/index.ts`

**Config-uppdatering:** Lägger till `verify_jwt = false` för funktionen i `supabase/config.toml`

---

## Del 2: Frontend Hook `useSsoListener`

Skapar en React hook som:
- Kollar URL-hash vid laddning efter `sso_token=`
- Lyssnar på `postMessage` events som fallback
- Dekrypterar base64-token och skickar till Edge Function
- Skickar tillbaka SSO_ACK eller SSO_ERROR till Hubben
- Hanterar sessionsskapande i Supabase-klienten

**Fil:** `src/hooks/useSsoListener.ts`

---

## Del 3: Aktivera i App.tsx

Anropar `useSsoListener()` hooken i AppContent-komponenten så den körs vid appstart.

**Fil:** `src/App.tsx`

---

## Secret som behöver konfigureras

| Secret | Beskrivning |
|--------|-------------|
| `SSO_SECRET` | Delad hemlighet för HMAC-signering (EventFlow Hub skickar värdet) |

---

## Filer som skapas/ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/verify-sso-token/index.ts` | Ny Edge Function |
| `supabase/config.toml` | Lägg till verify_jwt = false |
| `src/hooks/useSsoListener.ts` | Ny hook för SSO-lyssnare |
| `src/App.tsx` | Aktivera hooken |

---

## Tekniska detaljer

### HMAC-SHA256 Verifiering
```typescript
// Normalisera payload (matcha Hubbens signering)
const normalizedPayload = {
  ...payload,
  full_name: payload.full_name?.replace(/[^\x00-\x7F]/g, '') || null
};

// Verifiera signatur med Web Crypto API
const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
const expectedSig = await crypto.subtle.sign('HMAC', cryptoKey, 
  encoder.encode(JSON.stringify(normalizedPayload)));
```

### Session-skapande
Använder Supabase Admin API för att generera en magic link och extrahera tokens:
```typescript
const { data: linkData } = await supabase.auth.admin.generateLink({
  type: 'magiclink',
  email: payload.email,
});
```

### PostMessage-kommunikation
```typescript
// Skicka bekräftelse till Hubben
window.parent.postMessage({ type: 'SSO_ACK', success: true }, '*');

// Eller fel
window.parent.postMessage({ 
  type: 'SSO_ERROR', 
  success: false, 
  error_code: 'SIGNATURE_MISMATCH' 
}, '*');
```

---

## Information att skicka till EventFlow Hub-teamet

Efter implementation:
- **PLANERING_SUPABASE_URL:** `https://pihrhltinhewhoxefjxv.supabase.co`
- **PLANERING_SERVICE_ROLE_KEY:** (hämtas från Supabase Dashboard → Settings → API)
