

## Transportwidget i projektvyn + komplett historikspårning

### Vad ska göras

**1. Byt ut den nuvarande transportsektionen i projektvyn mot samma 3-kolumns-widget som logistikvyn använder**

Just nu visar "Transport"-fliken i projektet en enklare lista med collapsible-kort (`ProjectTransportSection`). Den ska ersättas med samma widget som finns i `/logistics/planning` — den med tre kolumner: "Åtgärd krävs", "Väntar svar" och "Bekräftat", med färgkodade kort (röda, gula, gröna).

**2. Skapa en projektanpassad version av transport-widgeten**

Widgeten i logistikvyn (`LogisticsTransportWidget`) visar ALLA transporter med datumfilter. I projektvyn behövs bara transporterna kopplade till just det projektets bokning. En ny komponent `ProjectTransportWidget` skapas som:
- Använder `useProjectTransport(bookingId)` för att hämta data (filtrerat på boknings-ID)
- Visar samma 3-kolumns-layout med samma `TransportCard`-komponent
- Tar bort datumväljaren (irrelevant i projektkontext — alla transporter för bokningen visas)
- Behåller mejlhistorik och partnersvars-timeline från nuvarande `ProjectTransportSection`

**3. Utöka aktivitetsloggen med transportändringar och bokningsändringar**

Alla förändringar ska loggas automatiskt i `project_activity_log` så att man kan följa hela flödet:
- Transportbokning skapad/uppdaterad/borttagen
- Partnersvar (accepterad/nekad)
- Mejl skickat till partner
- Bokningsändringar (datum, adress, status etc.)

Detta görs genom att lyssna på realtidsändringar i `useProjectDetail`-hooken och automatiskt logga dem.

**4. Lägg till transport + historik i stora projekt (LargeProjectViewPage)**

Stora projekt saknar idag både "Transport"- och "Historik"-flikar. Dessa läggs till.

### Tekniska ändringar

**Nya filer:**
- `src/components/project/ProjectTransportWidget.tsx` — ny komponent som återanvänder `TransportCard` från `LogisticsTransportWidget` men filtrerar på bokningens transport-assignments. Visar 3 kolumner med samma färgkodning. Inkluderar mejlhistorik-sektion.

**Ändrade filer:**

1. **`src/components/logistics/widgets/LogisticsTransportWidget.tsx`**
   - Exportera `TransportCard` som named export så den kan återanvändas i projektvyn

2. **`src/pages/project/ProjectViewPage.tsx`**
   - Byt `ProjectTransportSection` mot `ProjectTransportWidget`
   - Skicka `bookingId` som prop

3. **`src/pages/project/LargeProjectViewPage.tsx`**
   - Lägg till "Transport"- och "Historik"-flikar
   - Aggregera transport-data från alla kopplade bokningar

4. **`src/hooks/useProjectDetail.tsx`**
   - Lägg till realtids-prenumeration på `transport_assignments` och `transport_email_log` för projektets bokning
   - Logga transport-relaterade ändringar automatiskt till `project_activity_log`:
     - `transport_added`: "Transport bokad: [fordonsnamn] [datum]"
     - `transport_updated`: "Transport uppdaterad: [fordonsnamn]"
     - `transport_response`: "Partnersvar: Accepterad/Nekad — [fordonsnamn]"
     - `email_sent`: "Mejl skickat till [partner] angående transport"

5. **`src/components/project/ProjectActivityLog.tsx`**
   - Lägg till ikoner och filter för de nya transport-aktivitetstyperna (Truck-ikon, "Transport"-filter)

### Resultat
- Projektvyn visar samma visuella transport-widget som logistikvyn (3 kolumner, färgade kort)
- Alla ändringar — status, uppgifter, filer, kommentarer, transport, bokningsändringar — loggas i historikfliken
- Man kan följa hela projektets flöde från start till slut på ett ställe

