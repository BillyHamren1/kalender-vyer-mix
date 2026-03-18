

# RFID — Enda kvarvarande gap

## Nuläge
Allt RFID-stöd är redan byggt och integrerat. Hela flödet fungerar: bridge → controller → handler → FIFO-kö → packlist-matchning → UI-feedback.

## Enda problemet
`useRfidManager.recordTagResult(epc, matched)` anropas aldrig. Det gör att RfidStatusBar visar "✓ 0" och "? 0" även när taggar matchar/inte matchar.

## Fix
I `useScanProcessor.ts`, efter att en scan processats (både normal och minus mode), anropa en ny callback `onRfidTagResult?(epc, matched)` om scanens värde ser ut som en RFID EPC (hex-sträng, längd ≥ 20).

I `VerificationView.tsx`, koppla `onRfidTagResult` till `rfid.recordTagResult`.

### Filer som ändras

| Fil | Ändring |
|-----|---------|
| `src/hooks/scanner/useScanProcessor.ts` | Lägg till optional `onRfidTagResult` i options, anropa efter process |
| `src/components/scanner/VerificationView.tsx` | Skicka `rfid.recordTagResult` som `onRfidTagResult` till useScanProcessor |

Ingen annan ändring behövs — resten är färdigt.

