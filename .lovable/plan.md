

## Problem

Swedish Game Fair har 26 bokningar och 278 produkter men **0 artiklar i packlistan** (`packing_list_items`). DesktopChecklistView (fliken "Packlista") visar bara "Inga produkter" eftersom den inte triggar synkronisering -- bara `usePackingList`-hooken gör det, och den körs bara i den oanvända `PackingListTab`.

Användaren behöver ett helt nytt arbetsflöde för stora projekt:

1. **Översikt av alla bokningar** direkt på packningssidan
2. **Bryta ut enskilda bokningar** till separata packlistor
3. **Skapa EN samlad packlista** av kvarvarande bokningar med tydliga sektioner per bokning
4. **Välja bort produkter** från packlistan (alla packningar)
5. **Lägga till artiklar från inventarie-API:t** från packningsvyn
6. **Skapa manuella packningsrader**

---

## Plan

### 1. Ny "Bokningsöversikt" som startsida för stora projekt

Ersätt den nuvarande vyn med en **översiktspanel** som visas när `large_project_id` finns. Visar alla 26 bokningar i en lista med:
- Kund, bokningsnummer, datum, antal produkter
- Kryssruta för att välja bokningar
- **"Bryt ut"**-knapp: skapar en separat packlista för valda bokningar och tar bort dem från den samlade
- **"Generera packlista"**-knapp: triggar synk av `packing_list_items` för alla kvarvarande bokningar

**Ny komponent**: `PackingProjectOverview.tsx`
**Ändring**: `PackingDetail.tsx` -- visa översikten som default-vy för stora projekt

### 2. Splitta enskilda bokningar (förbättra befintlig split)

Nuvarande `handleSplitPacking` splittar ALLA bokningar. Refaktorera till att stödja **selektiv utbrytning**:
- Ta bort valda bokningar från `packing_project_bookings`
- Skapa nya individuella packlistor för dem
- Behåll den samlade packlistan med resterande bokningar
- Uppdatera `booking_id` om bara en bokning kvarstår

### 3. DesktopChecklistView: synka items + gruppera per bokning

- Vid laddning: kör `fullSyncMultiBooking` (från `usePackingList`) om inga items finns
- Gruppera produktlistan per bokning med collapsible-sektioner (liknande `BookingSection` i `PackingListTab`)
- Visa bokningsnamn/nummer som rubrik per sektion

### 4. Exkludera produkter från packlistan

**Databasändring**: Lägg till kolumn `excluded boolean DEFAULT false` på `packing_list_items`.

- I DesktopChecklistView: lägg till "X"-knapp eller swipe-to-exclude per rad
- Exkluderade produkter döljs från huvudlistan men visas i en hopfällbar "Exkluderade"-sektion
- Exkluderade räknas inte i progress

### 5. Manuella packningsrader

**Databasändring**: Gör `booking_product_id` nullable på `packing_list_items`. Lägg till kolumn `manual_name text`.

- I DesktopChecklistView: "Lägg till rad"-knapp som öppnar ett formulär med namn + antal
- Manuella rader visas i en egen sektion "Manuellt tillagda"
- Fungerar med +/- och kolli precis som vanliga rader

### 6. Lägg till artiklar från inventarie-API

- I DesktopChecklistView: "Lägg till från lager"-knapp
- Sökfält som söker i inventarie-API:t (befintlig pricelist-integration)
- Välj artikel → skapar en manuell packningsrad med namn/SKU från API:t

---

### Filer som ändras/skapas

| Fil | Ändring |
|-----|---------|
| `src/components/packing/PackingProjectOverview.tsx` | **NY** -- bokningsöversikt för stora projekt |
| `src/pages/PackingDetail.tsx` | Visa översikt som standard-flik, selektiv split |
| `src/components/packing/DesktopChecklistView.tsx` | Synk vid laddning, bokningssektioner, exkludera/manuella rader, lägg till från lager |
| `src/services/desktopPackingService.ts` | Nya funktioner: syncMultiBooking, excludeItem, addManualRow, searchInventory |
| `src/hooks/usePackingList.tsx` | Exportera `fullSyncMultiBooking` för återanvändning |
| `src/types/packing.ts` | Uppdatera `PackingListItem` med `excluded`, `manual_name` |
| **Migration** | `excluded` kolumn, `booking_product_id` nullable, `manual_name` kolumn |

### Prioritetsordning
1. Bokningsöversikt + selektiv utbrytning (kritiskt för kontroll)
2. Synk + bokningssektioner i DesktopChecklistView (löser "Inga produkter")
3. Exkludera produkter
4. Manuella rader + inventarie-API-sökning

