

# Tidrapporteringsapp med automatisk GPS-geofencing

## Oversikt
En helt isolerad mobilapp for faltpersonal som lever pa `/m/`-rutter med eget autentiseringssystem (`staff_accounts`), egen layout, och **automatisk tidrapportering via GPS-geofencing**. Nar personalen kommer inom 150 meter fran arbetsplatsen startar tidrapporten automatiskt -- nar de lamnar omradet avslutas den.

## Geofencing-koncept

```text
+--------------------------------------------------+
|  Bokningens adress (delivery_lat/lng)             |
|                                                   |
|      150m radie                                   |
|       +--------+                                  |
|      /          \      Utanfor = Ingen aktiv      |
|     |   GEOFENCE |     tidrapport                 |
|     |    ZONE    |                                 |
|      \          /                                  |
|       +--------+                                  |
|                                                   |
|  [Personal GPS] ---> Innanfor = Auto-start timer  |
|                 ---> Lamnar  = Auto-stopp + prompt |
+--------------------------------------------------+
```

**Flode:**
1. Appen hamtar dagens bokningar med `delivery_latitude` och `delivery_longitude` fran `mobile-app-api`
2. `navigator.geolocation.watchPosition()` overvakar GPS-positionen kontinuerligt
3. Haversine-formeln beraknar avstand till varje boknings koordinater
4. Innanfor 150m: appen visar en bekraftelsedialog ("Du ar pa plats for [Klient]. Starta timer?") och startar vid bekraftelse
5. Lamnar 150m: appen visar prompt ("Du har lamnat [Klient]. Vill du avsluta tidrapporten?")
6. Anvandaren kan alltid starta/stoppa manuellt -- geofencing ar en hjalp, inte ett tvang

## Design
Inspirerad av de uppladdade skarmbilderna men med hogre visuell kvalitet:
- Teal-gradientfargad header per vy
- Vita, mjukt rundade kort med subtila skuggor
- Bottom navigation med 4 flikar: Jobb, Rapportera, Utlagg, Profil
- Mobiloptimerad typografi och touch-targets (minst 44px)
- GPS-statusindikator i headern (gron puls = aktiv tracking)
- Helt frikopplad fran desktop-systemets navigation, sidebar och AuthContext

## Appstruktur

```text
/m/login        - Inloggning (staff_accounts)
/m/             - Jobblista (hem) + GPS-overvakning
/m/job/:id      - Jobbdetalj med flikar (Info, Team, Bilder, Kostnader, Tid)
/m/report       - Tidrapportering (aktiva jobb + historik)
/m/expenses     - Utlagg (skapa + lista)
/m/profile      - Profilvy + utloggning + GPS-installningar
```

## Funktionella krav

### 1. Inloggning (`/m/login`)
- Eget auth-system mot `mobile-app-api` (action: `login`)
- Sparar token + personalinfo i localStorage (`eventflow-mobile-token`)
- Ingen koppling till Supabase Auth / AuthContext
- EventFlow-logga med mobilanpassad design

### 2. Jobblista med GPS (`/m/`)
- Listar tilldelade bokningar via `get_bookings`
- Kort med: klient, bokningsnummer, riggdatum, adress
- Sorterade efter datum (narmast forst)
- Jobbtyp-badges (Rigg, Event, Nedmontering)
- **GPS-overvakning startar har** -- visar avstand till narmaste jobb
- Gron pulsindikator nar GPS ar aktiv
- Automatisk geofence-check mot alla dagens bokningar som har koordinater

### 3. Jobbdetalj (`/m/job/:id`)
- Teal-gradient header med klientnamn + bokningsnummer
- **Aktiv timer-display** om geofence har triggat for detta jobb
- Manuell "Starta/Stoppa timer"-knapp
- Adresskort med "Navigera"-knapp (oppnar Google Maps med koordinaterna)
- Fliknavigering: **Info** | **Team** | **Bilder** | **Kostnader** | **Tid**

### 4. Tidrapportering (`/m/report`)
- Visar aktiv timer langst upp (om geofence kors)
- Snabblista over aktuella jobb att rapportera pa
- Formular: datum, start/slut-tid, rast, overtid, beskrivning
- Historik over tidigare rapporter

### 5. Utlagg (`/m/expenses`)
- Formular: belopp, beskrivning, leverantor, kategori
- Kamerafunktion for kvittofoto (base64-upload)
- Lista over tidigare utlagg

### 6. Profil (`/m/profile`)
- Personalens namn, roll, kontaktinfo
- **GPS-installningar**: sla av/pa automatisk geofencing, justera radie
- Logga ut-knapp

## Teknisk plan

### Nya filer att skapa

**Infrastruktur:**
- `src/contexts/MobileAuthContext.tsx` -- Eget auth-context med token i localStorage, helt frikopplat fran AuthContext
- `src/services/mobileApiService.ts` -- API-klient som wrappar alla mobile-app-api-anrop
- `src/hooks/useGeofencing.ts` -- **Karn-hook for GPS-overvakning och geofence-logik**
- `src/components/mobile-app/MobileAppLayout.tsx` -- Layout med bottom nav
- `src/components/mobile-app/MobileBottomNav.tsx` -- Bottom navigation
- `src/components/mobile-app/MobileProtectedRoute.tsx` -- Skyddar /m/-rutter
- `src/components/mobile-app/GeofenceStatusBar.tsx` -- GPS-statusvisning i headern
- `src/components/mobile-app/GeofencePrompt.tsx` -- Dialog for auto-start/stopp

**Sidor:**
- `src/pages/mobile/MobileLogin.tsx`
- `src/pages/mobile/MobileJobs.tsx`
- `src/pages/mobile/MobileJobDetail.tsx`
- `src/pages/mobile/MobileTimeReport.tsx`
- `src/pages/mobile/MobileExpenses.tsx`
- `src/pages/mobile/MobileProfile.tsx`

**Jobbdetalj-flikar:**
- `src/components/mobile-app/job-tabs/JobInfoTab.tsx`
- `src/components/mobile-app/job-tabs/JobTeamTab.tsx`
- `src/components/mobile-app/job-tabs/JobPhotosTab.tsx`
- `src/components/mobile-app/job-tabs/JobCostsTab.tsx`
- `src/components/mobile-app/job-tabs/JobTimeTab.tsx`

### useGeofencing-hookens logik (karnkomponenten)

```text
useGeofencing(bookings: Booking[]) {
  // State
  - activeTimers: Map<bookingId, { startTime, isAutoStarted }>
  - userPosition: { lat, lng } | null
  - isTracking: boolean
  - nearbyBookings: Booking[] (inom 150m)

  // GPS-overvakning
  - Anvander navigator.geolocation.watchPosition()
  - Hog precision (enableHighAccuracy: true)
  - Uppdateringsintervall: var 10:e sekund

  // Geofence-check (kors vid varje GPS-uppdatering)
  - For varje bokning med delivery_latitude/longitude:
    - Berakna avstand med Haversine-formeln
    - Om avstand < 150m OCH ingen aktiv timer: trigga "ENTER"-event
    - Om avstand > 200m OCH aktiv timer finns: trigga "EXIT"-event
    - (200m for exit = hystereszon for att undvika flapping)

  // Triggers
  - ENTER: Visa GeofencePrompt med "Du ar pa plats for [Klient]"
  - EXIT: Visa GeofencePrompt med "Lamnar [Klient] - avsluta timer?"
  
  // Haversine-formeln (samma som i track-vehicle-gps)
  - Kopierad fran befintlig implementation i supabase/functions/track-vehicle-gps/
  
  // Persistens
  - Aktiva timers sparas i localStorage for att overleva sidladdning
  - Nar timer stoppas: anropar mobileApiService.createTimeReport()
}
```

### Filer att andra

**`src/App.tsx`** -- Lagg till /m/-rutter utanfor AuthProvider:

```text
{/* Mobile Staff App - Separat system */}
<Route path="/m/login" element={<MobileLogin />} />
<Route path="/m" element={<MobileProtectedRoute><MobileAppLayout><MobileJobs /></MobileAppLayout></MobileProtectedRoute>} />
<Route path="/m/job/:id" element={<MobileProtectedRoute><MobileAppLayout><MobileJobDetail /></MobileAppLayout></MobileProtectedRoute>} />
<Route path="/m/report" element={<MobileProtectedRoute><MobileAppLayout><MobileTimeReport /></MobileAppLayout></MobileProtectedRoute>} />
<Route path="/m/expenses" element={<MobileProtectedRoute><MobileAppLayout><MobileExpenses /></MobileAppLayout></MobileProtectedRoute>} />
<Route path="/m/profile" element={<MobileProtectedRoute><MobileAppLayout><MobileProfile /></MobileAppLayout></MobileProtectedRoute>} />
```

### Isolering fran huvudsystemet
- Inga importer fran AuthContext, ProtectedRoute eller MainSystemLayout
- Eget MobileAuthContext med token i localStorage
- Inga lankar till /dashboard, /calendar etc.
- Bottom nav visar bara mobilappens 4 flikar
- Desktop-systemet vet inte om att /m/-rutterna finns

### API-kommunikation
All kommunikation gar via `mobileApiService.ts` som:
- POSTar till `/functions/v1/mobile-app-api`
- Bifogar token fran localStorage
- Hanterar 401-svar genom att rensa token och redirecta till `/m/login`

### Befintlig data som anvands for geofencing
- `delivery_latitude` och `delivery_longitude` returneras redan av `get_bookings`-anropet i mobile-app-api (rad 249-250)
- Haversine-formeln finns redan implementerad i `track-vehicle-gps` (rad 18-27) -- ateranvands i klient-hook
- `create_time_report` validerar att personalen ar tilldelad bokningen innan rapporten skapas

## Resultat
Faltpersonalen far en snabb, snygg mobilapp dar tidrapporten startar automatiskt nar de ankommar till arbetsplatsen -- helt baserat pa GPS-koordinater som redan finns i systemet. Manuell start/stopp finns alltid som alternativ.

