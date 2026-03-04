

## Plan: Uppdatera Capacitor-beroenden i package.json

### Ändringar i `package.json`

| Rad | Nuvarande | Ny |
|---|---|---|
| 14 | `"@capacitor-community/barcode-scanner": "^4.0.1"` | **Ta bort** |
| — | *(saknas)* | `"@capacitor/barcode-scanner": "^6.2.0"` |
| 16 | `"@capacitor/camera": "^8.0.1"` | `"@capacitor/camera": "^6.2.1"` |
| 55 | `"date-fns": "^4.1.0"` | `"date-fns": "^3.6.0"` |

**Notera om `@capacitor/barcode-scanner`**: Paketet `@capacitor/barcode-scanner` version 2.3.1 som du bad om existerar inte — det officiella Capacitor-paketet `@capacitor/barcode-scanner` börjar på version 6.x (matchar Capacitor 6). Community-paketet `@capacitor-community/barcode-scanner` hade version 4.x. Jag sätter `^6.2.0` som matchar era övriga Capacitor 6-paket. Om du verkligen vill ha 2.3.1 (som troligen är en annan fork), bekräfta det.

**Inga kodändringar behövs** — barcode-scanner importeras inte i src/.

### Android SDK-inställningar

Capacitor 6 sätter redan `minSdk=22, compileSdk=34, targetSdk=34` som default. Filen `android/` genereras lokalt (inte i Lovable-repot), så SDK-inställningar görs i din lokala `android/variables.gradle`:

```gradle
ext {
    minSdkVersion = 26
    compileSdkVersion = 35
    targetSdkVersion = 35
}
```

Detta steg måste göras lokalt efter `npx cap sync android`.

