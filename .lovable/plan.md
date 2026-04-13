

## Plan: Fokuserad vy — bara CONFIRMED-bokningar med statusavvikelser

### Problem
Användaren ser en massa avvikelser som inte är relevanta just nu. Det som behövs är en enkel lista: "Alla bokningar som är CONFIRMED i Booking — stämmer de överens med Planning?" Alla andra avvikelser (produkter, bilagor, metadata-fält) ska ignoreras i detta läge.

### Lösning

**1. Ny flik/filter i `src/pages/SyncReconciliation.tsx`**

Lägg till en ny standardvy (flik eller toggle) "Bokningsöversikt" som visar:
- En tabell/lista med ALLA bekräftade bokningar från Booking-systemet
- Kolumner: Bokningsnr, Klient, Eventdatum, Status i Booking, Status i Planning, Finns i Planning (ja/nej)
- Markera rader som har problem: saknas i Planning, eller har annan status i Planning
- Rader utan problem visas gröna/normala, problemrader markeras tydligt

**2. Backend-stöd i `supabase/functions/sync-reconciliation/index.ts`**

Lägg till en ny action `"booking-overview"` som:
- Hämtar alla externa bokningar (paginerat, samma som idag)
- Hämtar alla lokala bokningar
- Returnerar en enkel lista med varje bokning och dess status i båda system
- Flaggar: `missingInPlanning`, `statusMismatch`, `localStatus`, `externalStatus`
- Filtrerar bara CONFIRMED-bokningar från Booking (eller returnerar alla med status, låter UI filtrera)

**3. UI-struktur**

Två flikar högst upp:
- **Bokningsöversikt** (ny, default) — den enkla listan
- **Detaljerad avstämning** — nuvarande vy med alla metadata/produkt/bilaga-avvikelser

Bokningsöversikten visar:
- Sammanfattning: X bekräftade i Booking, Y matchar Planning, Z avviker
- Tabell med sortering/filtrering
- Varje rad visar tydligt om bokningen finns och har rätt status i Planning
- Knapp "Importera saknade" för bokningar som saknas lokalt

### Tekniska detaljer

**Edge function** (`sync-reconciliation/index.ts`):
- Ny action `"booking-overview"` runt rad 297
- Återanvänder paginerad hämtning och `fetchAll`
- Returnerar: `{ bookings: Array<{ id, bookingNumber, client, eventdate, externalStatus, localStatus, existsLocally, statusMatch }> }`

**UI** (`src/pages/SyncReconciliation.tsx`):
- Ny `useQuery` för `booking-overview`
- Tabs-komponent med "Bokningsöversikt" och "Detaljerad avstämning"
- Enkel tabellvy med statusikoner och färgkodning

### Resultat
- Användaren ser direkt vilka CONFIRMED-bokningar som saknas eller har fel status i Planning
- Inga andra avvikelser syns i denna vy
- Befintlig detaljerad vy finns kvar under egen flik

