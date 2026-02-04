
# Plan: Native Scanner-App med QR och RFID-stöd (Capacitor)

## Sammanfattning

Bygga en fristående Android-app med Capacitor som stödjer både kameraskanning av QR-koder och extern Bluetooth RFID-scanner. Appen ska integrera med det befintliga verifieringssystemet via Supabase API.

---

## Arkitektur

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        ANDROID-APP (Capacitor)                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │  QR-Scanner  │    │   Bluetooth  │    │  RFID Input  │         │
│   │   (Kamera)   │    │   Manager    │    │   Listener   │         │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘         │
│          │                   │                   │                  │
│          └───────────────────┼───────────────────┘                  │
│                              ▼                                      │
│                    ┌─────────────────┐                             │
│                    │  Scanner Service │                             │
│                    │  (unified input) │                             │
│                    └────────┬────────┘                             │
│                              │                                      │
│                              ▼                                      │
│                    ┌─────────────────┐                             │
│                    │   Supabase API  │                             │
│                    │  (cloud sync)   │                             │
│                    └─────────────────┘                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  Supabase Backend   │
                    │  - packing_list_items│
                    │  - booking_products  │
                    └─────────────────────┘
```

---

## Funktionalitet

### 1. Startskärm - Välj packlista
- Hämta aktiva packlistor från Supabase
- Sök/filtrera på klient eller packningsnamn
- Alternativt: skanna QR-kod för att öppna specifik packlista

### 2. QR-Scanner (kamera)
- Använd `@capacitor-community/barcode-scanner` för kameraskanning
- Skanna QR-koder som innehåller:
  - Packliste-URL (öppnar den packlistan)
  - Produkt-SKU (markerar produkten som verifierad)

### 3. RFID-Scanner (Bluetooth)
- Använd `@nicola-nicola/capacitor-bluetooth-serial` för Bluetooth-kommunikation
- Alternativ: HID-läge där RFID-scannern fungerar som tangentbord (kräver ingen speciell kod)
- Matcha skannad RFID/SKU mot `booking_products.sku`
- Automatiskt bocka av matchande produkt

### 4. Verifieringsvyn
- Visa produktlista med status (packad/verifierad)
- Realtidsuppdatering när produkter skannas
- Progress-indikator
- Loggning av vem och när

---

## Tekniska detaljer

### Nya filer att skapa

| Fil | Beskrivning |
|-----|-------------|
| `capacitor.config.ts` | Capacitor-konfiguration |
| `src/pages/MobileScannerApp.tsx` | Huvudapp för mobilen |
| `src/components/scanner/QRScanner.tsx` | Kamera QR-scanner |
| `src/components/scanner/BluetoothRFID.tsx` | Bluetooth RFID-hantering |
| `src/components/scanner/ScannerInput.tsx` | Unified scanner input |
| `src/components/scanner/PackingSelector.tsx` | Välj packlista |
| `src/hooks/useBluetoothRFID.ts` | Hook för RFID |
| `src/services/scannerService.ts` | API-integration |

### Databasändringar

Eventuellt tillägg av `rfid_tag`-fält till `booking_products` om RFID-numret skiljer sig från SKU:

```sql
ALTER TABLE booking_products 
ADD COLUMN rfid_tag TEXT;
```

### Paketberoenden

```json
{
  "@capacitor/core": "^6.x",
  "@capacitor/cli": "^6.x",
  "@capacitor/android": "^6.x",
  "@capacitor-community/barcode-scanner": "^4.x",
  "@nicola-nicola/capacitor-bluetooth-serial": "^1.x"
}
```

### Bluetooth RFID-flöde

```text
1. Användare trycker "Anslut scanner"
2. App söker efter Bluetooth-enheter
3. Välj din RFID-scanner från listan
4. Scanner ansluts och börjar lyssna
5. När RFID-tagg skannas → data skickas till appen
6. Appen matchar mot SKU/RFID i databasen
7. Produkt markeras som verifierad
```

---

## Steg-för-steg implementation

### Steg 1: Capacitor-setup
- Installera Capacitor-beroenden
- Konfigurera `capacitor.config.ts` med projektets ID
- Lägga till Android-plattform

### Steg 2: Scanner-komponenter
- Skapa QR-scanner med kameratillgång
- Skapa Bluetooth-manager för RFID
- Bygga unified input-handler

### Steg 3: Packlistegränssnitt
- Mobil-optimerad produktlista
- Sökfunktion baserad på SKU
- Verifieringslogik kopplad till befintlig databas

### Steg 4: Offline-stöd (valfritt)
- Lokal cache för packlistor
- Synkronisering när uppkoppling finns

---

## Användarflöde

```text
┌───────────────────────────────────────────────────┐
│                   STARTSIDA                        │
│                                                    │
│   ┌────────────────────────────────────────┐      │
│   │     Välj packlista eller skanna QR     │      │
│   └────────────────────────────────────────┘      │
│                                                    │
│   ┌────────────┐  ┌────────────┐                 │
│   │ Kund ABC   │  │ Kund XYZ   │                 │
│   │ 5 feb      │  │ 8 feb      │                 │
│   └────────────┘  └────────────┘                 │
│                                                    │
│   [📷 Skanna QR]  [📶 Anslut RFID]              │
└───────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌────────────────┐    ┌────────────────┐
│  Kamera öppnas │    │ Bluetooth-lista│
│  skanna QR...  │    │ välj scanner   │
└────────────────┘    └────────────────┘
          │                    │
          └──────────┬─────────┘
                     ▼
┌───────────────────────────────────────────────────┐
│              VERIFIERINGSSIDA                      │
│                                                    │
│   Kund: ABC Event                                 │
│   Progress: ████████░░ 75%                        │
│                                                    │
│   ✅ Tält 6x12m        [1616390d]                │
│   ✅ Vägg transparent   [161bb601]                │
│   ⬜ Bord runt         [4bf86ba7]                 │
│   ⬜ Stol Chiavari     [75a98f14]                 │
│                                                    │
│   Skannar... ██████ [RFID aktiv]                 │
└───────────────────────────────────────────────────┘
```

---

## Efter implementation

För att köra appen på din Android-telefon behöver du:

1. Exportera projektet till GitHub
2. Klona projektet lokalt
3. Köra `npm install`
4. Köra `npx cap add android`
5. Köra `npx cap sync`
6. Öppna i Android Studio: `npx cap open android`
7. Bygga och installera APK på din telefon

---

## Resultat

Efter implementation får du:
- En native Android-app för lagerpersonal
- QR-skanning via kamera för att öppna packlistor
- RFID-skanning via Bluetooth för att automatiskt verifiera produkter
- Realtidssynkronisering med huvudsystemet
- Offline-möjlighet för instabil uppkoppling
