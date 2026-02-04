
## Ändra scanner-startsidan till direkt packlista

### Bakgrund
Nuvarande startsida har stora kort ("Skanna QR", "Välj lista", RFID-info, instruktioner) som tar upp plats innan användaren kan börja arbeta. Användaren vill komma direkt till listan med packlistor.

### Mål
Visa alla packlistor direkt på startsidan med:
- Sökfält högst upp
- Sorterat: Pågående (in_progress) först → Närmast datum → Resten
- QR-scanner tillgänglig via kompakt knapp (inte stort kort)

### Ny layout

```text
┌────────────────────────────────────┐
│ Lagerscanner              [📷QR]  │  ← Kompakt header med QR-knapp
├────────────────────────────────────┤
│ 🔍 Sök packlista, kund...         │  ← Sökfält
├────────────────────────────────────┤
│ Pågående                          │
│ ┌──────────────────────────────┐  │
│ │ PACKLISTA A       Pågående   │  │
│ │ Kund: ABC         15 jan     │  │
│ └──────────────────────────────┘  │
├────────────────────────────────────┤
│ Kommande                          │
│ ┌──────────────────────────────┐  │
│ │ PACKLISTA B       Planering  │  │
│ │ Kund: XYZ         17 jan     │  │
│ └──────────────────────────────┘  │
│ ...                                │
└────────────────────────────────────┘
```

### Ändringar

**`src/pages/MobileScannerApp.tsx`**
1. Ta bort "home"-vy med kort och RFID-info
2. Ta bort "selecting"-state (listan visas direkt på home)
3. Behåll endast två states: `home` (med lista) och `verifying`
4. Integrera PackingSelector-logiken direkt i home-vyn
5. Lägg till QR-knapp i headern istället för som kort

**`src/services/scannerService.ts`**
Uppdatera `fetchActivePackings` för att sortera:
1. `in_progress` först (pågående)
2. Sedan efter närmaste datum (`booking.rigdaydate` eller `booking.eventdate`)
3. Resten sist

### Sorteringslogik (i scannerService)

```typescript
// Sortera: in_progress först, sedan efter datum
packingsWithBookings.sort((a, b) => {
  // in_progress först
  if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
  if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
  
  // Sedan efter närmaste datum
  const dateA = a.booking?.rigdaydate || a.booking?.eventdate;
  const dateB = b.booking?.rigdaydate || b.booking?.eventdate;
  if (dateA && dateB) return new Date(dateA).getTime() - new Date(dateB).getTime();
  if (dateA) return -1;
  if (dateB) return 1;
  
  return 0;
});
```

### Filer som ändras
- `src/pages/MobileScannerApp.tsx` – Förenklad layout, lista direkt
- `src/services/scannerService.ts` – Sorteringslogik
