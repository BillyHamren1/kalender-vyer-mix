

# Fix: Tacksidan visas som ra HTML-kallkod

## Problem
Nar en partner klickar pa acceptera/neka-lanken i mejlet, visas tacksidans HTML som **ratt kallkod** i webblasaren istallet for en renderad sida. Trots att `Content-Type: text/html; charset=utf-8` satts i koden, verkar Supabase Edge Functions-infrastrukturen strippas eller skriva over den headern.

## Orsak
Supabase Edge Functions kan ibland hantera `Response`-objekt annorlunda an forvantant. Headerformattering, hur `new Response()` byggs, eller att `charset` inte tolkas korrekt kan gora att webblasoaren faller tillbaka till `text/plain`.

## Losning
Tva sakerhetsatgarder for att garantera att HTML renderas korrekt:

1. **Anvand `Response` med explicit `Headers`-objekt** istallet for ett vanligt objekt -- detta tvingar Deno att respektera headrarna korrekt
2. **Lagg till en meta http-equiv header** i HTML:en som en extra saker fallback sa att webblasaren tvingas tolka det som HTML aven om Content-Type-headern strippas

## Tekniska detaljer

### Fil: `supabase/functions/handle-transport-response/index.ts`

**1. Andra `htmlResponse`-funktionen:**

Nuvarande kod:
```typescript
function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
```

Ny kod:
```typescript
function htmlResponse(body: string, status = 200): Response {
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(body, { status, headers });
}
```

Skillnaden ar att vi anvander `new Headers()` som ar det formella Web API-sattet att skapa headers, vilket minskar risken for att de strippas. `X-Content-Type-Options: nosniff` forhindrar ocksa att webblasaren "sniffar" innehallet och bestammer en annan content-type.

**2. Lagg till `<meta http-equiv>` i `buildThankYouPage` och `buildErrorPage`:**

Lagga till denna rad i `<head>` pa bada sidor:
```html
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
```

Detta ar en extra fallback som instruerar webblasaren att tolka innehallet som HTML, aven om HTTP-headern inte nar fram korrekt.

### Filer som andras
- `supabase/functions/handle-transport-response/index.ts`

### Edge Functions att deploya
- `handle-transport-response`
