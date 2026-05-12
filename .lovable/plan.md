# Plan

Jag kommer fixa att blocken visas på sina riktiga tider i stället för att skjutas ned visuellt när de överlappar.

## Vad jag ändrar

1. Ta bort den nuvarande vertikala "staplingslogiken" i `StaffGanttView` som flyttar block nedåt med en global cursor.
2. Byta till en rendering där varje block alltid placeras på sin faktiska tidsposition utifrån `startAt` och `endAt`.
3. Hantera eventuella riktiga överlapp utan att förfalska tiden visuellt — antingen genom att låta blocken överlappa i samma kolumn eller genom en smal sidofördelning som inte ändrar `top`.
4. Säkerställa att nu-linjen fortsatt ligger korrekt ovanpå blocken.
5. Lägga till test som fångar regressionen: ett senare block får aldrig renderas lägre än vad dess egna klockslag säger bara för att ett tidigare block överlappar.
6. Verifiera i preview med den aktuella vyn `/staff-management/time-reports` och köra relevanta tester.

## Förväntat resultat

- Ett block med t.ex. `08:17–14:37` ska alltid sluta vid ca 14:37 i griden.
- Ett kort transportblock med `07:08–08:02` ska inte kunna hamna nere vid 15:00 bara för att ett annat block redan ritats.
- Om två block verkligen överlappar ska UI:t visa det som överlapp — inte genom att flytta ett block framåt i tiden.

## Tekniska detaljer

Berörd fil:
- `src/components/staff/StaffGanttView.tsx`

Tester:
- lägga till/uppdatera ett riktat vitest-fall för positioneringslogiken i Gantt-vyn
- köra relevanta tester efter ändringen

## Risk att hålla koll på

- Textläsbarhet om två block faktiskt ligger ovanpå varandra
- z-index/hover så att block fortfarande går att klicka
- att planerade/lila/gröna block inte tappar färg- eller hoverbeteende