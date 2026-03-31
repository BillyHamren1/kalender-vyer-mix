

## Problem

`DesktopChecklistView.tsx` (webbens packlistevy) importerar funktioner från `scannerService.ts`, som routar allt genom `scanner-api` edge function med en scanner-inloggningstoken. När scannern inte är inloggad, eller dess token löper ut, kraschar hela webbvyn -- trots att användaren är inloggad i webbappen.

## Lösning

Skapa en ny service-fil `src/services/desktopPackingService.ts` som gör samma saker som scannerService men via **direkta Supabase-queries** (precis som `usePackingList.tsx` redan gör). Sedan uppdatera `DesktopChecklistView.tsx` att importera därifrån istället.

### Filer

**1. Ny: `src/services/desktopPackingService.ts`**

Implementerar med direkta Supabase-anrop:
- `fetchPackingForDesktop(id)` -- hämta packing + booking via supabase
- `fetchPackingListItemsForDesktop(packingId)` -- hämta items med booking_products join
- `togglePackingItemDesktop(itemId, currentlyPacked, quantityToPack, verifiedBy)` -- uppdatera quantity_packed +1/-1
- `decrementPackingItemDesktop(itemId)` -- minska quantity_packed med 1
- `createParcelDesktop(packingId, createdBy)` -- insert i packing_parcels
- `assignItemToParcelDesktop(itemId, parcelId)` -- uppdatera packing_list_items.parcel_id
- `getItemParcelsDesktop(packingId)` -- hämta parcel-mapping
- `signPackingDesktop(packingId, signedBy)` -- uppdatera signed_by/signed_at

Alla queries använder `supabase` klienten med RLS (autentiserad webb-session).

**2. Ändra: `src/components/packing/DesktopChecklistView.tsx`**

Byt import från `@/services/scannerService` till `@/services/desktopPackingService`.

### Teknisk detalj

Sorterings-logiken för items (parent/child-ordning) kopieras från `scannerService.sortPackingItems` in i den nya filen, alternativt extraheras till en delad utility.

