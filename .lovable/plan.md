

## Plan: Förbättra packlistor med dubbelt läge — Scanna & Bocka av

### Bakgrund
Idag går användaren från `/scanner` (MobileScannerApp) direkt in i en `VerificationView` som blandar QR-scanning med manuell klickning. Användaren vill ha en tydlig uppdelning:

1. **Från packlistsidan** → Två knappar per packlista: **Scanna** och **Bocka av**
2. **Scanna** → Nuvarande scanner-gränssnitt (QR/RFID + manuell toggle som backup)
3. **Bocka av** → Renodlad manuell checklista utan QR, optimerad för snabb tapping på skärmen

### Ändringar

#### 1. Uppdatera packlista-kortet i `MobileScannerApp.tsx`
Istället för att hela kortet är klickbart och öppnar scanner-läget, visa **två knappar** på varje packlista-kort:
- **Scanna** (QR-ikon) → Öppnar `VerificationView` i scanner-läge (som idag)
- **Bocka av** (check-ikon) → Öppnar `VerificationView` i manuellt läge

Utöka `AppState` med `'manual_verifying'` eller skicka ett `mode`-prop.

#### 2. Skapa manuell checklista-vy — `ManualChecklistView.tsx`
Ny komponent i `src/components/scanner/` som återanvänder samma data-laddning och produkthierarki som `VerificationView`, men:
- **Ingen QR-knapp** — helt skärmbaserat
- **Större touch-targets** — varje rad är en stor tappbar yta
- **Tydligare kvantitetsräkning** — varje tapp ökar `quantity_packed` med 1, visuell feedback (puls/animation)
- **Progress-bar** överst (samma som scanner-vyn)
- **Kolli-knapp** finns kvar (fungerar likadant)
- **Tillbaka-knapp** till packlistan

Komponenten hämtar data med samma `fetchPackingListItems`, `togglePackingItemManually`, `getVerificationProgress` från `scannerService`.

Skillnader mot scanner-vyn:
- Ingen `QRScanner`-komponent
- Ingen `lastScan`-state
- Större radhöjd och font för enklare fingertapping
- Eventuellt en "Markera alla"-knapp per huvudprodukt

#### 3. Uppdatera `MobileScannerApp.tsx` state-hantering
```text
AppState: 'home' | 'verifying' | 'manual'

home → Packlista med två knappar per kort
verifying → VerificationView (QR + manuell, som idag)
manual → ManualChecklistView (bara tapping)
```

#### 4. UI-layout för packlista-kortet (wireframe)

```text
┌─────────────────────────────────────────────┐
│ 📦 A Catering Sweden AB - 2026-02-26        │
│    A Catering Sweden AB          📅 26 feb.  │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 📷 Scanna    │  │ ☑ Bocka av manuellt  │  │
│  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
```

#### 5. ManualChecklistView — touch-optimerad design

```text
← A Catering Sweden AB          🔄
━━━━━━━━━━━━━━━━━━━━━━━━━  3/16  19%

MULTIFLEX 10X24 (#1)                    0/1
  Markeras när alla delar är packade
────────────────────────────────────────────
  ↳ Kassetgolv 10x24              [ 0/1 ] ← tappa
  ↳ Nålfiltsmatta - Antracit      [ 0/2 ] ← tappa
  ↳ M Gaveltriangel 10 m          [ 0/4 ] ← tappa
```

Varje tapp på en rad ökar count med 1. När full → grön. Lång-tryck → nollställ.

### Teknisk sammanfattning
| Fil | Ändring |
|-----|---------|
| `src/components/scanner/ManualChecklistView.tsx` | Ny komponent — manuell checklista |
| `src/pages/MobileScannerApp.tsx` | Ny state `'manual'`, två knappar per kort |
| Inga nya dependencies | Återanvänder befintlig `scannerService` |

