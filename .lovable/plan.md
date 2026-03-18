

# Förbättra GPS-resedetektering och automatisk tidrapportering

## Problem

1. **GPS `speed` är opålitlig på iOS** — `watchPosition` returnerar ofta `speed: null` på iOS Safari/WKWebView, vilket gör att rörelsedetektering aldrig triggas
2. **Resor loggas men rapporteras aldrig som arbetstid** — `travel_time_logs` skapas, men ingen koppling till tidrapporter eller projekt
3. **Ingen hantering av destinationer utan projekt** — om man reser till en plats utan bokning finns inget sätt att logga tiden

## Plan

### 1. Gör rörelsedetektering robust (fungerar på iOS)

**Fil:** `src/hooks/useTravelDetection.ts`

Istället för att enbart förlita sig på `speed`-fältet (som iOS ofta ger `null`), beräkna hastighet genom att jämföra positionsändringar:

- Spara senaste position + timestamp
- Vid varje ny GPS-position: beräkna distans (haversine) / tid = hastighet
- Använd denna beräknade hastighet som fallback när `speed` är `null`
- Minska `START_DEBOUNCE_MS` från 30s till 15s för snabbare detektering
- Lägg till GPS-accuracy-filter: ignorera positioner med `accuracy > 50m`

### 2. Skapa automatisk tidrapport vid avslutad resa

**Fil:** `src/hooks/useTravelDetection.ts` + `supabase/functions/mobile-app-api/index.ts`

När en resa stoppas (automatiskt eller manuellt):

- Edge function `handleStopTravelLog` skapar automatiskt en tidrapport kopplad till närmaste bokning (om destination matchar en bokningsadress inom 300m)
- Om ingen bokning matchar: skapa ett "ad-hoc projekt" i `travel_time_logs` med destinationsadressen som namn
- Lägg till `destination_booking_id` och `manual_project_name` i `travel_time_logs`

### 3. Lägg till kommentarsfält på avslutad resa

**Fil:** Ny komponent `src/components/mobile-app/TravelCompletedDialog.tsx`

När en resa stoppas och destinationen inte matchar ett projekt:

- Visa en dialog/bottom-sheet med:
  - Adressnamn (från reverse geocoding)
  - Restid (automatiskt beräknad)
  - Kommentarsfält: "Vad gjorde du här?"
- Användaren bekräftar → spara `description` + `manual_project_name` i `travel_time_logs`

### 4. DB-migration: utöka `travel_time_logs`

Lägg till kolumner:
- `destination_booking_id TEXT` — koppling till bokning om matchad
- `manual_project_name TEXT` — adressnamn för platser utan projekt

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/hooks/useTravelDetection.ts` | Distansbaserad hastighetsfallback, accuracy-filter, dialog-trigger |
| `src/components/mobile-app/TravelCompletedDialog.tsx` | Ny dialog för resa utan projekt |
| `src/pages/mobile/MobileJobs.tsx` | Visa TravelCompletedDialog, koppla till stopTravel |
| `supabase/functions/mobile-app-api/index.ts` | `handleStopTravelLog` — matcha destination mot bokning, spara manual_project_name |
| DB-migration | Lägg till `destination_booking_id`, `manual_project_name` i `travel_time_logs` |

