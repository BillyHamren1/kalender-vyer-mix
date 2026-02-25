

# Plan: Synka utlägg till EventFlow booking-modul

## Bakgrund
Utlägg skapas i mobilappen och sparas lokalt i `project_purchases` -- detta ska fortsätta som idag. Därutöver ska utlägget OCKSÅ synkas till den externa EventFlow booking-modulen via `planning-api`.

## Ändring

**Fil: `supabase/functions/mobile-app-api/index.ts`** -- funktionen `handleCreatePurchase`

Efter rad 608 (efter att utlägget sparats lokalt och loggats), lägg till ett fire-and-forget-anrop till EventFlow:s `planning-api` via direktanrop (samma mönster som `planning-api-proxy` använder):

```typescript
// Sync purchase to EventFlow booking module
try {
  const efUrl = Deno.env.get('EF_SUPABASE_URL');
  const planningApiKey = Deno.env.get('PLANNING_API_KEY');

  if (efUrl && planningApiKey) {
    const qs = new URLSearchParams({ type: 'purchases', booking_id });
    await fetch(`${efUrl}/functions/v1/planning-api?${qs.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': planningApiKey,
      },
      body: JSON.stringify({
        description,
        amount: parseFloat(amount),
        supplier: supplier || null,
        category: category || 'other',
        receipt_url: receiptUrl,
        purchase_date: new Date().toISOString().split('T')[0],
        created_by: staffMember?.name || 'Mobile App',
      }),
    });
    console.log('Purchase synced to EventFlow for booking', booking_id);
  }
} catch (syncErr) {
  console.error('EventFlow sync failed (purchase saved locally):', syncErr);
}
```

## Viktiga detaljer
- Lokalt sparande i `project_purchases` ändras INTE -- det fungerar exakt som idag
- Synken sker efter att lokalt sparande lyckats, som ett extra steg
- Om synken misslyckas loggas felet men utlägget är redan sparat lokalt -- ingen data förloras
- Secrets `EF_SUPABASE_URL` och `PLANNING_API_KEY` finns redan konfigurerade
- Kvittobildens publika URL (`receipt_url`) skickas med så att bilden är tillgänglig i EventFlow
- Ingen databasändring krävs

