
## Plan

Jag har hittat att stödet redan finns i koden för exakt det du vill göra:

- `import-bookings` stödjer redan `historicalMode` / `forceHistoricalImport`
- `src/services/importService.ts` har redan `forceHistoricalSync()`
- problemet är att `/projects` fortfarande kör edge-funktionen direkt i **incremental**-läge

## Det jag bygger

### 1. Byt `/projects` från inkrementell sync till full engångssync
I `src/pages/ProjectManagement.tsx` ändrar jag `handleSyncBookings` så att den använder den redan befintliga full-sync-pathen i stället för:
- nuvarande: `syncMode: 'incremental'`
- nytt: full historisk sync av alla bokningar oavsett senaste timestamp

Det kan göras på två likvärdiga sätt:
- anropa `forceHistoricalSync()`, eller
- fortsätta anropa edge-funktionen direkt men med `historicalMode: true` + `forceHistoricalImport: true`

Jag följer befintligt mönster och väljer den väg som ger minst risk och tydligast resultat.

### 2. Behåll nuvarande query refresh efter sync
Efter körningen invalidateras samma queries som idag så att projektsidan laddar om:
- `projects`
- `bookings`
- `bookings-without-project`
- `dashboard-stats`
- `orphan-bookings`

### 3. Förtydliga feedback i UI
Nuvarande toast “Inga nya ändringar att synka” är missvisande för detta läge. Jag byter till meddelanden som passar full sync, t.ex.:
- “Full synk slutförd”
- antal uppdaterade/skapade/fel
- tydlig feltoast om edge-funktionen returnerar fel

### 4. Ingen ny reconciliation-logik nu
Jag bygger inte om sync-flödet igen här.
Detta blir bara att använda **den edge vi redan byggt** för att köra en full import av alla bokningar en gång från `/projects`.

## Tekniska detaljer

- Fil som ändras: `src/pages/ProjectManagement.tsx`
- Möjligen även återanvändning/import från: `src/services/importService.ts`
- Ingen ny databasändring
- Ingen ny edge function
- Ingen migration

## Resultat
När du klickar på uppdatera på projektsidan kommer appen att köra en **full sync av alla bokningar**, inte bara ändringar sedan senaste sync.
