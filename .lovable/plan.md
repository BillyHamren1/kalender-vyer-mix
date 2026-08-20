# Lageraktivering: personal som "är aktiverad" syns inte i kalendern

## Vad datan visar

Det finns 9 rader med `is_active = true` i lageraktiveringarna, men bara 3 av dem gäller idag:

| Person | Typ | Giltig |
|---|---|---|
| Nana Yaw Antwi | permanent | ja |
| Raivis Minalto | permanent | ja |
| Ivars Cipans | permanent | ja |
| Armands Birznieks | tillfällig 16 apr – 24 apr | nej, utgången |
| Matīss Ulmis | tillfällig 16 apr – 24 apr | nej, utgången |
| Kristaps Ruža | tillfällig 16 apr – 24 apr | nej, utgången |
| Kevins Oskars Trumpekojs | tillfällig 16 apr – 24 apr | nej, utgången |
| Jānis Puriņš | tillfällig, utgången + personalen inaktiv | nej |
| Kristiāns Krisjuks | tillfällig, utgången + personalen inaktiv | nej |

Kalendern räknar en tillfällig aktivering som giltig endast mellan start- och slutdatum. Slutdatumet 24 april har passerat, så de personerna filtreras bort trots att raden ser "aktiv" ut. Kryssrutan är alltså inte trasig — perioden har löpt ut, och det finns idag ingen knapp i gränssnittet för att förlänga eller göra om dem till permanenta.

## Vad som byggs

1. **Panel "Lagerpersonal" i lagerkalendern**
   Knapp i kalenderns huvud som öppnar en panel med all personal som har taggen **Lager** (aktiv personal). Per person visas nuvarande status: Permanent aktiv / Aktiv t.o.m. datum / Utgången (med datum) / Ej aktiverad.

2. **Åtgärder per person**
   - Aktivera tillsvidare (permanent)
   - Aktivera för period (start- och slutdatum)
   - Avaktivera
   Detta använder den befintliga aktiveringslogiken som redan finns i koden men aldrig monterats i något gränssnitt.

3. **Tydlig markering av utgångna aktiveringar**
   Utgångna perioder visas med varningsfärg och en "Förläng"-genväg, så att man aldrig igen tror att någon är bemanningsbar när perioden gått ut.

4. **Endast Lager-taggade**
   Panelen listar bara personal med Lager-taggen, enligt önskemål. Saknas taggen står det tydligt att den sätts på personalkortet först.

## Tekniska detaljer

- Ny panel-komponent under `src/components/warehouse/`, monterad i `src/pages/WarehouseCalendarPage.tsx` bredvid befintliga kontroller. Kalenderns rutnät, kort och layout rörs inte.
- Använder befintlig `useWarehouseStaffActivations` (`activatePermanent`, `activateTemporary`, `deactivate`) — ingen ny datamodell, inga migrationer.
- Efter mutation invalideras `warehouse-staff-activations` och `available-staff-week` så kalendern uppdateras direkt.
- Statuslogiken (permanent / pågående / utgången) läggs i en liten ren hjälpfunktion med enhetstest, så att "utgången" alltid räknas likadant som i kalenderfiltret.
- Ingen ändring av kalenderns filterlogik i `useAvailableStaffWeek` eller `useUnifiedStaffOperations`.
