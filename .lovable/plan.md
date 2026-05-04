## Mål

Göra scannervyn (`VerificationView` + `QRScanner` i compact-läge) till en stabil "appkänsla" istället för en scrollande webbsida:

1. **Kameran sitter fast överst** — inget scrollar förbi den.
2. **Bara skanningszonen visas** — resten av kamerabilden beskärs bort så användaren ser exakt det som faktiskt analyseras.
3. **Direkt under kameran**: vad som händer nu (senaste scan + status).
4. **Under det**: packlistan, som är det enda som scrollar.
5. Manuell input + zoom flyttas till en kompakt rad, inte ett stort fält som tar halva skärmen.

## Ny layout (mobile)

```text
┌─────────────────────────────────┐
│ ← 11 - TEST - !!         ⟳     │  Header (fixed, kompakt)
├─────────────────────────────────┤
│ Barcode • RFID • 1/1 100%  − Cam│  En rad: status + actions
├─────────────────────────────────┤
│                                 │
│      [ KAMERAVY — BESKUREN ]    │  Fast höjd ~38vh, visar
│        ┌─────────────┐          │  endast scan-fyrkanten
│        │             │          │  (object-fit + scale så
│        │   skannar   │          │  scan-rutan fyller hela)
│        │             │          │
│        └─────────────┘          │
│  [zoom −  ▬▬●▬▬  + 2.0x] [💡]  │  Tunn zoom/torch-rad
├─────────────────────────────────┤
│ ✅ FACE...2301  Removed 1 pc    │  Live status (1 rad)
├─────────────────────────────────┤
│ PRODUCT                  PACKED │
│ ✓ SCANTESTQR              1/1   │  Packlistan — ENDA
│ ...                             │  som scrollar
│ ...                             │
└─────────────────────────────────┘
│ [Manuell kod ____________ ➤]    │  Tunn input längst ner
└─────────────────────────────────┘
```

## Ändringar

### 1. `src/components/scanner/VerificationView.tsx` (normal-läget, raderna ~466–654)
- Gör rotcontainern till `flex flex-col h-[100dvh]` (full viewport-höjd, ingen sidscroll).
- **Top-block (fixed, shrink-0)**: header + en sammanslagen status/action-rad (ScannerModeIndicator + RFID + progress + Minus/Camera/Parcel/QR/Log packas tätare; t.ex. RFID kollapsar till en liten ikon-pill när ansluten, expanderbar vid problem).
- **Kamerablock (fixed, shrink-0)**: alltid monterad `<QRScanner compact tight />` (ny prop `tight`) — ingen toggle "Camera"-knapp behövs eftersom den alltid syns. "Camera"-knappen tas bort eller blir bara en starta/återinitiera-knapp om kameran failat.
- **Status-rad (shrink-0)**: senaste scan-resultat (`lastScanResult`) — kompakt 1-rads version (ikon + namn + result), inte den nuvarande tjocka pillen.
- **Scrollblock (flex-1, overflow-y-auto)**: endast packlistan. Tar bort de hårdkodade `maxHeight: calc(100vh - …)`-räkningarna; flex-layouten löser det automatiskt.
- Den separata "Recent scans"-panelen blir en bottom-sheet/dialog som öppnas via Log-knappen — den ska inte trycka ned listan.

### 2. `src/components/scanner/QRScanner.tsx` — ny `tight`-mode
Lägg till prop `tight?: boolean` (används tillsammans med `compact`).

När `tight`:
- Headern (titel + X) tas bort helt — föräldern äger redan headern.
- Manuell input flyttas till en **liten överlay nere i kameran** (en knapp "⌨ Manuell" som öppnar en mini-dialog), istället för det stora svarta fältet som tar ~150px.
- **Beskärningen av kamerabilden**: lägg en wrapper runt `<video>` som är fast t.ex. `aspect-[4/3]` eller fast höjd `38vh`, och skala videoelementet så att den 64×64-skanningsrutan fyller hela synliga ytan:
  ```
  <div className="relative overflow-hidden" style={{height: '38vh'}}>
    <video className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
           style={{ width: '155%', height: '155%', objectFit: 'cover' }} />
    {/* skanningsruta-overlay som idag, men fyller nu nästan hela vyn */}
  </div>
  ```
  Skalfaktorn (~1.55) matchar nuvarande `cropFactor` (0.62 på iOS / 0.72 övriga) så att det användaren ser = exakt det som skickas till `BarcodeDetector`. (Detektor-cropet i `runScanLoop` rörs inte — bara visningen.)
- Skanningsfyrkant-overlay görs större (fyller ~90% av synlig kamera) och behåller hörn-markörer + scan-line.
- Zoom-controls görs till en tunn rad direkt under kameran (inte gradient över halva bilden), torch som ikon i samma rad.

### 3. Borttagna saker
- "Camera"-knappen i action-raden (kameran är alltid på).
- Det nedre stora "Or enter code manually"-blocket i `compact`-läget (ersatt av kompakt knapp/mini-dialog).
- Hårdkodade `maxHeight: calc(100vh - 560px)` etc. — flex-layouten räknar själv.

## Tekniska detaljer

- `100dvh` istället för `100vh` på roten så iOS Safari address-bar inte gör layouten större än skärmen.
- `safe-area-inset-top/bottom` respekteras på header och eventuell bottom-input.
- Inga ändringar i scan-pipelinen (`useScanProcessor`, `scannerService`, `scanner-api` edge function) — alla nyliga WMS-fixar bevaras.
- Kolli-läget (raderna 387–462) får samma layout-behandling i en följdsteg om du vill — denna plan fokuserar på normal-vyn som är den du visat.

## Filer som ändras
- `src/components/scanner/VerificationView.tsx` — layout-omstruktur, ta bort Camera-toggle, kompakt status-rad.
- `src/components/scanner/QRScanner.tsx` — ny `tight`-mode (beskuren video, ingen header, mini manuell input, kompakt zoom/torch).

Inga DB-ändringar, inga edge function-ändringar.
