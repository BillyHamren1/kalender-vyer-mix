

## Problem
Alla SSO-inloggningar från Hub:en misslyckas med "Signature mismatch" i edge-funktionen `verify-sso-token`. Inget annat har andrats - signaturfelet intraffer INNAN den kod som andrades i forra fixan (steg 4-5). Trolig orsak: antingen har SSO_SECRET i Supabase inte samma varde som Hub:en anvander, eller sa skiljer sig payload-formatet (t.ex. faltordning i JSON.stringify).

## Losning
Lagg till detaljerad diagnostisk loggning i signaturverifieringen for att identifiera exakt vad som skiljer sig. Logga:
- Payload-strangen som signeras
- De forsta tecknen av forvantad vs mottagen signatur
- Det hjalper oss se om det ar en nyckel-mismatch eller format-mismatch

## Paverkade filer

### `supabase/functions/verify-sso-token/index.ts`

**Andring 1: Utokad diagnostisk loggning i `verifySignature`-funktionen**
- Logga de forsta 16 tecknen av bade forvantad (beraknad) och mottagen signatur
- Logga langden pa payload-strangen

**Andring 2: Logga payload-strangen fore signaturverifiering**
- Logga `payloadString` (den faktiska strangen som hashas) for att kunna jamfora med Hub:ens signerade data
- Logga signaturen som mottas fran klienten

Dessa loggar ar tillfalliga for felsokningsandamal och bor tas bort nar problemet ar lost.

## Tekniska detaljer

Ny diagnostisk logging i `verifySignature`:
```text
async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  // ... existing HMAC code ...

  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // DIAGNOSTIK: Logga for att identifiera mismatch-orsak
  console.log('[SSO-DEBUG] Payload length:', payload.length);
  console.log('[SSO-DEBUG] Payload string:', payload);
  console.log('[SSO-DEBUG] Expected sig (first 16):', expectedHex.substring(0, 16));
  console.log('[SSO-DEBUG] Received sig (first 16):', signature.toLowerCase().substring(0, 16));
  console.log('[SSO-DEBUG] Signatures match:', expectedHex === signature.toLowerCase());

  return expectedHex === signature.toLowerCase();
}
```

Fore signaturverifiering (rad ~103):
```text
console.log('[SSO-DEBUG] payloadForSignature keys:', Object.keys(payloadForSignature));
console.log('[SSO-DEBUG] payloadString:', payloadString);
console.log('[SSO-DEBUG] received signature:', signature);
```

## Nasta steg
1. Deploya den uppdaterade edge-funktionen
2. Be anvandaren att forsoka logga in via Hub:en igen
3. Lasa loggarna for att se exakt var mismatchen ligger
4. Baserat pa resultatet - antingen korrigera SSO_SECRET eller justera payload-formatet

