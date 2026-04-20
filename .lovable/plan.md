

## Problem

Det finns två mobil-shells:
- `MobileAppLayout` (web-läge `/m/*` via `App.tsx`) — har assistenten, ankomst-prompt, stale-dialog, travel-banner, global timer-banner.
- `TimeAppLayout` (native EventFlow Time-shell, `VITE_APP_MODE='time'`) — har **inget** av detta. Bara header-slot + bottom nav.

På riktiga mobilappen kör du `TimeAppShell` → `TimeAppLayout` → därför är assistenten tyst.

## Fix: lyft alla globala mobil-flöden till en gemensam wrapper

### Vad jag gör

**1. Skapa `src/components/mobile-app/MobileGlobalOverlays.tsx`**
En ren komponent som äger ALLA globala mobil-flöden:
- `useBackgroundLocationReporter`
- `useTravelDetection` + `TravelBanner` + `TravelCompletedDialog`
- `useArrivalPrompt` + `ArrivalPromptDialog`
- `useTimerReconciliation` + `StaleTimerDialog`
- `useWorkDayAssistant` + `WorkDayAssistant`
- `GlobalActiveTimerBanner`
- inbox-prefetch

Logiken flyttas 1:1 ur dagens `MobileAppLayout` (med samma `isQuiet`-koppling och samma handlers — ingen beteendeförändring).

**2. Montera den i `TimeAppLayout`**
`TimeAppLayout` renderar `<MobileGlobalOverlays />` precis som `MobileAppLayout` gör idag. Banners/timer-banner placeras överst i scroll-containern; dialoger renderas på root-nivå (de portar sig själva via Radix).

**3. Förenkla `MobileAppLayout`**
`MobileAppLayout` ersätter sin lokala kopia av samma kod med `<MobileGlobalOverlays />`. Då finns det bara EN sanning — ingen risk att shells driftar isär igen.

### Varför detta och inte "kopiera in koden i TimeAppLayout"
- En shared komponent garanterar att framtida ändringar (nya assistent-prompts, nya dialoger) automatiskt syns i båda shells.
- Inga nya hooks, inget nytt context. Bara en flytt + en ny montering.

### Berörda filer
- `src/components/mobile-app/MobileGlobalOverlays.tsx` (ny — flyttar nuvarande logik från MobileAppLayout)
- `src/shells/time/TimeAppLayout.tsx` (monterar `<MobileGlobalOverlays />` + tar bort sin egen `useBackgroundLocationReporter` så den inte dubbelmonteras)
- `src/components/mobile-app/MobileAppLayout.tsx` (ersätter lokal kod med `<MobileGlobalOverlays />`)

### Inte i denna ändring
- Ingen ändring av `useWorkDayAssistant`-regler eller cooldowns.
- Inga nya prompttyper.
- Ingen ändring av `MobileBottomNav` eller header-slot.
- Ingen DB- eller edge-funktion-ändring.

### QA efter implementation
1. Logga in i Time-appen (`VITE_APP_MODE='time'`) — kontrollera att `GlobalActiveTimerBanner` syns när timer är igång.
2. Gå in i geofence till Lager → `ArrivalPromptDialog` ska poppa (inkl. "Starta från ankomsttid"-knappen).
3. Lämna geofence och vänta — `WorkDayAssistant` ska kunna trigga `activity_leave` / `last_workplace_for_day`.
4. Stale timer (timer > 24h gammal från servern) → `StaleTimerDialog` ska poppa.
5. Kör en faktisk resa → `TravelBanner` ska visas, vid stopp → `TravelCompletedDialog`.
6. Kontrollera att inga dialoger dubbelmonteras (web-`/m/*` ska inte längre rendera två kopior).

