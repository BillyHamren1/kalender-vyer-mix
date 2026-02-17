
## Varför bilderna saknas — diagnos och lösning

### Rotorsak

Problemet är **inte** i koden — `syncTentImages` är korrekt implementerad och deployad. Problemet är att det externa källsystemet (export-API:t) **inte skickar några bilder alls för bokning 2601-1 (A Catering)** just nu.

Bekräftad data från databasen:
- `booking_attachments` för 2601-1: **0 rader**
- `map_drawing_url` på bokningen: **null**
- En manuell import kördes precis — fortfarande 0 bilder

Det finns alltså inga bilder att importera från källsystemet för just den bokningen ännu.

### Vad som faktiskt visas var (webbvyn)

Webbvyn visar "0 Filer" i snabbstatistiken. Det räknar `project_files` — inte `booking_attachments`. Snabbstatistiken visar alltså korrekt information.

Flik-fliken "Filer" i projektet **borde** visa "Bilder från bokning" sektionen när det väl finns data i `booking_attachments`.

### Statistik-räknaren i webbvyn

Det finns dock en separat bugg att fixa: **snabbstatistiken på projektkortet** räknar bara `project_files` och inte `booking_attachments`. Så även när importer bildar finns, visas "0 Filer" i statistiken.

Jag hittar och fixar denna räknare.

### Plan

**1. Fixa statistikräknaren i ProjectOverview** så att den inkluderar både `project_files` OCH `booking_attachments` i "Filer"-siffran.

**2. Lägg till debug-loggning i import-bookings** för att logga `tent_images`-fältets närvaro per bokning — så vi kan se i loggarna om/när det externa API:t börjar skicka bilder.

**3. Trigga en full historical re-import av 2601-1** för att säkerställa att alla fält (inklusive eventuella bilder som lagts till sedan senaste import) hämtas in.

### Tekniska ändringar

**Fil 1: `src/hooks/useProjectDetail.tsx` eller `ProjectOverview.tsx`**

Statistiken "0 Filer" räknar troligtvis bara `files.length` (project_files). Uppdatera den att visa `files.length + bookingAttachments.length`.

**Fil 2: `supabase/functions/import-bookings/index.ts`**

Lägg till loggning av `tent_images`-fältets existens och längd för varje bokning som processas, så att vi kan se i loggar när/om externa API:t börjar skicka dem:

```typescript
console.log(`Booking ${bookingData.id} tent_images: ${
  externalBooking.tent_images 
    ? `${externalBooking.tent_images.length} bilder` 
    : 'saknas i API-svaret'
}`);
```

### Vad som händer automatiskt när bilder finns

När det externa systemet lägger in tältbilder för A Catering och nästa import körs:
1. `syncTentImages` fångar upp dem automatiskt
2. De sparas som `booking_attachments`
3. Webb-UI:ts "Filer"-flik visar dem direkt under "Bilder från bokning"
4. Mobilappens "Bilder"-flik visar dem via `get_project_files` Edge Function

### Filer att ändra

1. Statistikräknaren i projektvy (1 rad) — inkludera `bookingAttachments.length`
2. Import-loggning — för felsökning framåt

Inga databasmigrationer behövs.
