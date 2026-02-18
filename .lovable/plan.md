
## Lägg till detaljerade loggar för kamera-kraschen

För att förstå exakt VAR kraschen sker lägger vi till `console.log`/`console.error`-anrop på varje steg i kameraflödet. Loggarna syns sedan i konsolen här i Lovable nästa gång du klickar "Fota kvitto".

### Ändringar i `src/utils/capacitorCamera.ts`

Lägger till loggar på:
1. Plattformskontroll – loggar om det är native eller webb
2. Innan `Camera.getPhoto()` anropas
3. Efter att foto returneras – loggar `photo.path` och `photo.webPath`
4. Innan `fetch(photo.webPath)` – loggar den faktiska URL:en
5. I `catch`-blocket – loggar hela fellobjektet (inte bara `message`)

### Ändringar i `src/components/mobile-app/job-tabs/JobCostsTab.tsx`

Lägger till loggar i `handleCameraClick`:
1. Innan `takePhotoBase64()` anropas
2. Efter – loggar om base64 returnerades eller var null
3. Felhantering med `try/catch` runt hela anropet

### Tekniska detaljer

| Fil | Ändring |
|---|---|
| `src/utils/capacitorCamera.ts` | Detaljerade console.log på varje steg + console.error i catch |
| `src/components/mobile-app/job-tabs/JobCostsTab.tsx` | try/catch + console.log runt handleCameraClick |

### Hur du ser loggarna

När loggarna är tillagda:
1. Klicka "Fota kvitto" i appen
2. Skicka ett nytt meddelande här i chatten (t.ex. "Jag klickade nu")
3. Jag ser direkt vad som loggades och kan identifiera exakt var det kraschar
