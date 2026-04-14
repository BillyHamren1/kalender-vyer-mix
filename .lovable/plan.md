
Mest sannolika orsaken är att sparandet delvis fungerar rätt, men visningen får det att se fel ut.

## Vad koden visar just nu
- När en projekttimer stoppas från mobilen skickas:
  - `booking_id: "project-{largeProjectId}"`
  - `large_project_id: timer.largeProjectId`
- I edge-funktionen `handleCreateTimeReport` översätts detta till:
  - `large_project_id = projektets id`
  - `booking_id = första länkade delbokningen` för bakåtkompatibilitet

Det betyder:
- databasen kan mycket väl spara rapporten på projektet via `large_project_id`
- men samtidigt sätts `booking_id` till en enskild bokning
- och listan på `/m/report` hämtar idag bara `bookings.client`, så den visar bokningsnamnet och får det att se ut som att tiden sparats på fel nivå

## Trolig buggbild
Det här är sannolikt en kombination av två problem:

1. Visningsbugg
- `get_time_reports` returnerar inte projektinfo
- mobilens lista visar bara `r.bookings?.client`
- därför visas en delbokning även när `large_project_id` är satt

2. Manuell ny tidrapport är fortfarande bokningsstyrd
- formuläret i `MobileTimeReport.tsx` låter användaren välja en vanlig bokning
- stora projekt visas inte som projektval i formuläret
- där kan tid faktiskt fortfarande sparas mot en enskild bokning om användaren skapar rapport manuellt istället för via projekttimer

## Plan
### 1. Bekräfta datan i edge-funktionen och databasen
- Kontrollera ett nyligen sparat exempel för Swedish Game Fair
- Verifiera om raden i `time_reports` har:
  - korrekt `large_project_id`
  - ett fallback-`booking_id` till en delbokning
- Detta avgör om buggen bara är visning eller även felaktigt sparande

### 2. Uppgradera `get_time_reports` till projektnivå
**Fil:** `supabase/functions/mobile-app-api/index.ts`

- Utöka `handleGetTimeReports` så att den även returnerar:
  - `large_project_id`
  - projektets namn från `large_projects`
- Om en rapport har `large_project_id` ska API-svaret innehålla projektlabel som förstahandskälla för visning

Exempel på önskat resultat:
```text
time_report
 ├─ large_project_id = xxx
 ├─ large_project = Swedish Game Fair
 └─ booking = fallback-underbokning
```

### 3. Uppdatera mobiltyperna
**Fil:** `src/services/mobileApiService.ts`

- Utöka `MobileTimeReport` med:
  - `large_project_id`
  - ev. `large_project` / `large_project_name`
- Så frontend kan skilja projektrapporter från vanliga bokningsrapporter

### 4. Visa projektnamn före bokningsnamn på tidrapportsidan
**Fil:** `src/pages/mobile/MobileTimeReport.tsx`

- I listan “Mina tidrapporter”:
  - visa projektnamn om `large_project_id` finns
  - annars visa bokningsnamn som idag
- Justera även underraden/beskrivningen så användaren tydligt ser att rapporten tillhör projektet, inte en underbokning

### 5. Gör “Skapa ny tidrapport” projektsäker
**Fil:** `src/pages/mobile/MobileTimeReport.tsx`

- Ändra jobbväljaren så stora projekt presenteras som ett projektval, inte som enskilda delbokningar
- När användaren väljer ett stort projekt ska formuläret skicka:
  - `booking_id: "project-{id}"`
  - `large_project_id: id`
- Vanliga jobb fortsätter fungera som idag

### 6. Säkerställ konsekvens i hela mobilflödet
Berörda filer:
- `src/pages/mobile/MobileJobDetail.tsx`
- ev. `src/pages/mobile/MobileProjectDetail.tsx`

- Säkerställ att alla projektstart/stopp-flöden använder samma projektnyckel och samma sparlogik
- Undvik att någon vy råkar skapa rapport direkt mot en delbokning när användaren egentligen är inne i ett stort projekt

## Förväntat resultat efter ändringen
- Stoppar du tid på “Swedish Game Fair” ska rapporten synas som “Swedish Game Fair”
- Under huven kan `booking_id` fortfarande vara en fallback för kompatibilitet
- Men projektkopplingen ska vara tydlig och korrekt via `large_project_id`
- Manuell “Skapa ny tidrapport” ska också kunna spara på projektnivå, inte bara timerstopp

## Tekniska detaljer
Berörda filer:
- `supabase/functions/mobile-app-api/index.ts`
- `src/services/mobileApiService.ts`
- `src/pages/mobile/MobileTimeReport.tsx`
- eventuellt `src/pages/mobile/MobileJobDetail.tsx`

Viktig princip:
- `large_project_id` ska vara sann källa för projekttid
- `booking_id` får bara vara kompatibilitetspekare
- UI får aldrig prioritera fallback-bokningen framför projektnamnet när `large_project_id` finns
