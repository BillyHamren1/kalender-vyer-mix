

## Problem

Inkorgen "Projekt utan packning" (`IncomingPackingList`) visas BARA pa sidan `/warehouse/packing`. Warehouse Dashboard (`/warehouse`) och Warehouse Calendar (`/warehouse/calendar`) har ingen indikation pa att nya projekt väntar. Användaren ser ingenting efter att ett projekt skapats.

## Lösning: Visa inkorgen pa fler ställen + notifikation i sidomenyn

### 1. Lägg till `IncomingPackingList` pa Warehouse Dashboard
- Importera och rendera komponenten högst upp i `WarehouseDashboard.tsx`, precis som den redan visas i `PackingManagement.tsx`
- Samma komponent, ingen duplicering av logik

### 2. Notifikations-badge i sidomenyn
- Uppdatera `WarehouseSidebar3D.tsx` 
- Lägg till en query som räknar antal bokningar utan packning (samma logik som IncomingPackingList, men bara `count`)
- Visa en liten röd/amber badge med antalet bredvid "Planera packning" i navigeringen
- Sa ser användaren direkt oavsett vilken warehouse-sida de är pa att det finns projekt att hantera

### 3. Valfritt: Snabb-banner pa kalendersidan
- Lägg till en enkel informationsbanner högst upp pa `WarehouseCalendarPage.tsx` om det finns väntande projekt, typ: "3 projekt väntar pa packning" med en länk till `/warehouse/packing`
- Enklare än att rendera hela inkorgen, passar kalenderns UI bättre

### Filer att ändra
- `src/pages/WarehouseDashboard.tsx` -- importera och rendera `IncomingPackingList`
- `src/components/WarehouseSidebar3D.tsx` -- lägga till count-query och badge
- `src/pages/WarehouseCalendarPage.tsx` -- liten notifikationsbanner

