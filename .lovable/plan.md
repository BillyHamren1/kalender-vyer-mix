

# Optimera laddningstiden för Ekonomiöversikten

## Problemet

Ekonomiöversikten laddar extremt långsamt eftersom varje projekt triggar **7 separata Edge Function-anrop** till `planning-api-proxy`. Med 5 projekt blir det **35 nätverksanrop** som alla ska gå via edge functions till det externa EventFlow-systemet. Edge function-loggarna visar 30+ boot-events inom samma sekund.

```text
Per projekt (7 anrop):
  1. budget
  2. time_reports
  3. purchases
  4. quotes
  5. invoices
  6. product_costs
  7. supplier_invoices

5 projekt x 7 anrop = 35 edge function-anrop
```

## Lösning: Batch-endpoint i planning-api-proxy

Skapa en ny `type: 'batch'` i edge function som hämtar alla 7 datatyper för en bokning i **ett enda anrop**. Sedan behövs bara 5 anrop istället för 35 (ett per projekt).

### Steg 1: Utöka `planning-api-proxy` edge function

Lägg till en `batch`-typ som gör alla 7 anrop till det externa API:t i en enda edge function-invokering och returnerar allt samlat.

**Fil:** `supabase/functions/planning-api-proxy/index.ts`

- Ny case `type === 'batch'` som internt anropar alla 7 endpoints mot det externa API:t med `Promise.all`
- Returnerar ett objekt: `{ budget, time_reports, purchases, quotes, invoices, product_costs, supplier_invoices }`

### Steg 2: Ny service-funktion

**Fil:** `src/services/planningApiService.ts`

- Ny export `fetchAllEconomyData(bookingId)` som anropar `planning-api-proxy` med `type: 'batch'`
- Returnerar alla 7 datamängder i ett objekt

### Steg 3: Uppdatera overview-hooken

**Fil:** `src/hooks/useEconomyOverviewData.ts`

- Byt ut `fetchProjectEconomyFromProxy` (7 anrop) mot ett enda `fetchAllEconomyData`-anrop
- Samma mapping-logik, bara en annan datakälla

## Resultat

| Före | Efter |
|------|-------|
| 35 edge function-anrop | 5 edge function-anrop |
| 35 edge function boot-ups | 5 edge function boot-ups |
| Laddtid: 5-15 sekunder | Laddtid: 1-3 sekunder |

## Tekniska detaljer

### Ny batch-hantering i edge function (pseudokod)

```typescript
if (type === 'batch') {
  const [budget, time_reports, purchases, quotes, invoices, product_costs, supplier_invoices] =
    await Promise.all([
      fetchFromExternal('budget', booking_id),
      fetchFromExternal('time_reports', booking_id),
      fetchFromExternal('purchases', booking_id),
      fetchFromExternal('quotes', booking_id),
      fetchFromExternal('invoices', booking_id),
      fetchFromExternal('product_costs', booking_id),
      fetchFromExternal('supplier_invoices', booking_id),
    ]);
  return { budget, time_reports, purchases, quotes, invoices, product_costs, supplier_invoices };
}
```

### Filer som ändras

1. `supabase/functions/planning-api-proxy/index.ts` -- ny batch-typ
2. `src/services/planningApiService.ts` -- ny `fetchAllEconomyData()`
3. `src/hooks/useEconomyOverviewData.ts` -- använd batch istället för 7 enskilda anrop

