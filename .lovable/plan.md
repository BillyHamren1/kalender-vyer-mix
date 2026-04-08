

## Plan: Implementera Capacitor Background Geolocation

### Bakgrund
Nuvarande `useBackgroundLocationReporter` använder `@capacitor/geolocation` som bara fungerar när appen är i förgrunden. iOS och Android dödar bakgrundsprocesser, vilket gör att GPS-rapporteringen tystnar efter kort tid. Därför syns personalen som "offline" och ingen tid loggas i `location_time_entries`.

### Lösning
Installera **`@capgo/background-geolocation`** — ett Capacitor-plugin som fortsätter spåra position även när appen är minimerad eller skärmen är låst. Det är gratis, aktivt underhållet och kompatibelt med Capacitor 8.

### Steg

**1. Installera pluginet**
- Lägg till `@capgo/background-geolocation` i `package.json`

**2. Uppdatera `useBackgroundLocationReporter.ts`**
- Ersätt `@capacitor/geolocation` med `BackgroundGeolocation.start()` på native-plattformar
- Pluginet ger en callback vid varje positionsändring, även i bakgrunden
- Behåll web-fallback med `navigator.geolocation.watchPosition`
- Behåll 30-sekunders throttling via `lastReportRef`

**3. iOS-konfiguration (Info.plist)**
- `NSLocationAlwaysAndWhenInUseUsageDescription` finns redan
- Säkerställ att `UIBackgroundModes` inkluderar `location`

**4. Android-konfiguration**
- Pluginet hanterar foreground service automatiskt
- Bakgrundsmeddelande visas i notifikationsfältet

### Teknisk detalj

```typescript
// Ny native-implementering i useBackgroundLocationReporter
import { BackgroundGeolocation } from "@capgo/background-geolocation";

BackgroundGeolocation.start(
  {
    backgroundMessage: "EventFlow spårar din position",
    backgroundTitle: "EventFlow Time",
    requestPermissions: true,
    stale: false,
    distanceFilter: 20, // meters
  },
  (location, error) => {
    if (location) {
      reportPosition(location.latitude, location.longitude, 
                     location.accuracy, location.speed);
    }
  }
);

// Cleanup
BackgroundGeolocation.stop();
```

### Vad användaren behöver göra efter implementation
- Dra ner koden (`git pull`)
- Kör `npm install && npx cap sync`
- Bygg och installera appen på nytt på personalens telefoner

