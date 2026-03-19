

# Granskning: Lagerflödet (Warehouse → Scanner → Sync)

## Sammanfattning av nuläge

Lagerflödet har en solid grundarkitektur med tydlig separation mellan dashboard, planering, skanning och sync. Nedan följer en detaljerad genomgång av de 5 områdena.

---

## 1. Jobbar vi rätt?

**Arkitekturen fungerar korrekt i grunden:**
- `warehouse_calendar_events` synkas från `import-bookings` (edge function) — rätt källa
- `packing_projects` kopplas till `bookings` via `booking_id`
- `packing_list_items` genereras automatiskt från `booking_products` (både i lagervyn och scanner-api)
- Scanner validerar varje scan mot externt lagersystem (`allocate-instance`) — robust
- Multi-tenant-isolering (`organization_id`) genomgående — korrekt

**Identifierade problem:**

| # | Problem | Allvarlighet |
|---|---------|-------------|
| A | `newJobsQuery` på dashboarden saknar `organization_id`-filter | **HÖG** |
| B | `activePackingsQuery` saknar `organization_id`-filter | **HÖG** |
| C | `completedPackingsQuery` saknar `organization_id`-filter | **HÖG** |
| D | `staffUtilizationQuery` saknar `organization_id` på alla 3 queries | **HÖG** |
| E | `transportsQuery` saknar `organization_id`-filter | **HÖG** |

Dashboarden (`WarehouseDashboard.tsx`) kör 6 separata queries med `supabase` klienten men **ingen av dem filtrerar på `organization_id`**. RLS-policies bör fånga detta, men det är inkonsekvent med resten av systemet som explicit filtrerar.

---

## 2. Hur planerar man jobb till personal?

**Nuvarande flöde:**
1. Packning skapas (manuellt via "Ny packning" eller från dashboard "Skapa packning" på inkommande bokning)
2. I `PackingDetail` kan man skapa **uppgifter (tasks)** med `assigned_to` (fritext-fält, ej kopplat till `staff_members`)
3. `project_leader` sätts vid skapande via `CreatePackingWizard`

**Problem:**
- `assigned_to` på `packing_tasks` är ett fritext-fält — ingen koppling till `staff_members`-tabellen
- Det finns ingen vy för att se "mina uppgifter" som lagerpersonal
- `WarehouseStaffUtilizationCard` visar personal med loggade timmar (`packing_labor_costs`) eller tilldelade uppgifter, men uppgiftstilldelning baseras på string-matchning mot `assigned_to` (fragilt)

---

## 3. Hur ges jobb till personal? Finns det en bra vy?

**Personalkalendern** (`/warehouse/calendar`) visar alla kalenderhändelser (rigg, event, nedrigg, packning, leverans etc.) per team/dag — bra översikt.

**Det saknas dock:**
- En dedikerad "Mina jobb"-vy för lagerpersonal (liknande `MobileJobs` för tidappen)
- Pushnotiser eller uppdateringsflöde till lagerpersonal vid nya/ändrade uppgifter
- Lagerpersonal har ingen mobilvy — de måste använda desktop-UI:t

**Vad som fungerar:**
- Dashboard visar "Nya jobb" (bekräftade bokningar utan packning)
- Dashboard visar "Aktiva packningar" med progress-bar
- Uppgifter kan tilldelas i `PackingDetail` med deadline och kommentarer

---

## 4. Sync från scanner till lager för status på packningar

**Flöde:**
```text
Scanner (Zebra) → useScanProcessor (FIFO-kö)
  → scanner-api/verify_product (backend)
    → allocate-instance (externt lager)
    → packing_list_items UPDATE (quantity_packed++)
  ← { success, itemId, newQuantity }
  → UI: optimistisk uppdatering (Math.max)
  → usePackingSync: debounced reload efter 2s
```

**Sync tillbaka till lagervyn:**
- `WarehouseDashboard` har `useRealtimeInvalidation` på `packing_list_items` → cache invalideras
- `PackingDetail` har liknande realtime-subscription
- `activePackingsQuery` beräknar progress från `packing_list_items`

**Fungerar bra.** Scanner skriver direkt till Supabase via edge function, och lagervyn lyssnar via realtime. Progress uppdateras automatiskt.

**Notering:** `sign_packing` (scanner) sätter status till `delivered` — detta syns omedelbart i lagervyn tack vare realtime på `packing_projects`.

---

## 5. Vilka jobb visas i scanner? Vilka ska visas? Hur filtreras de?

**Nuvarande filter (`scanner-api` → `list_active_packings`):**
```sql
WHERE organization_id = ORG_ID
AND status IN ('planning', 'in_progress')
ORDER BY created_at DESC
```

**Frontend-sortering** (i `scannerService.ts`):
- `in_progress` först, sedan sorterat på närmaste datum (rigdaydate/eventdate)

**Problem:**
- **Ingen datumfiltrering** — alla packningar med status `planning` visas, oavsett hur långt fram i tiden de ligger. Med 50+ framtida packningar blir listan ohanterlig.
- **Ingen `delivered`-status visas** — om en packning signerats som levererad kan personalen inte längre se den i scannern, även om de behöver göra ytterligare kontroller.
- **Ingen limit** — potentiellt hundratals packningar returneras.

**Rekommendation:** Filtrera på `rigdaydate <= idag + 14 dagar` för att visa relevant vecka + kommande. Alternativt gruppera "Denna vecka" / "Nästa vecka" / "Senare".

---

## Åtgärdsplan

### Steg 1: Fixa organization_id-filter i WarehouseDashboard (KRITISKT)
**Fil:** `src/pages/WarehouseDashboard.tsx`
- Lägg till `.eq('organization_id', userOrgId)` eller använd RLS-kompatibla anrop med autentiserad klient (som redan filtrerar via RLS). **Verifiera att RLS-policies faktiskt finns** på alla berörda tabeller (`bookings`, `packing_projects`, `packing_list_items`, `packing_labor_costs`, `packing_tasks`, `transport_assignments`, `vehicles`, `staff_members`).

Om RLS redan filtrerar korrekt → detta är OK och bara en stilfråga. Men om någon tabell saknar RLS → dataläckage.

### Steg 2: Filtrera scanner-packningar efter datum
**Fil:** `supabase/functions/scanner-api/index.ts` (case `list_active_packings`)
- Joina med `bookings` och filtrera: `rigdaydate <= today + 14 dagar` ELLER `status = 'in_progress'`
- Begränsa till max 50 resultat

### Steg 3: Förbättra personalplanering i lager (optional, UX-förbättring)
**Filer:** Nya komponenter
- Koppla `packing_tasks.assigned_to` till `staff_members.id` istället för fritext
- Skapa en "Mina uppgifter"-vy (liten widget på dashboarden eller separat sida)

---

## Filer som ändras

1. **`src/pages/WarehouseDashboard.tsx`** — Verifiera/fixa org-filter
2. **`supabase/functions/scanner-api/index.ts`** — Datumfiltrering på packningar

