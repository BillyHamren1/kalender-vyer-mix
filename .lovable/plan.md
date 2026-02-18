
## Rotorsak

`JobCostsTab.tsx` använder en vanlig HTML `<input type="file" capture="environment">` för att öppna kameran. I en native Capacitor-app (Android/iOS) fungerar inte detta tillförlitligt – det orsakar crash/frys. Den korrekta lösningen är att använda `@capacitor/camera`-pluginen.

**Samma bugg finns troligtvis i `JobPhotosTab.tsx`** (rad 79: `capture="environment"`).

## Lösning

### Steg 1: Installera `@capacitor/camera`

Lägga till paketet i `package.json`:
```
@capacitor/camera
```

### Steg 2: Skapa en gemensam kamera-hjälpfunktion

Ny fil `src/utils/capacitorCamera.ts` som:
- Känner av om appen körs nativt (`window.Capacitor?.isNativePlatform()`)
- Om nativt: använder `Camera.getPhoto()` från `@capacitor/camera` och returnerar en base64-sträng
- Om webb: faller tillbaka på vanlig `<input type="file">` (för testning i webbläsaren)

```typescript
// src/utils/capacitorCamera.ts
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export async function takePhotoBase64(): Promise<string | null> {
  const isNative = typeof (window as any).Capacitor !== 'undefined'
    && (window as any).Capacitor.isNativePlatform?.();

  if (isNative) {
    const photo = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
    });
    return `data:image/jpeg;base64,${photo.base64String}`;
  }
  return null; // Webb: låt fileinput hantera det
}
```

### Steg 3: Uppdatera `JobCostsTab.tsx`

Ersätt `fileInputRef.current?.click()` med `takePhotoBase64()`:
- Om nativt → `takePhotoBase64()` returnerar base64-strängen direkt
- Om webb → faller tillbaka på `fileInputRef.current?.click()` som förut

```tsx
const handleCameraClick = async () => {
  const base64 = await takePhotoBase64();
  if (base64) {
    // Native path: got base64 directly
    setReceiptPreview(base64);
    setReceiptBase64(base64);
  } else {
    // Web fallback
    fileInputRef.current?.click();
  }
};
```

### Steg 4: Uppdatera `JobPhotosTab.tsx`

Samma mönster – ersätt `fileInputRef.current?.click()` med `takePhotoBase64()` och vid nativt anrop `mobileApi.uploadFile()` direkt med base64-datan.

### Tekniska steg

| Fil | Ändring |
|---|---|
| `package.json` | Lägg till `@capacitor/camera` |
| `src/utils/capacitorCamera.ts` | Ny fil med kamera-helper |
| `src/components/mobile-app/job-tabs/JobCostsTab.tsx` | Byt `fileInputRef.click()` mot `takePhotoBase64()` |
| `src/components/mobile-app/job-tabs/JobPhotosTab.tsx` | Byt `fileInputRef.click()` mot `takePhotoBase64()` |

### Efter implementering

Användaren behöver:
1. `git pull` från sitt GitHub-repo
2. `npm install` (installerar `@capacitor/camera`)
3. `npx cap sync` (synkar plugin till Android/iOS)
4. Bygga om appen (`npm run build && npx cap sync`)

**OBS:** `AndroidManifest.xml` kräver kamera-behörighet – `@capacitor/camera` lägger till detta automatiskt vid `cap sync`.
