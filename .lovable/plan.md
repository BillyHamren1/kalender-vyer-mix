

## Avvikelsevarningar i tidrapporter

### Översikt
Bygga ett anomalidetekteringssystem som flaggar misstänkta avvikelser direkt i tidrapportvyn per personal, med en klickbar dialog som visar detaljer.

### Anomalityper

| # | Typ | Logik |
|---|-----|-------|
| 1 | **Teamtidavvikelse** | Om 2+ personer i samma team/dag har start- eller sluttider som skiljer sig >1h → flagga |
| 2 | **Orimlig restid** | Om travel_time_logs.hours_worked > 2× den förväntade restiden (beräknad via from/to GPS-avstånd, ~1min/km) eller generellt >1.5h → flagga |
| 3 | **Tidsluckor** | Om det finns >1h gap mellan sluttid på ett jobb och starttid på nästa (exkl resa) samma dag → flagga |
| 4 | **Saknad tidrapport** | Personal var tilldelad (booking_staff_assignments) en dag men har ingen time_report → flagga |
| 5 | **Extremt lång arbetsdag** | Total arbetstid (inkl resa) >12h en dag → flagga |
| 6 | **Överlappande tider** | Start/slut-tider överlappar mellan två rapporter samma dag → flagga |

### UI-design

**Flaggor på rader i StaffTimeReportDetail:**
- En liten `AlertTriangle`-ikon (orange/röd) visas bredvid raden/datumet som har avvikelse
- Antal avvikelser visas som en badge i summary-sektionen: "⚠ 3 avvikelser"

**Avvikelsedialog (klickbar):**
```text
┌──────────────────────────────────────┐
│  ⚠ Avvikelser — mån 14 apr          │
│                                      │
│  🔴 Teamtidavvikelse                │
│  Du startade 08:00, men Erik och     │
│  Anna startade 06:30 (Team 3)       │
│                                      │
│  🟡 Orimlig restid                  │
│  Resa till Kund AB tog 1:15         │
│  Förväntat: ~25 min (32 km)         │
│                                      │
│  📍 Reserutt denna dag              │
│  08:00 Lager → Kund AB (0:25)       │
│  15:10 Kund AB → Kund CD (0:40)     │
│  20:15 Kund CD → Hem (0:30)         │
│                                      │
│                    [Stäng]           │
└──────────────────────────────────────┘
```

### Teknisk implementation

**Nya filer:**
- `src/lib/timeReportAnomalies.ts` — Ren logik-modul som tar in rapporter, reseloggar och teamdata, returnerar anomalier per dag
- `src/components/staff/AnomalyDialog.tsx` — Dialog som visar detaljer + reserutt för vald dag

**Ändringar i befintliga filer:**

| Fil | Ändring |
|-----|---------|
| `StaffTimeReportDetail.tsx` | Utöka queryn att hämta teammedlemmars rapporter (via `booking_staff_assignments` → `time_reports`) + GPS-avstånd från travel_time_logs. Kör anomalydetektering. Visa flagga per rad + summabadge. |
| `StaffTimeReportDetail.tsx` | Lägg till state för vald anomalidag + rendera AnomalyDialog |

**Dataflöde för teamavvikelse:**
1. Hämta personalens `booking_staff_assignments` för månaden → vet vilka team/datum
2. Hämta alla `time_reports` för samma `booking_id + assignment_date` → jämför start/sluttider
3. Om >1h skillnad → generera anomali

**Dataflöde för restidsavvikelse:**
1. Har redan `travel_time_logs` med `from_lat/lng` och `to_lat/lng`
2. Beräkna fågelvägsavstånd (Haversine) → uppskattad tid (~1.5 min/km)
3. Om faktisk tid > 2× uppskattad → flagga

### Avgränsning
- Anomalierna beräknas client-side från redan hämtad data + en extra teamquery
- Ingen ny tabell behövs
- Flaggorna är informativa, inte blockerande

