

# Plan: Automatisk skapning av packlistor med produkter vid import

## Problemöversikt

När bokningar importeras idag:
- ✅ Produkter sparas i `booking_products`
- ✅ Kalenderhändelser skapas för personalplanering
- ✅ Lagerhändelser skapas (nu)
- ❌ **Packlistor skapas INTE automatiskt**
- ❌ **Produkter visas INTE i packlistans detaljvy**

Detta innebär att lagerpersonal måste manuellt skapa packlistor och har ingen direkt tillgång till produktinformationen.

---

## Lösning

### Del 1: Automatisk skapning av packlistor vid import

När en bekräftad bokning importeras:
1. Skapa automatiskt en `packing_projects`-post
2. Skapa standard-uppgifter i `packing_tasks` med beräknade deadlines baserade på bokningsdatum
3. Namn formateras som: `{kund} - {eventdatum}`

### Del 2: Visa produkter i packningsdetaljvyn

Lägg till en ny flik "Produkter" på packningssidan som visar alla produkter från den kopplade bokningen (hämtas från `booking_products`).

---

## Tekniska ändringar

### 1. Edge Function: Skapa packlista vid import

**Fil:** `supabase/functions/import-bookings/index.ts`

Ny hjälpfunktion `createPackingForBooking`:

| Steg | Beskrivning |
|------|-------------|
| 1 | Kontrollera om packlista redan finns för bokningen |
| 2 | Om inte: skapa `packing_projects` med namn baserat på kund + eventdatum |
| 3 | Skapa standard-uppgifter i `packing_tasks` med deadlines |

Standard-uppgifter som skapas automatiskt:

| Uppgift | Deadline |
|---------|----------|
| Packning påbörjad | rigdaydate - 4 dagar |
| Packlista klar | rigdaydate - 2 dagar |
| Utrustning packad | rigdaydate - 1 dag |
| Utleverans klarmarkerad | rigdaydate |
| Inventering efter event | rigdowndate + 1 dag |
| Upppackning klar | rigdowndate + 2 dagar |

### 2. Frontend: Visa produkter i packningsdetalj

**Fil:** `src/pages/PackingDetail.tsx`

Ändringar:
- Lägg till hook för att hämta produkter från `booking_products` baserat på `booking_id`
- Lägg till ny flik "Produkter" i TabsList
- Återanvänd `ProductsList`-komponenten

### 3. Packing Service: Hämta produkter

**Fil:** `src/services/packingService.ts`

Ny funktion:

```text
export const fetchPackingProducts = async (bookingId: string) => {
  // Hämta produkter från booking_products där booking_id matchar
  return data as BookingProduct[];
}
```

---

## Flödesdiagram

```text
Import-Bookings Edge Function
           │
           ▼
    ┌──────────────┐
    │ Bokning      │
    │ bekräftad?   │
    └──────┬───────┘
           │ Ja
           ▼
    ┌──────────────┐     ┌──────────────┐
    │ Skapa        │     │ Skapa        │
    │ calendar_    │     │ warehouse_   │
    │ events       │     │ events       │
    └──────┬───────┘     └──────────────┘
           │
           ▼
    ┌──────────────┐
    │ Packlista    │
    │ finns redan? │
    └──────┬───────┘
           │ Nej
           ▼
    ┌──────────────┐
    │ Skapa        │
    │ packing_     │
    │ projects     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Skapa        │
    │ packing_     │
    │ tasks        │
    └──────────────┘
```

---

## Filer som ändras

| Fil | Ändring |
|-----|---------|
| `supabase/functions/import-bookings/index.ts` | Lägg till `createPackingForBooking` funktion |
| `src/pages/PackingDetail.tsx` | Lägg till produktflik och hämta produktdata |
| `src/services/packingService.ts` | Lägg till `fetchPackingProducts` funktion |

---

## Resultat efter implementation

1. ✅ Packlistor skapas automatiskt för alla bekräftade bokningar
2. ✅ Standard-uppgifter med deadlines baserade på rig/event-datum
3. ✅ Lagerpersonal kan se produktlistan direkt i packningsvyn
4. ✅ Inga manuella steg krävs för att komma igång med packning

