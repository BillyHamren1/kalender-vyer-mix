

# Granskning: Tidrapporteringsappen — Fullständig genomgång

## Sammanfattning

Jag har gått igenom hela mobilappens kodbas: routing, auth, edge function, alla sidor och tabbar. Nedan identifierar jag problem och förbättringsåtgärder, sorterade efter allvarlighet.

---

## Identifierade problem

### 1. Kommentarer kan inte skapas från appen (SAKNAD FUNKTION)
`mobileApi.createComment()` existerar i `mobileApiService.ts` och edge-funktionen stöder `create_comment`, men **ingen UI-komponent anropar den**. Det finns ingen kommentarsflik eller kommentarsfält i `MobileJobDetail`. Kommentarer visas alltså aldrig och kan inte skrivas av fältpersonal.

**Fix:** Lägg till en "Kommentarer"-sektion i `JobInfoTab` (eller som egen tab) med befintlig data från `bookingData.project?.comments` och möjlighet att skriva nya via `mobileApi.createComment()`.

### 2. Bilder i utlägg (kvitto) — `capture="environment"` på web
`MobileExpenses.tsx` rad 176 använder `<input capture="environment">` men har **ingen Capacitor Camera-integration** som `JobCostsTab` och `JobPhotosTab` har (via `takePhotoBase64`). På native (iOS/Android) bör den använda Capacitor Camera API för bättre tillförlitlighet (se memory om `CameraResultType.Uri` på Android).

**Fix:** Byt `MobileExpenses.tsx` kvittofotologik till att använda `takePhotoBase64()` med web-fallback, precis som `JobCostsTab` redan gör.

### 3. Intern information visas — men bara i Info-tabben
`booking.internalnotes` visas korrekt i `JobInfoTab.tsx` rad 211-221. Detta fungerar.

### 4. Timer-baserade tidrapporter saknar övertid
I `MobileJobDetail.tsx` (rad 62-69) och `MobileTimeReport.tsx` (rad 118-129) skapas tidrapporter vid timer-stopp **utan `overtime_hours`**. Den manuella rapporten i `MobileTimeReport` har övertidsfält men timer-logiken beräknar bara `hours_worked` med rastautomatik.

**Fix:** Lägg till enkel övertidsberäkning vid timer-stopp (t.ex. >8h = övertid) eller visa en kort dialog efter stopp där användaren kan ange övertid.

### 5. `get_time_reports` hämtar ALLA rapporter — filtreras lokalt
`JobTimeTab.tsx` rad 16-19 anropar `mobileApi.getTimeReports()` (alla rapporter, limit 50) och filtrerar sedan lokalt på `booking_id`. Om en personal har >50 rapporter totalt kan äldre rapporter för detta specifika jobb falla bort.

**Fix:** Antingen lägg till `booking_id`-parameter i edge-funktionens `get_time_reports`, eller använd `bookingData.my_time_reports` från `get_booking_details` (som redan hämtas).

### 6. Ingen kommentarsvy i mobilen trots API-stöd
Se punkt 1. Edge-funktionen har `create_comment` och `get_project_comments`, men ingen mobilvy anropar dem.

### 7. MobileAuthProvider dupliceras per route
Varje `/m/*`-route i `App.tsx` (rad 133-139) wrappar med egen `<MobileAuthProvider>`. Det innebär att `useEffect` i auth-kontexten körs om vid varje navigation. Inte en bugg per se (localStorage caching gör det snabbt), men suboptimalt.

**Fix (låg prio):** Flytta `MobileAuthProvider` till en gemensam layout-wrapper.

### 8. Utläggshistorik — saknar `booking_client` i `JobCostsTab`
`JobCostsTab` visar utlägg men `MobilePurchase`-typen saknar `booking_client`, vilket inte behövs här (redan i jobb-kontext). Fungerar korrekt.

---

## Vad som fungerar korrekt

| Funktion | Status |
|---|---|
| Login/Logout | OK — token-baserat, 24h expiry |
| Auth-guard (`MobileProtectedRoute`) | OK — redirect till `/m/login` |
| Jobblistning med assignment-datum | OK |
| Timer start/stopp med tidrapport-skapande | OK (men saknar övertid) |
| Manuell tidrapportering | OK |
| Utlägg med kvittofoto (i `JobCostsTab`) | OK — Capacitor Camera + web fallback |
| Utlägg (global vy `MobileExpenses`) | OK men saknar native camera |
| Bilduppladdning i `JobPhotosTab` | OK — Capacitor + web fallback |
| Intern info (`internalnotes`) | OK — visas i Info-tab |
| Produktlista med hierarki | OK |
| Teamvy med kontaktinfo | OK |
| Tidrapporthistorik med kalender/lista | OK |
| PDF-export av tidrapporter | OK (öppnar HTML i ny flik) |
| Geofencing-stöd | OK |
| EventFlow-synk av utlägg | OK |
| Multi-tenant isolation | OK — `organization_id` på alla queries |

---

## Rekommenderad åtgärdsplan

### Prioritet 1 — Buggfixar
1. **Lägg till kommentarsfunktion i jobbdetaljen** — ny sektion/tab med read + write
2. **Använd `takePhotoBase64()` i MobileExpenses** — konsekvent native camera

### Prioritet 2 — Förbättringar  
3. **Övertidshantering vid timer-stopp** — enkel dialog eller automatisk beräkning
4. **JobTimeTab: Använd `my_time_reports` från booking details** — undvik limit-problem
5. **Konsolidera MobileAuthProvider** — en wrapper istället för per-route

### Prioritet 3 — Övrigt
6. **Filuppladdnings-errorhantering i JobPhotosTab** — `finally`-blocket körs för tidigt (rad 78, `setIsUploading(false)` körs innan `reader.onload` är klar)

---

## Tekniska detaljer

### Kommentarsfunktion (Prioritet 1)
Skapa ny komponent eller sektion i `JobInfoTab`:
- Hämta kommentarer från `bookingData.project?.comments` (redan i `get_booking_details`-responsen)
- Visa kommentarslista med `author_name`, `content`, `created_at`
- Textfält + skicka-knapp som anropar `mobileApi.createComment({ booking_id, content })`
- Uppdatera lokalt state efter lyckad post

### MobileExpenses camera-fix
Ersätt rad 33-43 i `MobileExpenses.tsx` med samma mönster som `JobCostsTab`:
```typescript
import { takePhotoBase64 } from '@/utils/capacitorCamera';
// onClick: await takePhotoBase64() → if null → fileInputRef fallback
```

### JobPhotosTab race condition
Rad 63-80: `setIsUploading(false)` i `finally` körs synkront, men `reader.onload` är async. Bör flytta `setIsUploading(false)` till efter upload-completion inuti `reader.onload`.

