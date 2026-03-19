

# Plan: Lägg till detaljerad loggning för allocate-instance-anropet

## Vad som görs

I `supabase/functions/scanner-api/index.ts`, lägg till console.log-satser runt det utgående anropet till `allocate-instance` så att exakt request och response loggas i Supabase Edge Function Logs.

### Fil: `supabase/functions/scanner-api/index.ts`

**Före fetch-anropet** — logga request-detaljer:
```typescript
console.log('[allocate-instance] Request:', {
  url: 'https://pnvvnvywphfvmwdmqqzs.supabase.co/functions/v1/allocate-instance',
  serial_number: serialNumber,
  reservation_id: packing.booking_id,
  hasApiKey: !!PRICELIST_API_KEY,
  orgId: ORG_ID,
})
```

**Efter fetch-anropet** — logga response-status och body (oavsett om det lyckas eller misslyckas):
```typescript
const responseText = await allocateResponse.text()
console.log('[allocate-instance] Response:', {
  status: allocateResponse.status,
  statusText: allocateResponse.statusText,
  body: responseText,
})
```

Sedan parsa `responseText` som JSON istället för att anropa `.json()` direkt på response (som redan konsumerats).

### Resultat
Efter deploy kan ni skanna en produkt och sedan kolla loggarna under Edge Functions → scanner-api → Logs i Supabase-dashboarden. Där syns exakt statuskod och svarskropp från lagersystemet.

## Filer som ändras
1. `supabase/functions/scanner-api/index.ts` — Loggning före och efter allocate-instance fetch

