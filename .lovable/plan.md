

## Problem

Bokningar som finns i Booking-systemet (med status CANCELLED, DRAFT, OFFER, eller till och med CONFIRMED) flaggas felaktigt som "Bokning saknas i bokningssystemet". Orsaken är att det externa API:t (`export_bookings`) inte returnerar alla bokningar — troligen filtrerar det bort avbokade, utkast, eller offerter. Reconciliation-logiken tolkar då avsaknaden som att bokningen inte finns.

97 av 100 avvikelser är metadata-avvikelser, och en stor del av dessa är sannolikt falska "saknas"-flaggningar.

## Lösning

### 1. Backend: `supabase/functions/sync-reconciliation/index.ts`

**Ändra logiken för "missing external"-kontrollen (rad 562-578):**
- Om en lokal bokning inte hittas i det externa svaret, kontrollera dess lokala status innan den flaggas.
- **CANCELLED-bokningar**: Hoppa över helt — de ska inte flaggas som avvikelse. En avbokad bokning som inte returneras av API:t är förväntat beteende.
- **DRAFT/OFFER-bokningar**: Hoppa över, eller visa som informationsrad (inte som avvikelse) — dessa kanske inte exporteras av Booking-systemet.
- **CONFIRMED-bokningar**: Behåll flaggningen — om en bekräftad bokning saknas i exportdatan är det en verklig avvikelse.

**Konkret kodändring:**
```typescript
for (const [id, local] of localBookingMap) {
  if (!externalIds.has(id)) {
    const rigDate = local.rigdaydate || local.eventdate;
    if (rigDate && rigDate < cutoffDate) continue;
    
    // Skip non-confirmed bookings — the external API may not export them
    const localStatus = normalizeStatus(local.status);
    if (localStatus === 'CANCELLED' || localStatus === 'OFFER' || localStatus === 'DRAFT') continue;
    
    discrepancies.push({
      bookingId: id,
      bookingNumber: local.booking_number,
      client: local.client,
      bookingStatus: localStatus || 'UNKNOWN',
      field: '_missing_external', category: 'metadata',
      localValue: 'exists', externalValue: null,
      label: 'Bokning saknas i bokningssystemet'
    });
  }
}
```

### 2. Deploy

Deploya `sync-reconciliation` edge function.

### Resultat
- CANCELLED, OFFER och DRAFT-bokningar som inte finns i exportdatan ignoreras (inte flaggas)
- Bara CONFIRMED-bokningar som saknas i exportdatan flaggas som verkliga avvikelser
- Antalet falska avvikelser minskar drastiskt

