

## Avbokningsmail till transportpartner

### Vad som ska goeras
Naer en transport avbokas som aer tilldelad en extern partner ska ett avbokningmejl automatiskt skickas till partnern. Mejlet informerar att transporten aer avbokad och loggas i historiken.

### Oeversikt av floede

1. Anvaendaren klickar "Avboka transport" och bekraeftar i dialogen
2. Systemet kontrollerar om det aer en extern partner (med mejladress)
3. Om ja: skickar ett avbokningsmail via en ny edge function
4. Mejlet loggas i `transport_email_log` med typen `transport_cancellation`
5. Tilldelningen tas bort fran databasen

### Aendringar

**1. Ny Edge Function: `supabase/functions/send-transport-cancellation/index.ts`**

- Tar emot `assignment_id` som parameter
- Haemtar assignment med bokning och fordon/partner-data fran databasen
- Bygger ett HTML-mejl med avbokningsinformation:
  - Tydlig rubrik: "Transport avbokad"
  - Referensnummer (bokningsnummer)
  - Kund, leveransadress, datum och tid
  - Valfritt meddelande fran avsaendaren
- Skickar mejlet via Resend till partnerns kontaktmejl
- Loggar utskicket i `transport_email_log` med `email_type: "transport_cancellation"`

**2. Uppdatering: `supabase/config.toml`**

- Laegg till `[functions.send-transport-cancellation]` med `verify_jwt = false`

**3. Uppdatering: `src/components/logistics/TransportBookingTab.tsx`**

- Utoka `cancellingAssignment`-state med `is_external` och `vehicle_id`
- I `handleOpenCancelDialog`: skicka med `is_external` och `vehicle_id` fran assignment-datan
- I `handleConfirmCancel`:
  - Foere `removeAssignment` anropas: om `cancellingAssignment.is_external`, anropa `supabase.functions.invoke('send-transport-cancellation', { body: { assignment_id } })`
  - Visa laemplig feedback (toast) beroende pa om mejlet lyckades eller inte
  - Oavsett mejlresultat: fortsaett med att ta bort tilldelningen

### Tekniska detaljer

**Edge Function - Mejlinnehall:**
- Roett/orange faergschema foer att tydligt skilja fran vanliga foerfragningar (som aer groen/teal)
- Samma layout och stil som `send-transport-request` foer konsistens
- Inga acceptera/neka-knappar -- bara information
- Texten gor klart att transporten aer avbokad och att partnern kan ignorera tidigare foerfragningar

**Avbokningslogik i frontend:**
```
handleConfirmCancel:
  1. Om is_external -> invoke 'send-transport-cancellation'
  2. removeAssignment(id)
  3. Toast: "Transport avbokad" (+ "och partner notifierad" om extern)
  4. refetch()
```

**Email-logg:**
Loggas med `email_type: "transport_cancellation"` saa att det syns i projektets transporthistorik.

