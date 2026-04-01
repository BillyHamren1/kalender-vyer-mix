

# Fasta platser med automatisk GPS + manuell timer i appen

## Sammanfattning
Skapa ett system för "fasta platser" (kontor, lager) där tid registreras **både automatiskt via GPS** (geofence-check vid varje GPS-ping i edge function) **och manuellt via timer i mobilappen** (samma timer-UX som för jobb). Admin hanterar platser i Ops Control. Tider visas i dashboard och tidrapportvyn.

## Databasändringar (migration)

### Tabell: `organization_locations`
```sql
CREATE TABLE organization_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_meters INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Tabell: `location_time_entries`
```sql
CREATE TABLE location_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_id TEXT NOT NULL,
  location_id UUID NOT NULL REFERENCES organization_locations(id),
  entry_date DATE NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL,
  exited_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'gps',  -- 'gps' | 'manual'
  total_minutes INT GENERATED ALWAYS AS (
    CASE WHEN exited_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (exited_at - entered_at))::int / 60 
      ELSE NULL END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

RLS-policies med `organization_id`-isolering + `set_organization_id`-trigger på båda.

## Edge Function: `mobile-app-api`

### 1. Utöka `handleReportLocation` med geofence-check
Efter GPS-upsert:
- Hämta alla aktiva `organization_locations` för organisationens
- Haversine-check mot varje plats
- Om inom radie och ingen öppen entry → INSERT `location_time_entries` (source='gps')
- Om utanför radie och öppen entry → UPDATE `exited_at`

### 2. Nya actions för manuell timer + admin
- `get_organization_locations` — hämta alla aktiva platser (för mobilappen att visa som "timer-targets")
- `start_location_timer` — INSERT `location_time_entries` med source='manual'
- `stop_location_timer` — UPDATE `exited_at` på öppen entry
- `get_location_time_entries` — hämta entries (för dashboard/rapporter)

## Mobilappen

### `useGeofencing.ts` — utöka med plats-timers
- Hämta `organization_locations` via nytt API-anrop vid mount
- Inkludera platser i geofence-check (samma enter/exit-logik som bookings)
- `startTimer` stödjer redan `bookingId` — utöka med `locationId` som alternativ identifierare, eller använd `location-{id}` som nyckel

### `MobileTimeReport.tsx` — visa plats-timers
- I "Aktiva timers"-sektionen: visa även plats-timers (kontor/lager) med distinkt ikon (Building)
- Vid stopp av plats-timer: anropa `stop_location_timer` istället för `createTimeReport`
- I manuell tidrapportformuläret: lägg till ett separat "Starta timer för plats"-avsnitt med knappar för varje konfigurerad plats

### `GeofencePrompt.tsx` — hantera plats-geofence
- Visa prompt även vid ankomst/avfärd från fast plats (med platsnamn istället för klientnamn)

## Admin-UI: Ops Control

### Ny komponent: `OrganizationLocationsManager.tsx`
- Lista platser med namn, adress, radie
- Skapa/redigera/inaktivera platser
- Enkel formulär-UI (behöver inte karta i första versionen)

### Integrera i `OpsControlCenter.tsx`
- Lägg till som ny tab/sektion i bottenpanelen, eller som knapp i topp-baren som öppnar en dialog

## Dashboard & Rapporter

### `StaffLocationsCard.tsx`
- Visa om personal befinner sig på en fast plats (t.ex. "📍 Kontoret sedan 08:15")

### `EconomyTimeReports.tsx`
- Lägg till flik/filter "Fasta platser" som visar `location_time_entries` med platsnamn, in/ut-tid, varaktighet

## Filer som skapas/ändras

| Fil | Åtgärd |
|-----|--------|
| Migration SQL | Skapa tabeller + RLS |
| `supabase/functions/mobile-app-api/index.ts` | Geofence i `handleReportLocation` + 4 nya actions |
| `src/services/mobileApiService.ts` | Nya API-metoder |
| `src/services/organizationLocationService.ts` | **Ny** — admin CRUD |
| `src/services/locationTimeService.ts` | **Ny** — hämta tiddata |
| `src/hooks/useGeofencing.ts` | Utöka med plats-geofencing + plats-timers |
| `src/pages/mobile/MobileTimeReport.tsx` | Visa plats-timers + manuell start-knapp |
| `src/components/mobile-app/GeofencePrompt.tsx` | Stöd plats-events |
| `src/components/ops-control/OrganizationLocationsManager.tsx` | **Ny** — admin-UI |
| `src/pages/OpsControlCenter.tsx` | Integrera platser-hantering |
| `src/components/planning-dashboard/StaffLocationsCard.tsx` | Visa fast plats-info |
| `src/pages/EconomyTimeReports.tsx` | Flik för platstider |

