# Ta bort PRELIMINÄR-stämpeln i packlistans utskrift

## Vad som ändras

Den röda rutan "PRELIMINÄR – EJ WMS-VERIFIERAD" högst upp i utskriften tas bort helt. Packlistan skrivs alltid ut ren, utan stämpel, oavsett WMS- eller integritetsläge.

Utskriftsknappen är fortsatt alltid klickbar. Statusindikeringen i själva webbvyn (varningsikonen bredvid knappen) lämnas oförändrad – det är bara PDF:en som blir ren.

## Tekniska detaljer

- `src/lib/packing/printPackingList.ts`: ta bort `preliminaryNotice`-fältet, dess HTML-block och tillhörande `.preliminary`-CSS.
- `src/components/packing/DesktopChecklistView.tsx`: sluta skicka `preliminaryNotice` till utskriften; `printPreliminaryReason` behålls endast för statusraden i UI:t.
- `src/__tests__/packingPrintAlwaysAllowed.test.ts`: uppdatera testen så de låser att utskriften aldrig blockeras och att ingen stämpel renderas.

## Verifiering

- `bunx vitest run` för packlistetesterna.
- Manuell utskriftskoll i preview på aktuell packlista.
