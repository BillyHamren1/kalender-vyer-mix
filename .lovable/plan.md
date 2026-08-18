# Avsluta projekt: tydlig väg + interna projekt ur listan

## Vad som händer idag (verifierat)

- "Väntar på avslut" på /projects listar allt som inte har status `completed` och vars eventdatum passerat. Det är bara en visning — det finns ingen knapp där för att stänga något.
- Själva avslutsfunktionen finns redan, men på en annan sida: `/projects/closing` (Projektavslut). Där expanderar man ett projekt, ser tidrapporter/utlägg och får knappen "Stäng projekt" (synkar till Booking först, sätter sedan status `completed`).
- Interna Lager-projekt (`is_internal = true`, status `in_progress`, utan eget eventdatum) plockas in i båda listorna via sin interna bokning. De ska aldrig kunna stängas — projektservicen blockerar redan avbokning av interna projekt, men listorna filtrerar dem inte bort.

## Åtgärder

1. **Uteslut interna projekt** från "Väntar på avslut", från räknaren "varav Väntar på avslut" och från avslutslistan på /projects/closing. Gäller projekt med `is_internal = true` (t.ex. Lager) samt interna lagerprojektgrupper.
2. **Gör vägen till avslut synlig**: kortet "Väntar på avslut" på /projects får en länk/knapp "Öppna projektavslut" som går till /projects/closing, och varje rad klickar vidare direkt till avslutsvyn för det projektet i stället för bara projektsidan.
3. **Förtydliga copy** i avslutsvyn: kort hjälptext om att avslut kräver godkända tidrapporter och utlägg, och att synk till Booking sker innan projektet stängs (det är dagens faktiska spärr — blockerare visas redan per projekt).

## Teknisk detalj

- `src/components/project/ProjectDashboardWidgets.tsx`: lägg `is_internal`-filter i `unified`-byggandet (medium-projekt) och i `attentionProjects`/`closingCount`. Lägg header-knapp till `/projects/closing`.
- `src/components/project/ClosingProjectsList.tsx`: filtrera bort `p.is_internal` (och motsvarande interna jobb/projektgrupper) i `closingItems`.
- Ingen ändring i avslutslogiken (`syncBookingsForInvoicing` → `status: 'completed'`) och inga DB-ändringar.
