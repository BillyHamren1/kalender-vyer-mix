

## Fix: Svarsidan visar ra HTML istallet for renderad sida

### Problemet
Nar transportpartnern klickar pa "Acceptera korning" eller "Neka korning" i mejlet visas ratt HTML-kod som klartext istallet for en snygg bekraftelsesida. Svenska tecken (o, a, a) visas ocksa felaktigt (t.ex. "KA¶rning" istallet for "Korning").

Orsaken ar att webblaasaren inte tolkar svaret som HTML. Content-Type-headern maste sakerstaallas korrekt och det kan finnas en extra wrapping av svaret fran edge function-ramverket.

### Losning
Uppdatera `supabase/functions/handle-transport-response/index.ts` med foljande andringar:

1. **Anvand `Headers`-objekt explicit** istallet for vanligt objekt for att sakerstalla att Content-Type skickas korrekt
2. **Lagg till CORS-headers** -- edge function-plattformen kan krava dessa for att inte wrappa svaret
3. **Dubbelkolla att alla svar returnerar `text/html; charset=utf-8`** konsekvent
4. **Hantera OPTIONS-anrop** som en sakerhetsmekanism

### Tekniska detaljer

**Fil: `supabase/functions/handle-transport-response/index.ts`**

- Lagg till en `htmlHeaders`-funktion som returnerar korrekta headers med bade Content-Type och CORS:
```typescript
function htmlHeaders(): Headers {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
}
```
- Uppdatera alla `new Response(...)` att anvanda `htmlHeaders()` istallet for inline-objekt
- Lagg till OPTIONS-hantering i borjan av serve-funktionen
- Anvand `TextEncoder` for att sakerstalla UTF-8-kodning av svarskroppen (om plattformen inte gor det automatiskt)

Ingen annan fil behovs andras -- problemet ligger helt i edge-funktionens svar-headers.
