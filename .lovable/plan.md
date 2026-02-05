
# Plan: Logistikplanering med Ruttoptimering och GPS-spårning

## Översikt
Bygga ut den nya **Logistikplanering**-avdelningen med:
1. **Fordonshantering** - Registrera och hantera fordon med kapacitet
2. **Transportplanering** - Tilldela bokningar till fordon med lastberäkning
3. **Automatisk ruttoptimering** - Google Routes API för optimal körordning
4. **GPS-spårning i realtid** - Se fordon live på kartan med geofencing

---

## Systemarkitektur

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              LOGISTIKPLANERING                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐          │
│  │  FORDONSREGISTER │    │ TRANSPORTPLANERING│    │  RUTTPLANERING   │          │
│  │                  │    │                  │    │                  │          │
│  │  - Lägg till bil │    │  - Veckokalender │    │  - Kartvy        │          │
│  │  - Kapacitet kg  │    │  - Drag-drop     │    │  - Optimera rutt │          │
│  │  - Kapacitet m³  │    │  - Kapacitetsbar │    │  - Google Maps   │          │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘          │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                         GPS-SPÅRNING (REALTID)                           │  │
│  │                                                                          │  │
│  │  [Bil 1 ●]────────[Stopp A]────────[Stopp B]────────[Stopp C]           │  │
│  │                                                                          │  │
│  │  ► Förare skickar position var 30:e sekund via mobilappen               │  │
│  │  ► Supabase Realtime uppdaterar kartan direkt                           │  │
│  │  ► Geofencing: Auto-markera "Framme" inom 100m av leveransadress        │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Funktionalitet

### 1. Fordonsregister
- CRUD för fordon (namn, registreringsnummer, typ)
- Max lastvikt (kg) och lastvolym (m³)
- Aktiv/inaktiv status
- Nuvarande GPS-position (för spårning)

### 2. Transportplanering
- Veckobaserad vy med kolumner per fordon
- Drag-and-drop av bokningar till fordon
- Visuella kapacitetsmätare (vikt/volym)
- Varning vid överlast (>100%)
- Filtrera på rigdaydate/eventdate

### 3. Automatisk Ruttoptimering (Google Routes API)
- "Optimera rutt"-knapp som anropar Google Routes
- Returnerar optimal körordning baserat på:
  - Kortaste restid
  - Trafikförhållanden i realtid
  - Tidsfönster (om specificerat)
- Uppdaterar `stop_order` automatiskt i databasen
- Visar beräknad total körtid och sträcka

### 4. GPS-Spårning i Realtid
- **Förarvy (mobil)**: Ny sida i mobilappen som:
  - Visar dagens rutt med stopp
  - Skickar GPS-position var 30:e sekund
  - "Starta navigation"-knapp → Google Maps
  - "Levererad"-knapp för varje stopp
- **Kontorsvy**: Kartan visar fordon i realtid med:
  - Animerade markörer
  - Senaste uppdateringstid
  - Klickbar för att se rutt
- **Geofencing**: Auto-trigger "Framme" inom 100m av destination

---

## Teknisk Implementation

### Databas - Nya tabeller

**vehicles**
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | Primärnyckel |
| name | text | "Bil 1", "Volvo lastbil" |
| registration_number | text | "ABC 123" |
| max_weight_kg | numeric | Max lastvikt (default 3500) |
| max_volume_m3 | numeric | Max volym (default 15) |
| vehicle_type | text | 'van', 'truck', 'trailer' |
| is_active | boolean | Om fordonet är i bruk |
| current_lat | double precision | GPS latitude |
| current_lng | double precision | GPS longitude |
| current_heading | double precision | Riktning (grader) |
| last_gps_update | timestamptz | Senaste GPS-uppdatering |
| assigned_driver_id | text | FK till staff_members |
| created_at | timestamptz | Skapad |

**transport_assignments**
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | Primärnyckel |
| vehicle_id | uuid | FK till vehicles |
| booking_id | text | FK till bookings |
| transport_date | date | Datum för transporten |
| stop_order | integer | Ordning i rutten (0 = ej sorterad) |
| status | text | 'pending', 'in_transit', 'delivered', 'skipped' |
| estimated_arrival | timestamptz | Beräknad ankomsttid |
| actual_arrival | timestamptz | Faktisk ankomsttid |
| driver_notes | text | Anteckningar från förare |
| created_at | timestamptz | Skapad |
| UNIQUE | | (booking_id, transport_date) |

**vehicle_gps_history** (för historik)
| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | Primärnyckel |
| vehicle_id | uuid | FK till vehicles |
| lat | double precision | Latitude |
| lng | double precision | Longitude |
| heading | double precision | Riktning |
| speed_kmh | double precision | Hastighet |
| recorded_at | timestamptz | Tidstämpel |

**Uppdatering av booking_products**
- Lägg till `estimated_weight_kg` (numeric, nullable)
- Lägg till `estimated_volume_m3` (numeric, nullable)

---

### Edge Functions

**1. optimize-logistics-route** (Ny)
Anropar Google Routes API för ruttoptimering.
```typescript
// supabase/functions/optimize-logistics-route/index.ts
// Input: { vehicle_id, transport_date }
// Output: { optimized_order: [...booking_ids], total_distance_km, total_duration_min }

const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
  method: 'POST',
  headers: {
    'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
    'X-Goog-FieldMask': 'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration'
  },
  body: JSON.stringify({
    origin: { location: { latLng: { latitude: startLat, longitude: startLng } } },
    destination: { location: { latLng: { latitude: endLat, longitude: endLng } } },
    intermediates: stops.map(s => ({ 
      location: { latLng: { latitude: s.lat, longitude: s.lng } } 
    })),
    travelMode: 'DRIVE',
    optimizeWaypointOrder: true,
    routingPreference: 'TRAFFIC_AWARE'
  })
});
```

**2. track-vehicle-gps** (Ny)
Tar emot GPS-data från mobilappen och uppdaterar fordonets position.
```typescript
// supabase/functions/track-vehicle-gps/index.ts
// Input: { vehicle_id, lat, lng, heading, speed_kmh }
// - Uppdaterar vehicles.current_lat/lng/heading/last_gps_update
// - Sparar till vehicle_gps_history
// - Kollar geofencing: om inom 100m av nästa stopp → uppdatera status
```

**3. Uppdatera mobile-app-api** (Befintlig)
Lägg till nya actions:
- `get_driver_route`: Hämta dagens rutt för inloggad förare
- `update_stop_status`: Markera stopp som delivered/skipped
- `send_gps_position`: Skicka GPS-koordinater

---

### Nya filer

```text
src/
├── pages/
│   ├── LogisticsPlanning.tsx         # Huvudsida (dashboard)
│   ├── LogisticsVehicles.tsx         # Fordonshantering
│   ├── LogisticsRoutes.tsx           # Ruttplanering med karta
│   └── LogisticsDriverView.tsx       # Förarvy (mobil)
│
├── components/
│   └── logistics-planning/
│       ├── VehicleCard.tsx           # Fordonskort med info
│       ├── VehicleForm.tsx           # Skapa/redigera fordon
│       ├── VehicleCapacityBar.tsx    # Visuell kapacitetsmätare
│       ├── TransportCalendar.tsx     # Veckokalender med fordon
│       ├── TransportColumn.tsx       # Kolumn per fordon
│       ├── DraggableBookingCard.tsx  # Bokningskort för drag-drop
│       ├── RouteMap.tsx              # Karta med rutt
│       ├── RouteStopList.tsx         # Draggable stopplista
│       ├── OptimizeRouteButton.tsx   # Knapp för optimering
│       ├── LiveVehicleMarker.tsx     # Animerad GPS-markör
│       ├── DriverStopCard.tsx        # Stopp för förare
│       └── GeofenceIndicator.tsx     # Visar geofence-status
│
├── hooks/
│   ├── useVehicles.ts                # CRUD + realtime för fordon
│   ├── useTransportAssignments.ts    # Tilldelningar
│   ├── useRouteOptimization.ts       # Anropa optimize-edge
│   ├── useVehicleTracking.ts         # GPS-spårning realtime
│   └── useGeofencing.ts              # Geofence-logik

supabase/functions/
├── optimize-logistics-route/         # Google Routes integration
│   └── index.ts
├── track-vehicle-gps/                # GPS-inmatning
│   └── index.ts
```

---

### Sidmeny-uppdatering

Lägg till i `Sidebar3D.tsx`:
```typescript
import { Truck } from "lucide-react";

// I navigationItems:
{ 
  title: "Logistikplanering", 
  url: "/logistics", 
  icon: Truck,
  children: [
    { title: "Transportplanering", url: "/logistics/planning" },
    { title: "Ruttplanering", url: "/logistics/routes" },
    { title: "Fordon", url: "/logistics/vehicles" },
  ]
}
```

---

### Routing i App.tsx

```typescript
import LogisticsPlanning from "./pages/LogisticsPlanning";
import LogisticsVehicles from "./pages/LogisticsVehicles";
import LogisticsRoutes from "./pages/LogisticsRoutes";
import LogisticsDriverView from "./pages/LogisticsDriverView";

// I Routes:
<Route path="/logistics" element={<ProtectedRoute><MainSystemLayout><LogisticsPlanning /></MainSystemLayout></ProtectedRoute>} />
<Route path="/logistics/planning" element={<ProtectedRoute><MainSystemLayout><LogisticsPlanning /></MainSystemLayout></ProtectedRoute>} />
<Route path="/logistics/routes" element={<ProtectedRoute><MainSystemLayout><LogisticsRoutes /></MainSystemLayout></ProtectedRoute>} />
<Route path="/logistics/vehicles" element={<ProtectedRoute><MainSystemLayout><LogisticsVehicles /></MainSystemLayout></ProtectedRoute>} />
<Route path="/logistics/driver" element={<ProtectedRoute><LogisticsDriverView /></ProtectedRoute>} />
```

---

### GPS-spårning: Realtid med Supabase

**Förare (mobil) → Supabase:**
```typescript
// useDriverGPS.ts - körs var 30:e sekund
const sendPosition = async (vehicleId: string) => {
  const pos = await navigator.geolocation.getCurrentPosition();
  await supabase.functions.invoke('track-vehicle-gps', {
    body: {
      vehicle_id: vehicleId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      heading: pos.coords.heading,
      speed_kmh: (pos.coords.speed || 0) * 3.6
    }
  });
};
```

**Kontoret (desktop) ← Supabase Realtime:**
```typescript
// useVehicleTracking.ts
useEffect(() => {
  const channel = supabase
    .channel('vehicle-positions')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'vehicles',
      filter: `is_active=eq.true`
    }, (payload) => {
      setVehicles(prev => prev.map(v => 
        v.id === payload.new.id 
          ? { ...v, current_lat: payload.new.current_lat, current_lng: payload.new.current_lng }
          : v
      ));
    })
    .subscribe();
    
  return () => supabase.removeChannel(channel);
}, []);
```

---

### Google Maps API-nyckel

För att ruttoptimering ska fungera behövs en **Google Maps API-nyckel** med följande aktiverade APIs:
- Routes API (eller Directions API)
- Maps JavaScript API (för eventuell framtida kartrendereing)

Jag kommer be dig lägga till denna som en Supabase-hemlighet: `GOOGLE_MAPS_API_KEY`

---

## UI-skisser

### Transportplanering (Veckovy)
```text
┌────────────────────────────────────────────────────────────────────────┐
│  Transportplanering                               [ < Vecka 6 > ]      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │ BIL 1 (Volvo)   │  │ BIL 2 (Sprinter)│  │ BIL 3 (Släp)    │        │
│  │ ABC 123         │  │ DEF 456         │  │ GHI 789         │        │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤        │
│  │ Mån 5/2         │  │ Mån 5/2         │  │ Mån 5/2         │        │
│  │ ▪ Kund A        │  │ ▪ Kund D        │  │                 │        │
│  │ ▪ Kund B        │  │                 │  │   (Tom)         │        │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤        │
│  │ Vikt: ████░░ 75%│  │ Vikt: ██░░░░ 40%│  │ Vikt: ░░░░░░ 0% │        │
│  │ Vol:  ███░░░ 60%│  │ Vol:  █░░░░░ 20%│  │ Vol:  ░░░░░░ 0% │        │
│  │ [GPS: 🟢 Live]  │  │ [GPS: 🟡 10m]   │  │ [GPS: 🔴 Ingen] │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
│                                                                        │
│  ────────────────────────────────────────────────────────────          │
│  Otilldelade bokningar (Mån 5/2):                                      │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │ ▪ Firma F - 3 produkter - 250kg/2m³                        │       │
│  │ ▪ Firma G - 1 produkt - 50kg/0.5m³                         │       │
│  └────────────────────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────────────────────┘
```

### Ruttplanering med GPS
```text
┌────────────────────────────────────────────────────────────────────────┐
│  Ruttplanering - Bil 1 (Mån 5/2)          [⚡ Optimera] [📍 Google Maps]│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────┐   ┌───────────────────────────────────────────┐ │
│  │  STOPPLISTA      │   │                                           │ │
│  │                  │   │        ┌──────────────────────────────┐   │ │
│  │  1. ≡ Kund A     │   │        │                              │   │ │
│  │     ✅ Levererad │   │        │      [●]═══════[2]           │   │ │
│  │                  │   │        │       ║                      │   │ │
│  │  2. ≡ Kund B     │   │        │  [🚐]►║    (bil live)        │   │ │
│  │     🔄 På väg    │   │        │       ║                      │   │ │
│  │     ETA: 10:35   │   │        │      [3]                     │   │ │
│  │                  │   │        │                              │   │ │
│  │  3. ≡ Kund C     │   │        └──────────────────────────────┘   │ │
│  │     ⏳ Väntar    │   │                                           │ │
│  │                  │   │                                           │ │
│  └──────────────────┘   └───────────────────────────────────────────┘ │
│                                                                        │
│  Total sträcka: 45 km | Beräknad tid: 1h 20min | Status: På väg       │
└────────────────────────────────────────────────────────────────────────┘
```

### Förarvy (Mobil)
```text
┌─────────────────────────────────┐
│  🚚 Bil 1 - Måndag 5 Feb        │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 1. Kund A                 │  │
│  │    Storgatan 1, Stockholm │  │
│  │    ✅ Levererad 09:45     │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 2. Kund B         [NÄSTA] │  │
│  │    Lillvägen 5, Solna     │  │
│  │    ETA: 10:35             │  │
│  │                           │  │
│  │  [📍 Navigera] [✅ Klar]  │  │
│  └───────────────────────────┘  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ 3. Kund C                 │  │
│  │    Industrivägen 22       │  │
│  │    ⏳ Väntar              │  │
│  └───────────────────────────┘  │
│                                 │
│  ─────────────────────────────  │
│  📡 GPS: Aktiv (uppdaterad 5s)  │
│  [Pausa GPS] [Avsluta dag]      │
└─────────────────────────────────┘
```

---

## Implementation - Stegordning

1. **Databas**: Skapa migrationer för `vehicles`, `transport_assignments`, `vehicle_gps_history`
2. **Edge Functions**: Skapa `optimize-logistics-route` och `track-vehicle-gps`
3. **API-nyckel**: Be dig lägga till `GOOGLE_MAPS_API_KEY` som hemlighet
4. **Fordonshantering**: CRUD-sida för att registrera/redigera fordon
5. **Transportplanering**: Veckobaserad vy med drag-drop och kapacitetsmätare
6. **Ruttplanering**: Karta + draggable lista + optimeringsknapp
7. **GPS-spårning**: Realtime-uppdateringar på kartan
8. **Förarvy**: Mobilanpassad vy med GPS-sändning och leveransmarkering
9. **Navigation**: Uppdatera sidmeny och routing

---

## Beroenden

- **Befintlig Mapbox-integration** - Återanvänds för kartor
- **Google Routes API** - Ny integration för ruttoptimering
- **Supabase Realtime** - Används för live GPS-uppdateringar
- **react-dnd** (redan installerat) - För drag-and-drop

---

## Kostnad och API-användning

**Google Routes API:**
- Prissättning: ~$0.005-0.01 per request (beroende på komplexitet)
- Uppskattad användning: ~50-100 optimeringar/månad = ~$0.50-1/månad

**GPS-uppdateringar:**
- Sparas i `vehicle_gps_history` - kan arkiveras efter 30 dagar
- Realtid via Supabase Realtime - ingår i Lovable Cloud
