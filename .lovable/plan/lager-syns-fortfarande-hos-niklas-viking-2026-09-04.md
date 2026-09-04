# Lager syns fortfarande hos Niklas Viking

## Vad som faktiskt är fel

Flaggan `organizations.internal_lager_enabled` finns och är påslagen endast för Frans August AB — Niklas Viking Production AB har den avstängd. Men flaggan stoppar bara att NYA interna Lager-upplägg skapas. Varje organisation har sedan tidigare redan en intern projektrad (`projects.is_internal = true`), och kalenderhooken som ritar de blå "Lager"-rutorna läser den raden helt utan att bry sig om flaggan. Därför fylls månadsvyn hos Viking fortfarande med "Lager" varje dag.

## Åtgärd

Gör flaggan till den enda grinden för att visa Lager i planeringen:

1. Hämta organisationens `internal_lager_enabled` en gång (liten delad hook) och returnera inga Lager-block alls när flaggan är av. Ingen befintlig data raderas — Vikings gamla interna projektrad ligger kvar orörd, den ritas bara inte längre ut.
2. Samma grind på de andra ställen där det konstanta Lagret läcker in i Planning-vyn: Lager-kolumnen/blocken i planeringskalendern (vecka, dag, månad) och Lager-kortet i placeringsdialogens dagkalender.
3. Frans Augusts vy ska vara oförändrad före/efter.

## Teknisk beskrivning

- Ny hook `src/hooks/useInternalLagerEnabled.ts`: läser `organizations.internal_lager_enabled` för inloggad org (via `get_user_organization_id`-scopad query), cachad.
- `src/hooks/useInternalLagerCalendarEvents.ts`: returnera `internalLagerEvents: []` när flaggan är av (early return före projektqueryn, så ingen onödig läsning görs).
- Kontroll av övriga konsumenter av `projects.is_internal` i Planning-ytan (`useWarehouseOpsRange`, `warehouseProjectService.getInternalLagerProject`, `PlacementDayCalendar` via samma hook) så att ingen av dem visar Lager-kolumnen för en org utan flaggan. Warehouse-modulen och mobil/Time rörs inte utöver den redan befintliga backend-grinden.
- Inga migrationer, inga DELETE, inga ändringar i triggrar.

## Verifiering

- Utökat test i `src/hooks/__tests__/useInternalLagerCalendarEvents.test.tsx`: flagga av → 0 event; flagga på → event som idag.
- Kör vitest-sviten och bygget.
- Preview-körning av `/calendar` i månadsvy för att bekräfta att inga "Lager"-rutor renderas när flaggan är av.
