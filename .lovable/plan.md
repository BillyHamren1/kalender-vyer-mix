

# Visa alla GPS-positioner + tid på plats

## Nuläge
- `staff_locations`-tabellen har `updated_at` (senaste GPS-ping), men ingen info om **när personen anlände till sin nuvarande plats**.
- `fetchStaffLocations` hämtar GPS-data från senaste 10 min — personal utan GPS eller med gammal data syns inte.
- Kartan (OpsLiveMap) och StaffLocationsCard visar "senaste rapport" men inte varaktighet på plats.

## Plan

### 1. Ny kolumn: `location_since` på `staff_locations`
Lägg till `location_since timestamptz` som anger **när personen senast anlände till sin nuvarande position**. Uppdateras bara när positionen ändras mer än ~100m (beräknas via Haversine i edge-funktionen).

**Migration:**
```sql
ALTER TABLE staff_locations ADD COLUMN location_since timestamptz DEFAULT now();
```

### 2. Uppdatera `mobile-app-api` (GPS-rapportering)
I upsert-logiken för `staff_locations`: beräkna distans mellan ny och gammal position. Om > 100m → sätt `location_since = now()`. Annars → behåll befintligt `location_since`.

### 3. Utöka `StaffLocation`-interfacet
Lägg till `locationSince: string | null` i `StaffLocation` och inkludera det i `fetchStaffLocations`.

### 4. Visa varaktighet i OpsLiveMap staff-panel
I staffPanel-sektionen: visa "På plats sedan HH:MM (X tim Y min)" baserat på `locationSince`.

### 5. Visa varaktighet i StaffLocationsCard
Lägg till en rad under varje personal som visar "På plats: 2 tim 15 min" med klock-ikon.

### 6. Ta bort 10-minutersgränsen
Ändra `fetchStaffLocations` så att **alla** personal med GPS-data visas (inte bara senaste 10 min). Markera de som inte uppdaterat på >10 min som "offline" med grå stil, men visa dem fortfarande.

## Filer som ändras
- **Migration** — ny kolumn `location_since`
- `supabase/functions/mobile-app-api/index.ts` — Haversine-check vid GPS-upsert
- `src/services/planningDashboardService.ts` — hämta `location_since`, ta bort 10-min filter
- `src/components/ops-control/OpsLiveMap.tsx` — visa tid på plats i staffPanel
- `src/components/planning-dashboard/StaffLocationsCard.tsx` — visa varaktighet

## Teknisk detalj: Haversine i edge function
```typescript
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
// Om distans > 100m → location_since = now(), annars behåll
```

