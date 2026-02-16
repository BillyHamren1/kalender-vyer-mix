

# Optimistisk uppdatering -- Snabbare UI-upplevelse

## Sammanfattning

Idag väntar varje ändring (statusbyte, uppgift markerad som klar, kommentar tillagd, etc.) på att servern svarar innan UI:t uppdateras. Det ger en märkbar fördröjning på 200-500ms. Med optimistisk uppdatering visas ändringen **direkt** i UI:t och rullas tillbaka automatiskt om servern returnerar ett fel.

## Nuläge

- **25 hooks** med `useMutation` som alla följer mönstret: vänta på svar --> `invalidateQueries` --> visa toast
- **2 undantag** som redan har optimistisk logik: kalender-drag (`useOptimisticUpdates`) och personalplanering (`useUnifiedStaffOperations`)
- Ingen av de vanliga CRUD-operationerna (uppgifter, kommentarer, status, ekonomi) använder `onMutate`

## Strategi

Istället för att skriva om varje hook individuellt skapar vi en **generisk hjälpfunktion** som kapslar in React Querys optimistiska mönster (`onMutate` / `onError` / `onSettled`). Sedan applicerar vi den på de hooks som ger störst upplevd hastighetsförbättring.

## Prioriterade hooks (fas 1 -- högst användarfrekvens)

| Hook | Operationer | Effekt |
|------|------------|--------|
| `useProjectDetail` | Uppgift klar/uppdatera/radera, status, kommentarer | Projektvy känns direkt |
| `usePackingDetail` | Uppgift klar/uppdatera/radera, status | Packningsvy känns direkt |
| `useProjectEconomy` | Inköp, offerter, fakturor (add/delete) | Ekonomivy utan fördröjning |
| `useBookingDetail` (status) | Statusbyte på bokningar | Mest använda operationen |

## Teknisk implementation

### Steg 1: Skapa `createOptimisticMutation` hjälpare

En ny fil `src/hooks/useOptimisticMutation.ts` med en generisk funktion som:

```text
1. onMutate: Sparar snapshot av cachen, applicerar optimistisk ändring direkt
2. onError: Återställer till snapshot, visar felmeddelande
3. onSettled: Invaliderar queries för att synka med servern
```

Stöd för tre operationstyper:
- **Update**: Ändrar ett befintligt objekt i en cachad lista
- **Add**: Lägger till ett temporärt objekt (med temp-id) i listan
- **Delete**: Tar bort objektet från listan omedelbart

### Steg 2: Applicera i `useProjectDetail`

Byta ut alla mutations (tasks, status, comments) till att använda `onMutate` med cache-snapshot och direkt UI-uppdatering. Exempel:

- `updateTaskMutation`: När användaren bockar av en uppgift, markeras den omedelbart som klar i UI
- `deleteTaskMutation`: Uppgiften försvinner direkt från listan
- `addCommentMutation`: Kommentaren visas direkt med "skickar..."-indikator

### Steg 3: Applicera i `usePackingDetail`

Samma mönster som projekt -- uppgifter och status uppdateras optimistiskt.

### Steg 4: Applicera i `useProjectEconomy`

Inköp, offerter och fakturor som läggs till/tas bort visas/försvinner direkt i UI.

### Steg 5: Booking-statusbyte

`updateBookingStatus` i bokningsdetaljvyn -- statusändring visas direkt.

## Vad som INTE ändras

- Kalender-drag (redan optimistiskt)
- Personalplanering (redan optimistiskt)
- Filuppladdningar (kan inte vara optimistiska -- servern genererar URL)
- Databasmigreringar: Inga krävs

## Risker och hantering

- **Felaktigt tillagda objekt**: Temp-ID:n rensas vid `onSettled` och ersätts med server-genererade
- **Rollback vid nätverksfel**: `onError` återställer cachen till snapshot, visar tydligt felmeddelande
- **Stale data**: `onSettled` gör alltid `invalidateQueries` så serverns sanning synkas inom sekunder

## Resultat

Alla vanliga operationer (uppgifter, status, kommentarer, ekonomi) kommer upplevas som **omedelbart** responsiva. Fördröjningen elimineras helt i normalfallet och fel hanteras graciöst med automatisk rollback.

