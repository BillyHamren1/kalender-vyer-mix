# Plan

Jag ändrar projektkalendern så att dess datum blir exakt samma som **stora projektets datum** och aldrig längre påverkas av underbokningar eller plan-items.

## Det jag bygger

1. **Byt datumkälla för projektkalendern**
   - Projektkalenderns dagar ska byggas från `large_projects.start_date`, `large_projects.event_date` och `large_projects.end_date`.
   - Bokningars `rigdaydate/eventdate/rigdowndate`, `calendar_events` och `large_project_booking_plan_items.plan_date` ska **inte längre få utöka datumspannet**.

2. **Behåll planeringen, men utan att den styr kalenderns spann**
   - Befintliga bokningar och plan-items finns kvar som data.
   - Om något ligger utanför stora projektets datum ska det **inte skapa extra datum i projektkalendern**.
   - Jag rör inte databasen och skriver inte om några datum i befintliga bokningar.

3. **Lägg till skyddande tester**
   - Test som verifierar att kalendern följer stora projektets datum 1:1.
   - Test som verifierar att en avvikande underbokning (som 29 maj / 26 juni-fallet) inte kan dra ut kalendern.
   - Test som verifierar att ett `plan_item` utanför projektets datum inte skapar nya kalenderdagar.

4. **Validera i preview och testsvit**
   - Jag verifierar att kalenderns range-label och dagkolumner matchar headerns stora projektdatum.
   - Jag kör relevanta tester direkt efter ändringen.

## Tekniskt

- Uppdatera `largeProjectPlannerService.ts` så att `fetchLargeProjectPlannerContext()` även läser stora projektets datum-arrayer.
- Ändra `buildProjectDays()` till att använda **endast** stora projektets datum-arrayer som källa för synliga dagar.
- Justera typerna i planner-contexten om det behövs för att bära projektets datum separat från bokningarnas datum.
- Uppdatera/utöka testfilen för planner-service så att detta blir låst framåt.

```text
Ny sanning för projektkalendern:
large_projects.start_date/event_date/end_date
            ↓
      buildProjectDays()
            ↓
   visade dagar i projektkalendern
```

## Resultat efter ändringen

Projektkalendern kommer att visa **exakt samma datum som stora projektets datumkort**. Inga enskilda bokningar eller gamla plan-items ska längre kunna lägga till egna extra dagar.