

## Plan: Paginera hämtning från externa Booking-API:t

### Problem
`sync-reconciliation` gör ett enda anrop till `export_bookings` utan paginering. Om det externa API:t har en radgräns (t.ex. 100 eller 1000 bokningar) kommer inte alla bokningar att hämtas, vilket orsakar falska "saknas"-avvikelser.

Samma risk finns i `import-bookings` vid full-sync (ej single-booking).

### Lösning

**`supabase/functions/sync-reconciliation/index.ts`** — Paginerad hämtning:

```typescript
// Fetch ALL external bookings with pagination
let allExternalBookings: any[] = [];
let page = 1;
const pageSize = 500;

while (true) {
  const pageParams = new URLSearchParams(apiParams);
  pageParams.set('page', String(page));
  pageParams.set('limit', String(pageSize));
  
  const url = `https://wpzhsmrbjmxglowyoyky.supabase.co/functions/v1/export_bookings?${pageParams}`;
  const resp = await fetch(url, { headers: requestHeaders });
  if (!resp.ok) throw new Error(`External API error: ${resp.status}`);
  
  const payload = await resp.json();
  const batch = payload.data || [];
  allExternalBookings = allExternalBookings.concat(batch);
  
  // Stop if we got fewer than requested (last page)
  if (batch.length < pageSize) break;
  page++;
}
```

- Ersätter det nuvarande enskilda `fetch`-anropet (rad ~256-276)
- Använder `page` och `limit` query-parametrar
- Loopar tills en sida returnerar färre än `pageSize` poster
- Om API:t inte stöder `page`/`limit`, returnerar det allt på första sidan och loopen avslutas direkt — ingen regression

**Samma ändring görs i `import-bookings/index.ts`** för full-sync-läget (ej single-booking eller incremental).

### Lokala Supabase-frågor

Dessa är redan under 196 rader idag, men för framtidssäkring: lägg till `.range()`-paginering på de tre lokala frågorna (bookings, booking_products, booking_attachments) med en `fetchAll`-helper.

### Deploy

Deploya `sync-reconciliation` efter ändringarna.

### Resultat
- Alla bokningar från Booking-systemet hämtas oavsett antal
- Inga falska "saknas"-avvikelser p.g.a. trunkerad data
- Bakåtkompatibelt — om API:t ignorerar `page`/`limit` fungerar det som idag
