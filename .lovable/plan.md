

## Spara adress som favorit

### Vad som ska byggas
En "Spara som favorit"-funktion for adressfaltet (Upphamtningsplats) i transportbokningsguiden. Sparade favoriter visas direkt under adressfaltet som klickbara knappar for snabbval.

### Anvandargranssnittet

Under adressinmatningen (AddressAutocomplete) visas:
1. En "Spara som favorit"-knapp (stjarn-ikon) -- synlig nar en geocodad adress ar ifylld
2. En lista med sparade favoritadresser som klickbara chips/knappar
3. Varje favorit har en liten X-knapp for att kunna ta bort den

```text
+--------------------------------------------+
| Upphamtningsplats *                        |
| [David Adrians Vag, 194 91 Upplands... v ] |
| Standard: David Adrians vag 1    v 59,17   |
|                                            |
| [star] Spara som favorit                   |
|                                            |
| Favoriter:                                 |
| [David Adrians Vag 1 x] [Lagret Solna x]  |
+--------------------------------------------+
```

### Teknisk plan

**1. Ny komponent: `src/components/logistics/AddressFavorites.tsx`**

Ansvarar for att visa och hantera favoriter:
- Props: `onSelect(address, lat, lng)`, `currentAddress`, `currentLat`, `currentLng`
- Laddning/sparande av favoriter fran `localStorage` (nyckel: `transport-address-favorites`)
- Datastruktur per favorit:
  ```typescript
  interface AddressFavorite {
    id: string;          // crypto.randomUUID()
    label: string;       // Kort visningsnamn (t.ex. "David Adrians Vag 1")
    fullAddress: string; // Fullstandig adress
    latitude?: number;
    longitude?: number;
  }
  ```
- "Spara som favorit"-knapp: visas nar det finns en giltig adress, klick oppnar en liten inline-input for att valja ett kort namn (label) for favoriten
- Favoritlista: renderas som knappar/chips med adressnamn och en liten X for att ta bort
- Klick pa en favorit anropar `onSelect` med adress + koordinater

**2. Uppdatering: `src/components/logistics/TransportBookingTab.tsx`**

- Importera och rendera `AddressFavorites` direkt under `AddressAutocomplete`-faltet och koordinat-raden (rad ~753-777)
- Koppla `onSelect` till att uppdatera `wizardData` med adress, lat, lng (samma logik som `onChange` pa AddressAutocomplete)
- Skicka med nuvarande `pickupAddress`, `pickupLatitude`, `pickupLongitude` sa att komponenten vet vad som kan sparas

### Lagring
Favoriter sparas i `localStorage` under nyckeln `transport-address-favorites` som JSON-array. Detta foljer samma monster som redan anvands i projektet (t.ex. `calendarResources`, `warehouseEventTypeFilters`).

### Filer som andras/skapas
- **Ny fil:** `src/components/logistics/AddressFavorites.tsx`
- **Andras:** `src/components/logistics/TransportBookingTab.tsx` (lagg till favoritkomponenten under adressfaltet)

