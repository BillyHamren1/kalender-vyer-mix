# Lagerkalendern: Lager-tagg + tillgänglighet ska räcka

## Problemet

Idag krävs TVÅ saker för att en person ska gå att bemanna i lagerkalendern:

1. Taggen **Lager** på personalkortet (många har den — se listan).
2. En separat, dold "lageraktivering" som inte längre går att sätta någonstans i gränssnittet.

I databasen finns bara 3 personer med giltig aktivering (tre permanenta). Sex till hade tillfälliga aktiveringar som gick ut 24 april 2026. Alla andra Lager-taggade filtreras därför bort, trots att de är aktiva och tillgängliga.

## Vad som ändras

Lagerkalendern ska bemannas enligt samma enkla regel som du beskriver:

- Personen är **aktiv** personal, och
- har taggen **Lager**, och
- är **tillgänglig** det datumet (ingen "Unavailable"- eller "Blocked"-period som täcker dagen).

Personer med Unavailable eller Blocked den dagen visas inte — precis som i personalkalendern.

Det dolda aktiveringskravet tas bort som spärr. Personal som dragits in i Lager-kolumnen i planeringskalendern fortsätter att fungera som idag.

## Effekt

- Alla Lager-taggade och tillgängliga personer blir valbara i lagerkalenderns personalgardin direkt.
- Inaktiv personal (t.ex. Kristiāns Krisjuks, Eduards Žukovs) syns fortfarande inte.
- Utgångna aktiveringsperioder kan aldrig mer tysta bort personal av misstag.

## Tekniska detaljer

- `src/pages/WarehouseCalendarPage.tsx`: slutar skicka `activatedStaffIds` / `activatedStaffByDate` som hård begränsning till kalendern och till `useUnifiedStaffOperations`; tagg-filtret `Lager` behålls.
- `useWarehouseAvailableStaff` i `src/hooks/useWarehouseStaffActivations.ts` görs till en icke-blockerande källa (används inte längre för att filtrera bort personal). Tabellen `warehouse_staff_activations` rörs inte — ingen migration, ingen data raderas.
- Tillgänglighetsregeln ligger redan i `staffAvailabilityService` / `useUnifiedStaffOperations` (unavailable och blocked filtreras bort, saknad post = tillgänglig) och behålls oförändrad.
- Kalenderns rutnät, kort och visuella utformning ändras inte.
- Nytt test som verifierar att en Lager-taggad tillgänglig person utan aktivering blir valbar, och att en blockerad/unavailable person inte blir det.
