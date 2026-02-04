
## Streamlina Scanner-vyn - Kom direkt till packlistan

### Problem
Just nu tar för mycket plats upp innan själva packlistan:
- Bokningsdetaljer (datum, adress, bokningsnummer) - tar mycket plats
- Progress-kort (verifiering 0/22) - stort
- Instruktionskort ("Skanna produkternas SKU") - onödigt
- QR/RFID knappar - tar plats
- **Helt Bluetooth RFID-panel** med anslutningsknapp - behövs inte på denna skärm

RFID-scannern ansluts en gång och behåller connection - knappen behövs inte varje gång man öppnar en packlista.

### Lösning
Komprimera vyn kraftigt så att packlistan syns direkt:

1. **Header** - Behåll kort header med packlistans namn
2. **Progress** - Slå ihop till en liten inline-rad (ej eget stort kort)
3. **Ta bort instruktionskortet** - användarna vet vad de ska göra
4. **Ta bort Bluetooth RFID-panelen helt** - RFID fungerar i bakgrunden via HID-läge
5. **Kompakta skannaknappar** - Mindre, inline-layout
6. **Packlistan direkt synlig** - Ingen "Packlista"-rubrik som kollapsar

### Ny layout (uppifrån och ned)

```
┌────────────────────────────────────┐
│ ← Packlistans namn        [↻]     │  ← Kompakt header
│    Klient                          │
├────────────────────────────────────┤
│ ■■■■■■■■░░░░░░  2/22 (9%)  [📷QR] │  ← Progress + scan på samma rad
├────────────────────────────────────┤
│ ━━━━━ PACKLISTA ━━━━━             │
│ ○ HUVUDPRODUKT 1          0/1     │  ← Listan börjar direkt
│   ↳ Tillbehör A           0/2     │
│   ⦿ Paketmedlem B         0/1     │
│ ✓ HUVUDPRODUKT 2          1/1     │
│ ...                                │
└────────────────────────────────────┘
```

### Filer som ändras

**`src/components/scanner/VerificationView.tsx`**
- Ta bort `BluetoothRFID`-komponenten (rad 264)
- Ta bort "Skanna produkternas SKU" instruktionskortet (rad 228-242)
- Slå ihop progress till en kompakt inline-rad med scan-knapp
- Ta bort `grid grid-cols-2` för knapparna - endast QR-knappen, kompakt
- Ta bort eller dölj bokningsdetaljer (eventdatum, riggdatum, adress) - kan göras till expanderbar sektion
- Låt packlistan alltid vara expanderad (ta bort toggle)

### Resultat
Användaren ser packlistan direkt när de öppnar verifieringsvyn och kan börja skanna omedelbart. RFID fungerar automatiskt i bakgrunden via HID-läge (tangentbordsinput).
