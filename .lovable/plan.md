
## Diagnos: Två separata problem

### Problem 1 – Webb (det du ser nu)
`fileInputRef` pekar på en `<input>` som bara existerar när `showForm === true`. Men `handleCameraClick` kan i teorin anropas när `showForm` är false (om knappen renderas utanför formuläret). Dessutom: `<input capture="environment">` behöver testas.

**Faktisk rotorsak på webben:** `takePhotoBase64()` returnerar `null` → `fileInputRef.current?.click()` → detta fungerar på webben men öppnar en *filväljare*, inte kameran direkt.

### Problem 2 – Native Android (kraschen)
Det mest troliga är ett av dessa:
1. **`npx cap sync` har inte körts** efter att `@capacitor/camera` lades till – pluginen är inte registrerad i den nativa appen
2. **Kamera-behörighet** saknas i AndroidManifest (läggs till automatiskt av `cap sync`)
3. **`CAMERA`-permission dialog** visas inte och appen kraschar istället

## Lösning

### Del 1: Fixa webb-upplevelsen
Lägg till en `accept="image/*" capture="environment"` input **utanför** `showForm`-blocket så att den alltid finns i DOM:en, och ändra kamera-knappen på webben så den faktiskt öppnar kameran (inte filväljare) via `capture="environment"`.

### Del 2: Lägg till explicit permission-request för Android
Lägg till ett explicit anrop till `Camera.requestPermissions()` **innan** `Camera.getPhoto()` anropas. Detta är det vanligaste felet – utan detta kraschar appen på Android istället för att visa permission-dialogen.

```typescript
// Begär behörighet explicit INNAN getPhoto()
const permissions = await Camera.requestPermissions({ permissions: ['camera'] });
if (permissions.camera !== 'granted') {
  console.warn('[Camera] Permission denied');
  return null;
}
```

### Del 3: Säkerställ att `<input>` alltid finns i DOM

Flytta `<input ref={fileInputRef}>` till **utanför** `showForm`-blocket så den alltid är monterad och `fileInputRef.current` alltid pekar på ett giltigt element.

## Tekniska ändringar

| Fil | Ändring |
|---|---|
| `src/utils/capacitorCamera.ts` | Lägg till `Camera.requestPermissions()` innan `Camera.getPhoto()` |
| `src/components/mobile-app/job-tabs/JobCostsTab.tsx` | Flytta `<input>` utanför `showForm`-blocket |

## Efter implementering

Du behöver:
1. `git pull`
2. `npm install`
3. `npm run build && npx cap sync` (kritiskt – synkar permission-ändringarna)
4. Bygg om och installera appen på enheten
