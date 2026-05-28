## Problem

Notisen efter sista blocket gissar orsak ("troligen tomt batteri…"). Det är fel. Användaren vill bara se **faktiska händelser** ur GPS-datat som förklarar att dagen tog slut — t.ex. "20:06 resa från Swedish game fair → Hem. Arbetsdagen avslutad." Finns ingen sådan faktisk händelse ska vi inte hitta på något.

## Vad jag gör

### 1. `src/lib/staff-gps/lastPingReason.ts` — skriv om till faktabaserad "day closer"

Byt namn på exporten till `buildDayCloser` (behåll bakåtkompatibel `inferLastPingReason`-alias som no-op tas bort). Funktionen tittar på **alla rå-segment efter sista synliga rapport-rad** och letar efter en konkret avslutshändelse:

```ts
buildDayCloser({
  reportRows,           // synliga rapportrader
  rawSegments,          // hela dagens segment (work/travel/private/...)
  actualLastPingIso,    // summary.lastIso
}) → { text: string } | null
```

Regler — endast fakta från data:
- **Resa hem hittad**: sök efter `travel`-segment efter sista rapport-rad där `toLabel` matchar private/hem (segment-typ `private` direkt efter, eller `toLabel` innehåller "hem"/"home"/privat-zon).  
  → `"Arbetsdagen avslutades — {HH:MM} resa från {fromLabel} → Hem."`
- **Privat-segment direkt efter sista arbete utan resa**: `"Arbetsdagen avslutades — {HH:MM} {fromLabel} → privat/hem."`
- **Resa utan känt mål efter sista arbete**: `"{HH:MM} resa från {fromLabel}. Inga fler arbetsplats-pings efter detta."`
- **Pings fortsätter men bara dolda (privat/okänt) utan resa**: `"Pings fortsatte till {HH:MM} (dolt: {kinds}). Ingen ny arbetsplats."`
- **Inget av ovanstående** (ingen extra data efter sista rapport-rad): returnera `null` — visa ingenting.

INGA ord om batteri, app, GPS-avstängd, "stannade kvar", gissningar om varför pings tystnade.

### 2. `src/components/staff/StaffGpsDayRow.tsx`

- Anropa `buildDayCloser({ reportRows, rawSegments, actualLastPingIso: summary?.lastIso })`.
- Visa resultatet i en neutral grå/zinc-ruta (ingen amber-varning, ingen `AlertTriangle`).
- Ta bort `Home`/`AlertTriangle`-ikonerna och `warn`-logiken.
- Om `null` → rendera ingenting.

### 3. Tester — `src/lib/staff-gps/__tests__/lastPingReason.test.ts`

Skriv om:
- travel → private (hem) efter sista work → korrekt "resa till Hem"-text med tid
- private direkt efter sista work, ingen travel → "till privat/hem"
- travel utan mål → "resa från X. Inga fler arbetsplats-pings"
- bara dolda privat/okänt utan resa → "Pings fortsatte till …"
- tom dag / inget efter sista rad → `null`
- **regression-guard**: regex `/batteri|app stängd|GPS avstängd|troligen|möjligen|stannade kvar/i` får inte matcha någon output.

## Utanför scope

Ingen ändring av `dayPartition`, `reportRowFilter`, hem-detektion eller GPS-pipeline. Använder befintliga `private`-segment + `toLabel`/`fromLabel` som redan finns.
