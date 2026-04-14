

## Problem

`useTravelDetection` körs bara på `MobileJobs`-sidan (och på `MobileProfile` utan GPS-data). När användaren navigerar bort avmonteras hooken och travel detection slutar fungera.

Samtidigt kör `useBackgroundLocationReporter` redan i `MobileAppLayout` med kontinuerlig GPS — den har exakt den data som behövs, men exponerar den inte.

## Lösning — minsta möjliga ändring

Återanvänd befintlig GPS-källa från `useBackgroundLocationReporter` istället för att skapa en ny hook.

### Ändringar

**1. `src/hooks/useBackgroundLocationReporter.ts`** — Exponera senaste position

- Lägg till en `useState<GpsPosition | null>` (importera `GpsPosition` från `useGeofencing`)
- Uppdatera positionen i samma callback som redan anropas vid varje GPS-uppdatering (både native och web)
- Returnera `{ latestPosition }` istället för `void`

**2. `src/components/mobile-app/MobileAppLayout.tsx`** — Kör travel detection globalt

- Ta emot `latestPosition` från `useBackgroundLocationReporter`
- Kör `useTravelDetection(!!staff, latestPosition)` i layouten
- Rendera `TravelBanner` och `TravelCompletedDialog` direkt i layouten (ovanför `{children}`)

**3. `src/pages/mobile/MobileJobs.tsx`** — Ta bort lokal travel detection

- Ta bort `useTravelDetection`-anropet
- Ta bort `TravelBanner` och `TravelCompletedDialog` (de renderas nu i layouten)
- Behåll `useGeofencing` (den behövs fortfarande för geofencing/timers)

**4. `src/pages/mobile/MobileProfile.tsx`** — Ta bort lokal travel detection

- Ta bort `useTravelDetection`-anropet
- Om travel state behövs för visning i profilen, antingen exponera via enkel context eller ta bort den visningen (det fungerar ändå inte idag)

### Vad som bevaras

- All travel detection-logik (trösklar, debounce, start/stop, API-anrop)
- Geofencing per sida (oförändrat)
- Background location reporting (samma hook, bara utökad med en return-value)
- TravelBanner och TravelCompletedDialog (samma komponenter, bara flyttade till layouten)
- Befintlig timer-logik och stoppflöde

### Filer som ändras

| Fil | Typ |
|-----|-----|
| `useBackgroundLocationReporter.ts` | Utöka — exponera position |
| `MobileAppLayout.tsx` | Utöka — travel detection + UI |
| `MobileJobs.tsx` | Rensa — ta bort lokal travel |
| `MobileProfile.tsx` | Rensa — ta bort lokal travel |

