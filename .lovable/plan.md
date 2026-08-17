# Fixa kraschen på /warehouse/packing (och lagerkalendern)

## Vad som händer

Sidan kraschar direkt vid laddning med `progressMap.get is not a function`.

Orsak (verifierad):
- `usePackingProgressBatch` returnerar ett `Map` som queryns data.
- React Query-cachen sparas i localStorage (`PersistQueryClientProvider` i `src/App.tsx`), och vid återläsning blir ett `Map` ett vanligt objekt `{}` — som saknar `.get()`.
- `PackingActiveWork` anropar `progressMap.get(...)` → krasch → felgränsen visar "Appen stötte på ett fel".

Samma fälla finns i `useWarehouseCardMeta` (tre queries som returnerar `Map`), som används av lagerkalenderns kort — så lagerkalendern riskerar exakt samma krasch efter en omladdning.

## Åtgärd

1. **Global spärr i `src/App.tsx`**: persistera inte queries vars data innehåller `Map`/`Set` (icke JSON-säker data). Då kan en rehydrerad cache aldrig ge ett trasigt `Map` igen.
2. **Robust hook**: i `usePackingProgress.ts` normalisera resultatet — om `query.data` inte är ett riktigt `Map` (t.ex. objekt från gammal cache), bygg om det till ett `Map` innan det returneras.
3. **Samma normalisering i `useWarehouseCardMeta.ts`** för de tre Map-baserade queries som lagerkorten läser.
4. **Rensa befintlig trasig cache**: höj `PERSIST_BUSTER` i `src/App.tsx` så att alla användare med redan sparad, trasig cache får den kastad automatiskt (ingen manuell cache-rensning behövs).

Inga ändringar i backend, datamodell, kalenderns utseende/funktion eller packningslogik. Endast cache-hantering och defensiv datanormalisering.

## Verifiering

- Nytt testfall som säkerställer att en rehydrerad (JSON-serialiserad) cache aldrig ger `.get is not a function` — dvs. hookarnas normalisering fungerar på både `Map` och vanligt objekt.
- Test som låser att `shouldDehydrateQuery` nekar data som innehåller `Map`/`Set`.
- Kör hela testsviten samt laddar `/warehouse/packing` och `/warehouse/calendar` i preview och kontrollerar att inga runtime-fel loggas.
