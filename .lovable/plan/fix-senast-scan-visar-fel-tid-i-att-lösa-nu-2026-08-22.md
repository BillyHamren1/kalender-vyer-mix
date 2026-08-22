# Fix: "senast scan" visar fel tid i Att lösa nu

## Vad som händer

Texten "senast scan 8h 44m" betyder i dag inte att någon har scannat. Fältet bakom texten (`lastActivityAt`) beräknas som det senaste av tre värden:

1. senaste faktiska scan (allokering av artikel)
2. `signed_at` på packningen
3. `updated_at` på packningsraden — dvs. valfri systemuppdatering (statusändring, sync från Booking, produktändring, engångsfixar)

Om ingen har scannat alls faller värdet tillbaka på `updated_at`, och listan påstår ändå "senast scan X sedan". Därför visas "0% packat · senast scan 8h 44m" trots att inget är scannat. Samma fallback används i "paus"-raden ("Inget scannat på ...").

## Vad som ska ändras

- Separera två begrepp i lager-OPS-datat:
  - `lastScanAt` — enbart verkliga scans (senaste allokeringens tidsstämpel för packningen).
  - `lastActivityAt` — behålls som i dag för sortering/aktivitet, men får aldrig presenteras som scan.
- "Att lösa nu"-raden för försenad/dagens UT visar:
  - finns scan: `X% packat · senast scan <tid>`
  - ingen scan: `0% packat · ingen har scannat än`
- "Paus"-raden (stillastående) triggas bara på verklig `lastScanAt`, inte på `updated_at`. Utan scans visas ingen paus-rad.

Inga statusändringar, inga datamigreringar, inga ändringar i scanner-flödet — bara korrekt läsning och text.

## Teknisk detalj

- `src/hooks/useWarehouseOpsRange.ts`: lägg till `lastScanAt: string | null` på `OpsJob`, satt enbart från allokeringarnas `created_at` (samma karta som `workers`). Låt `lastActivityAt` vara kvar oförändrad.
- `computeAttention`: använd `lastScanAt` i regel 1 (UT försenad/idag) och regel 3 (paus).
- Kontrakttest `src/test/warehouseOpsLastScan.contract.test.ts`: packning utan allokeringar men med färsk `updated_at` ska ge "ingen har scannat än" och ingen paus-rad; med allokering ska tiden matcha scanen.
- Kör build, typecheck och warehouse-kontraktstesterna.
