

## Plan: Stort projekt = EN samlad packlista med bokningsgruppering

### Sammanfattning
Ett stort projekt kommer in som ETT packjobb. Packlistan visar en **sammanfattning med alla produkter** högst upp, följt av **sektioner per bokning** med respektive produkter. Användaren kan senare välja att **splitta** till separata packlistor.

### Databasändringar

**1. Ny kopplingstabell `packing_project_bookings`**
Kopplar flera bokningar till en packlista:
- `id` (uuid PK)
- `packing_id` (uuid FK → packing_projects, ON DELETE CASCADE)
- `booking_id` (text, NOT NULL)
- `organization_id` (uuid)
- UNIQUE(packing_id, booking_id)
- RLS: org-filter

**2. Ny kolumn på `packing_projects`**
- `large_project_id` (uuid, nullable) — markerar att det är en samlad packlista för ett stort projekt

### Inkorgen (`IncomingPackingList.tsx`)

- Stort projekt: knappen ändras från "Skapa alla packningar" till **"Skapa packning"**
- Klick skapar EN `packing_project` med `large_project_id` satt och projektnamnet som namn
- Alla boknings-ID:n sparas i `packing_project_bookings`
- `syncBookingToPacking` anropas per bokning mot samma `packing_id` — alla produkter hamnar i samma lista
- Inkorgens query uppdateras: filtrera bort bokningar som finns i `packing_project_bookings`

### Packliste-hook (`usePackingList.tsx`)

- Om packlistan har `large_project_id`: hämta alla `booking_id` från `packing_project_bookings`
- Kör `fullSyncPackingListItems` per bokning (alla mot samma `packing_id`)
- Hämta produkter och gruppera per `booking_id` (via `booking_products.booking_id`)

### Packliste-UI (`PackingListTab.tsx`)

Ny layout för stora projekt:

```text
┌─────────────────────────────────┐
│ SAMMANFATTNING (alla produkter) │
│ Progress: 45/120 artiklar (38%) │
│ ┌─────────────────────────────┐ │
│ │ Alla produkter i en lista   │ │
│ │ (som idag, ihopslagen)      │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 📦 Bokning 1 — Klientnamn      │
│   Produkt A  ☐ 5/10            │
│   Produkt B  ☑ 3/3             │
├─────────────────────────────────┤
│ 📦 Bokning 2 — Klientnamn      │
│   Produkt C  ☐ 0/8             │
│   Produkt D  ☐ 2/5             │
├─────────────────────────────────┤
│ [Splitta till separata listor]  │
└─────────────────────────────────┘
```

- Sammanfattningen visar total progress och alla produkter i en platt lista
- Under: sektioner per bokning med rubrik (klientnamn + bokningsnummer)
- Varje sektion visar bokningens produkter med pack-status

### Splitta-funktion (i detaljvyn)

Knapp "Splitta till separata packlistor":
1. Skapar en ny `packing_project` per bokning (som `handleCreateAllPackings` gör idag)
2. Flyttar relevanta `packing_list_items` till respektive ny packlista (baserat på `booking_product_id` → `booking_products.booking_id`)
3. Tar bort den samlade packlistan
4. Navigerar till packningslistan

### Types (`packing.ts`)

- Lägg till `large_project_id: string | null` på `Packing`-interfacet

### Filer som ändras
- **Ny migration**: `packing_project_bookings` + `large_project_id`-kolumn
- `src/types/packing.ts` — `large_project_id`
- `src/components/packing/IncomingPackingList.tsx` — en knapp "Skapa packning" för stora projekt
- `src/hooks/usePackingList.tsx` — multi-booking sync + gruppering
- `src/components/packing/PackingListTab.tsx` — sammanfattning + bokningssektioner
- `src/pages/PackingDetail.tsx` — splitta-knapp + stort-projekt-badge
- `src/integrations/supabase/types.ts` — ny tabell

