## Plan

Jag kommer att fixa att block-dialogen i `/staff-management/time-reports` går att scrolla igen, utan att ändra någon av blockens klassificerings- eller granskningslogik.

### Det jag kommer att göra
1. Justera layouten i `BlockDetailDialog` i `src/components/staff/StaffGanttView.tsx` så att dialogen får en tydlig intern scroll-yta.
2. Säkerställa att header och tab-rad ligger kvar stabilt medan innehållet under kan scrollas vertikalt.
3. Behålla samma innehåll, samma flikar och samma blockdata som idag — endast scroll-/layoutbeteendet ändras.
4. Verifiera i preview att den långa “Översikt”-vyn kan scrollas hela vägen ned och att dialogen fortfarande fungerar för Karta och Rå GPS.

### Tekniska detaljer
- Nuvarande problem sitter i modalens layout: `DialogContent` är låst med `max-h` + `overflow-hidden`, men den inre containern saknar sannolikt rätt höjd/flex-beteende för att bli en fungerande scroll-container.
- Jag kommer därför att göra dialogen till en vertikal flex/grid-layout med en dedikerad scrollande content-del, istället för att låta hela innehållet expandera fritt.
- Om det behövs använder jag projektets befintliga `ScrollArea` eller en ren `overflow-y-auto`-container med korrekt `min-h-0`/`flex-1` så att scroll faktiskt aktiveras i Radix-dialogen.

### Resultat
Efter ändringen ska man kunna öppna ett block, expandera detaljer och scrolla normalt i popupen utan att något i blocklogiken ändras.