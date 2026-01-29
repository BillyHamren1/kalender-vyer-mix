

# Plan: Lägg till extern kalender-notifiering vid statusändringar

## Sammanfattning
När en bokning ändrar status (särskilt från CONFIRMED till annat) ska en notifiering skickas till det externa kalendersystemet så att deras planeringsvy också uppdateras.

## Bakgrund
För närvarande när status ändras i din app:
- Lokala calendar_events uppdateras/raderas korrekt
- Warehouse calendar uppdateras
- booking_changes loggas i databasen
- **MEN** det externa systemet får ingen information om ändringen

## Lösning

### Steg 1: Skapa en ny Edge Function för att skicka statusändringar
Skapa `notify-booking-status` edge function som anropar det externa systemets API när status ändras.

```text
supabase/functions/notify-booking-status/index.ts
```

Funktionen kommer:
- Ta emot booking_id, old_status, new_status
- Anropa externa API:et med uppdateringsdata
- Logga resultatet för felsökning

### Steg 2: Konfigurera extern callback-URL
Behöver en hemlig nyckel för det externa systemets callback-endpoint:
- **EXTERNAL_CALENDAR_CALLBACK_URL**: URL till det externa kalendersystemets uppdateringsendpoint
- Alternativt kan vi använda befintlig `IMPORT_API_KEY` om samma system

### Steg 3: Integrera med statusändringsflödet
Uppdatera `bookingStatusService.ts` för att anropa edge function efter lokal uppdatering:

```text
src/services/booking/bookingStatusService.ts
```

Lägg till anrop till `notify-booking-status` edge function efter att lokal kalendersynk är klar.

### Steg 4: Felhantering och loggning
- Om extern notifiering misslyckas, visa varning men låt inte det blockera lokal funktionalitet
- Logga alla försök i console för felsökning
- Möjlighet att retry vid nätverksfel

## Tekniska detaljer

### Edge Function: notify-booking-status
```typescript
// Pseudo-kod
serve(async (req) => {
  const { booking_id, old_status, new_status, booking_data } = await req.json();
  
  // Anropa extern API
  const response = await fetch(EXTERNAL_CALLBACK_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'status_changed',
      booking_id,
      old_status,
      new_status,
      timestamp: new Date().toISOString()
    })
  });
  
  return new Response(JSON.stringify({ success: response.ok }));
});
```

### Integration i StatusChangeForm
Efter lyckad lokal uppdatering:
```typescript
// Notifiera externt system
await supabase.functions.invoke('notify-booking-status', {
  body: { booking_id, old_status, new_status }
});
```

## Fråga till dig

**Innan jag implementerar detta behöver jag veta:**

1. **Har det externa systemet (wpzhsmrbjmxglowyoyky) en callback-endpoint?**
   - Om ja: Vilken URL och vilket format förväntar de sig?
   - Om nej: Ska vi skapa en på deras sida också?

2. **Ska notifieringen innehålla full bokningsdata eller bara status och ID?**

3. **Vilka statusändringar ska trigga notifiering?**
   - Alla statusändringar?
   - Bara CONFIRMED ↔ CANCELLED?
   - Bara ändringar som påverkar kalendern?

