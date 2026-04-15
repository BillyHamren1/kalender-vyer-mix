

## Plan: Lägg till "Transporter"-kolumn i både personal- och lagerkalendern

### Bakgrund
Transportplaneringar (`transport_assignments`) finns i databasen med datum, tid, fordon och bokningskoppling, men visas inte i kalendervyerna. Målet är att lägga till en dedikerad "Transporter"-kolumn i båda kalendrarna.

### Placering
- **Personalkalendern (Planning)**: "Transporter" placeras mellan Team 10 och "Live" (team-11)
- **Lagerkalendern (Warehouse)**: "Transporter" placeras mellan sista Lager-kolumnen och "Event"

### Tekniska steg

**1. Skapa hook `useTransportCalendarEvents`**
- Ny hook som hämtar `transport_assignments` för veckan med join på `vehicles` och `bookings` (klient, bokningsnummer)
- Prenumererar på Supabase Realtime för live-uppdateringar
- Returnerar data mappat till `CalendarEvent[]` med `resourceId: 'transport'`, `eventType: 'delivery'` (blå färg), och titeln som visar klient + fordon

**2. Lägg till "Transporter" som resurs i båda kalendrarna**
- **`useTeamResources.tsx`**: Lägg till `{ id: 'transport', title: 'Transporter', eventColor: '#3B82F6' }` före `team-11` i sorteringen
- **`useWarehouseResources.tsx`**: Lägg till `{ id: 'transport', title: 'Transporter', eventColor: '#3B82F6' }` före `warehouse-event` i sorteringen

**3. Integrera transport-events i kalendersidorna**
- **Personalkalendern (CalendarPage)**: Importera hooken, merga transport-events med befintliga events
- **Lagerkalendern (WarehouseCalendarPage)**: Samma approach, exkludera transport-events från `distributeWarehouseEvents`

**4. Visuell stil**
- Blå bakgrund (`#BFDBFE` / `bg-blue-100`) — matchar befintlig `delivery`-färg
- Visar: klientnamn, transport-tid, fordonsnamn
- Read-only i kalendern (klick navigerar till projektets transportflik)

**5. Skydda kolumnen**
- Lägg till `'transport'` i listan av kolumner som inte kan tas bort/döljas i båda kalendrarna

