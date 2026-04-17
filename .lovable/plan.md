
## Mål
Ta bort den missvisande badge "3" på sidomenyn ("Planera packning") och ersätt med en korrekt notifieringslogik som matchar Planning-sidans förändringsflöde — men anpassad för lager.

## Problem
Badge "3" visar idag antal `warehouse_project_inbox` med status `new`, vilket är otydligt. Användaren vet inte vad det betyder.

## Ny logik

Badgen ska visa **två typer av notiser**:

### 1. Nya projekt (oförändrat koncept, men endast nya)
- Rader i `warehouse_project_inbox` med status `new` (väntar på konvertering till lagerprojekt).

### 2. Förändringar i befintliga lagerprojekt
Spegla Planning-sidans `BookingChanges`-flöde (mem://features/booking/audit-trail-visual-policy) men filtrera så att **endast lager-relevanta ändringar** triggas:

- **Produktändringar** på källbokningen:
  - Produkt tillagd
  - Produkt borttagen
  - Antal ändrat
  - **Pris-ändringar IGNORERAS**
- **Datumändringar** på källbokningen:
  - `eventdate`, `rigdate`, `rigdowndate`, `loadingdate`, `unloadingdate`

## Implementation

### A) Ny tabell: `warehouse_project_changes`
```sql
CREATE TABLE warehouse_project_changes (
  id uuid PK,
  organization_id uuid,
  warehouse_project_id uuid FK,       -- vilket lagerprojekt påverkas
  source_booking_id uuid,             -- ursprungsbokning
  change_type text,                   -- 'product_added' | 'product_removed' | 'quantity_changed' | 'date_changed'
  field_name text,                    -- t.ex. 'eventdate' eller produkt-namn
  old_value text,
  new_value text,
  acknowledged boolean DEFAULT false,
  created_at timestamptz
);
```

### B) DB-triggers (filter för lager-relevans)
1. **`booking_products` AFTER INSERT/UPDATE/DELETE** → hitta alla `warehouse_projects` som har `source_project_id` länkad via `projects.booking_id` (eller via `large_projects`) och insertera rad i `warehouse_project_changes`. **Endast `quantity` och produkt själv — INTE `price`/`unit_price`-fält.**
2. **`bookings` AFTER UPDATE** → om `eventdate`/`rigdate`/`rigdowndate`/`loadingdate`/`unloadingdate` ändras → insertera rad per ändrat fält.

### C) Badge-logik (`SidebarNav` eller motsvarande)
Räkna:
```
count = COUNT(warehouse_project_inbox WHERE status='new')
      + COUNT(warehouse_project_changes WHERE acknowledged=false)
```

Hover/tooltip: "X nya projekt, Y ändringar"

### D) UI för förändringar
- I `WarehouseProjectInbox.tsx`: lägg till en sektion **"Ändringar"** under "Nya projekt" som listar oacknowledged changes per lagerprojekt med "Från → Till"-format (samma visuella policy som Planning).
- I `WarehouseProjectDetail.tsx`: ny flik **"Ändringar"** som visar projektets egna ändringar + "Markera som hanterad"-knapp (sätter `acknowledged=true`).

### E) Realtime
Aktivera Realtime på `warehouse_project_changes` så badgen uppdateras direkt.

## Filer

**Migration**: ny tabell `warehouse_project_changes` + 2 triggers + RLS + realtime publication.

**Nya filer**:
- `src/components/warehouse/WarehouseProjectChanges.tsx` (sektion för inkorgen)
- `src/components/warehouse/WarehouseProjectChangesTab.tsx` (flik i detaljvyn)
- `src/hooks/useWarehouseNotificationCount.ts` (räknar inbox + changes)

**Ändrade**:
- Sidomenyn (hitta filen som renderar "Planera packning" + badge "3") → använd nya hooken.
- `src/components/warehouse/WarehouseProjectInbox.tsx` → rendera även changes-sektionen.
- `src/pages/WarehouseProjectDetail.tsx` → ny flik.

## Frågor

1. **Acknowledge per ändring eller bulk per projekt?** Förslag: per ändring (mer granulärt, samma som Planning).
2. **Ska gamla "Nya bokningar"-inkorgen (`IncomingPackingInbox`) tas bort helt nu?** Den är fortfarande synlig men ersätts av detta flöde. Förslag: ta bort i denna iteration.
