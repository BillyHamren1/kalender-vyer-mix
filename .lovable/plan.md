

# Personal Dashboard — Karta, Meddelanden och Jobbaktivitet

## Sammanfattning

Implementering av `/staff-dashboard` med karta, meddelandefeed och jobbaktivitetsfeed. Inkluderar ny DB-tabell, edge function-utökning, mobilapp-meddelandefunktion och dashboardsida med tre paneler.

## Steg

### 1. DB Migration — `staff_messages` tabell
Skapa tabell med RLS och lägg till i realtime-publikation.

### 2. Edge Function — `send_message` action
Lägg till ny case i `mobile-app-api/index.ts` switch-sats (rad 113-143). Hämtar staff-namn, insertar i `staff_messages` med `organization_id`.

### 3. Mobilapp — Meddelandefunktion
- Ny metod `sendMessage()` i `mobileApiService.ts`
- Ny `SendMessageDialog.tsx` med textfält och typ-väljare (text/brådskande)
- Meddelandeknapp i `MobileProfile.tsx` (diskret placering i profilsidan)

### 4. Dashboard Service & Hook
- `staffDashboardService.ts`: `fetchStaffMessages()`, `fetchJobActivity()` (kommentarer + filer + tidrapporter senaste 24h), `markMessageAsRead()`
- `useStaffDashboard.ts`: React Query + `useRealtimeInvalidation` på `staff_messages`, `project_comments`, `project_files`, `time_reports`

### 5. Dashboard UI-komponenter
- `StaffMapView.tsx`: Mapbox-karta med personalmarkörer (återanvänder `fetchStaffLocations()` + Mapbox-token via `supabase.functions.invoke('mapbox-token')`). Satellite-streets stil, Sverige-centrerad, auto-zoom till markörer.
- `MessagesFeed.tsx`: Realtidsfeed med oläst-markering, markera som läst, tidsstämplar
- `JobActivityFeed.tsx`: Kronologisk feed av kommentarer, bilder, tidrapporter med ikoner per typ

### 6. Huvudsida `StaffDashboard.tsx`
Tre-kolumns layout: Meddelanden (vänster) | Karta (center, stor) | Jobbaktivitet (höger)

### 7. Routing & Navigation
- Ny route i `App.tsx` rad ~175: `/staff-dashboard` → `StaffDashboard` i `MainSystemLayout` + `ProtectedRoute`
- Ny menypost i `Sidebar3D.tsx` navigationItems (rad 22-41): "Personalöversikt" med `Users`-ikon under "Personal"

## Filer

| Fil | Åtgärd |
|---|---|
| DB migration | Ny tabell `staff_messages` |
| `supabase/functions/mobile-app-api/index.ts` | Ny `send_message` handler |
| `src/services/mobileApiService.ts` | Ny `sendMessage()` |
| `src/components/mobile-app/SendMessageDialog.tsx` | Ny |
| `src/pages/mobile/MobileProfile.tsx` | Ändrad (meddelandeknapp) |
| `src/services/staffDashboardService.ts` | Ny |
| `src/hooks/useStaffDashboard.ts` | Ny |
| `src/components/staff-dashboard/StaffMapView.tsx` | Ny |
| `src/components/staff-dashboard/MessagesFeed.tsx` | Ny |
| `src/components/staff-dashboard/JobActivityFeed.tsx` | Ny |
| `src/pages/StaffDashboard.tsx` | Ny |
| `src/App.tsx` | Ändrad (route) |
| `src/components/Sidebar3D.tsx` | Ändrad (menypost) |

