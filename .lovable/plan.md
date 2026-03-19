

# Deduplisering av scanningar

## Problem
1. **Samma session, snabba dubbelklick**: Samma serienummer skickas flera gånger till API:t, ger onödiga felmeddelanden/feedback.
2. **Ny session, redan avbockad**: Serienummer som redan allokerats i en tidigare session ger felmeddelande istället för ett tydligt "redan scannad"-besked.

## Lösning

### 1. Klientsida: Sessionens dedupliserings-set (`useScanProcessor.ts`)

Lägg till en `Set<string>` (via `useRef`) som håller koll på alla serienummer som redan skannats i denna session. I `processNext`, innan API-anrop:

- Om värdet redan finns i setet → **ignorera helt** (ingen feedback, ingen toast, ingen API-request)
- Om det inte finns → lägg till i setet och fortsätt som vanligt

```typescript
const scannedThisSessionRef = useRef<Set<string>>(new Set());

// I processNext, direkt efter shift():
if (scannedThisSessionRef.current.has(scannedValue.toLowerCase())) {
  scanLog('scan_ignored_duplicate_session', { value: scannedValue });
  // Tyst ignorering — ingen feedback alls
  return; // (i finally-blocket fortsätter kön)
}
scannedThisSessionRef.current.add(scannedValue.toLowerCase());
```

### 2. Serversida: Tydligt "redan scannad"-svar (`scanner-api/index.ts`)

I `verify_product`-caset, när det externa lagersystemet returnerar fel som "All matching lines fully allocated", betyder det att serienumret redan är allokerat. Ändra felmeddelandet till något tydligare:

```typescript
if (!myResult.success) {
  const isAlreadyAllocated = (myResult.error || '').toLowerCase().includes('fully allocated');
  if (isAlreadyAllocated) {
    return json({ 
      success: false, 
      error: `Nr ${serialNumber} är redan scannad/allokerad`,
      alreadyScanned: true 
    });
  }
  return json({ success: false, error: myResult.error || 'Allokering misslyckades' });
}
```

### 3. Klientsida: Bättre UI för "redan scannad" (`useScanProcessor.ts`)

I normal mode, efter `verifyProductBySku` returnerar, kolla om `result.alreadyScanned`:

```typescript
if (!result.success && result.alreadyScanned) {
  onScanResult({
    value: scannedValue,
    result: result.error, // "Nr 3204 är redan scannad/allokerad"
    success: false,
  });
  // Ingen toast — bara feedback-headern
  return;
}
```

## Filer som ändras
1. `src/hooks/scanner/useScanProcessor.ts` — Sessions-dedup + hantering av `alreadyScanned`
2. `supabase/functions/scanner-api/index.ts` — Tydligare felmeddelande för redan allokerade

