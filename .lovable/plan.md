# Plan: Native Scanner-App med QR och RFID-stöd (Capacitor)

## ✅ Status: Implementerat

Alla komponenter och konfiguration är skapade. Appen är tillgänglig på `/scanner`.

---

## Implementerade filer

| Fil | Beskrivning |
|-----|-------------|
| `capacitor.config.ts` | ✅ Capacitor-konfiguration med hot-reload |
| `src/pages/MobileScannerApp.tsx` | ✅ Huvudapp för mobilen |
| `src/components/scanner/QRScanner.tsx` | ✅ Kamera QR-scanner |
| `src/components/scanner/BluetoothRFID.tsx` | ✅ Bluetooth RFID-hantering |
| `src/components/scanner/PackingSelector.tsx` | ✅ Välj packlista |
| `src/components/scanner/VerificationView.tsx` | ✅ Produktverifiering |
| `src/hooks/useBluetoothRFID.ts` | ✅ Hook för RFID (HID + Bluetooth) |
| `src/services/scannerService.ts` | ✅ API-integration |

---

## Nästa steg för att köra på Android

1. **Exportera till GitHub** via "Export to Github"-knappen i Lovable
2. **Klona lokalt**: `git clone <your-repo>`
3. **Installera beroenden**: `npm install`
4. **Lägg till Android-plattform**: `npx cap add android`
5. **Synka**: `npx cap sync`
6. **Öppna i Android Studio**: `npx cap open android`
7. **Bygg och installera** APK på din telefon

---

## Funktioner

- ✅ QR-skanning via kamera
- ✅ RFID-stöd via Bluetooth (Web Bluetooth API)
- ✅ RFID-stöd via HID-läge (tangentbordsinmatning)
- ✅ Välj packlista från lista
- ✅ Skanna QR för att öppna packlista
- ✅ Automatisk produktverifiering via SKU
- ✅ Realtidsprogress
- ✅ Synkronisering med Supabase

---

## URL för test

Appen kan testas direkt i webbläsaren via:
- **Preview**: `/scanner`
- **Native**: Bygg med Capacitor för full funktionalitet
