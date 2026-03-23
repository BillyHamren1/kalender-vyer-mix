

## Plan: Auto-geocoding vid adressändring

### Problem
När leveransadress, stad eller postnummer ändras i DeliveryInformationCard sparas de nya textfälten, men geokoderna (latitude/longitude) uppdateras aldrig. Edge-funktionen `geocode-address` finns men anropas aldrig från formuläret.

### Lösning

**Fil: `src/components/booking/DeliveryInformationCard.tsx`**

Lägg till en debounced geocoding-funktion som triggas när adress, stad eller postnummer ändras:

1. I `handleDeliveryDetailsChange`, efter att ett adressfält (`address`, `city`, `postalCode`) ändras, starta en separat debounced geocoding (1.5s delay)
2. Geocodingen anropar `geocode-address` edge-funktionen med den kombinerade adressen (`address, city postalCode`)
3. Vid lyckat svar → uppdatera latitude/longitude i state och spara till databasen
4. Vid misslyckat svar → logga varning, behåll befintliga koordinater

Konkret flow:
```text
Användare ändrar adressfält
  → Sparar text direkt (befintlig logik)
  → Startar 1.5s debounce-timer för geocoding
  → Timer löper ut → anrop geocode-address med "address, city postalCode"
  → Svar med lat/lng → uppdaterar state + sparar med onSave()
```

Ingen ändring behövs i edge-funktionen eller andra filer. Bara `DeliveryInformationCard.tsx` uppdateras med ~20 rader geocoding-logik.

