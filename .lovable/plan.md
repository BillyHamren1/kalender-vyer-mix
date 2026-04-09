
## Plan: Produktöversikt med flikar per bokning

### Vad
Lägg till en ny flik **Produkter** i LargeProjectViewPage som visar alla produkter från samtliga bokningar. Inuti fliken finns sub-flikar: **Alla** (sammanslagna) och en flik per bokning.

### Implementation

**1. Ny komponent `LargeProjectProductsOverview.tsx`**
- Props: `bookings: LargeProjectBooking[]`
- Hämtar `booking_products` för ALLA booking_id:s i ett enda query (`.in('booking_id', bookingIds)`)
- Inre Tabs-komponent:
  - **Alla** — visar alla produkter grupperade hierarkiskt (huvud + tillbehör), med bokningsnamn som sektionsrubrik
  - **Per bokning** — en flik per bokning med bokningsnamn (via `getLargeProjectBookingLabel`), visar `ProjectProductsList` per bokning
- Summering i footer: totalt antal produkter, vikt, volym

**2. Uppdatera `LargeProjectViewPage.tsx`**
- Importera nya komponenten
- Lägg till "Produkter"-flik i TabsList med badge för totalt antal produkter
- Skicka `project.bookings` som prop

### Filer som ändras
- `src/components/project/LargeProjectProductsOverview.tsx` — ny fil
- `src/pages/project/LargeProjectViewPage.tsx` — ny flik
