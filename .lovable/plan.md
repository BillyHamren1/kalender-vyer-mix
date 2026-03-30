

## Packning for stora projekt -- separata packlistor, samlad vy

### Nuläge
- `packing_projects` har `booking_id` (TEXT) -- en packlista per bokning
- Bokningar som tillhör ett stort projekt får automatiskt egna packlistor via DB-triggern `sync_packing_on_booking_change`
- Stora projektets detaljvy (`LargeProjectViewPage`) har ingen koppling till packning

### Vad behöver göras
Eftersom varje bokning redan har sin egen packlista (och det ska fortsätta vara så), behöver vi bara **visa packstatus samlat** i stora projekt-vyn.

### Plan

**1. Ny flik "Packning" i LargeProjectViewPage**
- Lägg till en ny tab "Packning" med Package-ikon i tab-navigeringen
- Tabben visar alla bokningars packlistor samlat

**2. Ny komponent `LargeProjectPackingOverview`**
- Hämtar alla `packing_projects` för projektets bokningar (via `large_project_bookings` -> `booking_id`)
- Visar en lista/kort per bokning med:
  - Bokningsnamn (klient + bokningsnummer)
  - Packstatus-badge (Ej påbörjad / Pågår / Packad / Levererad)
  - Framstegsindikator (scannade/totala artiklar via `packing_list_items`)
  - Knapp "Öppna packlista" som navigerar till `/warehouse/packing/{packing_id}`
- Sammanfattning högst upp: totalt antal artiklar, totalt packade, övergripande framsteg

**3. Ingen databasändring krävs**
- Befintlig `packing_projects.booking_id` + `large_project_bookings` räcker för att joina datan
- Bokningar som skapas/ändras i projektet synkas redan automatiskt till packlistor via triggern

### Teknisk detalj

Query-strategi i den nya komponenten:
```sql
SELECT pp.*, 
  b.client, b.booking_number,
  (SELECT count(*) FROM packing_list_items WHERE packing_id = pp.id) as total_items,
  (SELECT sum(quantity_packed) FROM packing_list_items WHERE packing_id = pp.id) as packed_items
FROM packing_projects pp
JOIN large_project_bookings lpb ON lpb.booking_id = pp.booking_id
JOIN bookings b ON b.id = pp.booking_id
WHERE lpb.large_project_id = :projectId
```

Filer som ändras:
- `src/pages/project/LargeProjectViewPage.tsx` -- lägg till Packning-tab
- `src/components/project/LargeProjectPackingOverview.tsx` -- ny komponent

