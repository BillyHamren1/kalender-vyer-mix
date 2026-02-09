
# Fix: Svarsidan visar rå HTML istället för renderad sida

## Problem
När en transportpartner klickar "Acceptera" eller "Neka" i mejlet visas rå HTML-källkod istället för en snygg renderad sida. Svenska tecken (ö, ä, å) visas dessutom som skräptecken (t.ex. "KÃ¶rning" istället för "Körning").

## Orsak
Edge-funktionen `handle-transport-response` skapar headers med `new Headers()` och `.set()`, men alla andra edge-funktioner i projektet skickar headers som vanliga JavaScript-objekt. Supabase Edge Functions-proxyn verkar inte korrekt vidarebefordra `Content-Type: text/html` när den sätts via `Headers`-API:et, vilket gör att webbläsaren tolkar svaret som ren text.

## Lösning
Ändra `htmlResponse`-funktionen så att den använder samma headermönster som alla andra edge-funktioner i projektet — ett vanligt objekt istället för `new Headers()`.

## Tekniska detaljer

### Fil: `supabase/functions/handle-transport-response/index.ts`

Nuvarande (problematisk) kod:
```typescript
function htmlResponse(body: string, status = 200): Response {
  const headers = new Headers();
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(body, { status, headers });
}
```

Ny (fixad) kod:
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

Ändringarna:
- Byter från `new Headers()` till ett vanligt JavaScript-objekt (samma mönster som alla andra edge-funktioner)
- Tar bort `X-Content-Type-Options: nosniff` som kan orsaka problem om proxyn ändrar content-type
- Säkerställer att `charset=utf-8` skickas korrekt så svenska tecken visas rätt
