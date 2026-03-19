

# Bug: Överskanning uppdaterar bara +1 i UI

## Orsak
I `useScanProcessor.ts` rad 95 behandlas överskanningar som misslyckade:
```typescript
success: result.success && !result.overscan  // overscan → success = false
```

Sedan på rad 98: `if (result.success)` → `onOptimisticIncrement` anropas **inte** vid överskanningar.

Men backend (`scanner-api`) **har redan inkrementerat** `quantity_packed`. Resultatet:
- Första överskanning: backend går från 5→6, men UI stannar på 5. Vid nästa sync (2s) uppdateras UI till 6.
- Andra överskanning: backend går 6→7, men UI visar fortfarande 5/6 beroende på sync-timing. Det ser ut som att bara +1 fungerar.

## Fix

### `src/hooks/scanner/useScanProcessor.ts`
Lägg till `onOptimisticIncrement` även för overscan-fallet. Feedbacken ska fortfarande vara varning (⚠️), men UI:t ska reflektera det faktiska antalet:

```typescript
if (result.success) {
  if (result.itemId) {
    onHighlight(result.itemId);
    onOptimisticIncrement(result.itemId);
    if (getIsKolliMode()) {
      await onAssignToKolli(result.itemId);
    }
  }
  onTriggerSync();
}
```

Flytta `onOptimisticIncrement` och `onTriggerSync` **utanför** `if (result.success)`-blocket, så de körs även vid `result.overscan`. Behåll feedbacken (`⚠️ FÖR MÅNGA`) som den är.

En fil ändras: `src/hooks/scanner/useScanProcessor.ts`

