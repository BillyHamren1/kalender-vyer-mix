# Laddtidsgranskning 2026-10-18

## Mätgräns

76 fasta adresser testades före/efter med nytt webbläsarsammanhang per adress, Chromium 1280×1800 och localhost-preview. 74 adresser landade på inloggning; dessa siffror är **inte** inloggad data- eller sidladdning. Parameteriserade projektdetaljer saknar tillgänglig behörig session och ingår inte. Ingen tokenmintning, produktionsskrivning, deployment eller publicering utfördes.

Ready = navigeringsstart till synligt innehåll med fält eller rubrik. Preview serverar utvecklingsmoduler: byte- och tidsvärden ska inte tolkas som publicerad produktionsprestanda. En före/efterkörning per adress; skillnader inkluderar nätverk/kompilering, inte en statistiskt säker SLA.

## Resultat

- Median start: 1418 → 657 ms (54 % lägre).
- Median resurser vid mätpunkten: 250 → 121.
- Median överföring vid mätpunkten: 14 549 398 → 7 072 048 byte.
- Inga pageerror i kontrollerna.
- /auth/reset utan giltig återställningslänk visar ”Verifierar återställningslänk…” och uppfyller inte mätkriteriet; inte verifierad som fungerande återställningsresa.

## Ändringar

- Sekundära sidor, Planning/Lager-layout, mobillayout och native-skal läses på begäran via befintlig lazyWithRecovery.
- Ekonomins Booking-datum och ekonomibatch startar parallellt efter projektläsningen.
- Datum hämtas tenant-scopat i batcher om högst 200 ID; datumfel propageras.
- Ekonomiöversiktens query key inkluderar organisation; redundanta overview-hämtningar inaktiveras när externa projekt används.
- Optimistisk statusuppdatering använder befintliga query-prefix så den tenantnycklade översikten fortsätter uppdateras.
- Inga ändrade källor, datumregler, ekonomiformler eller serverbudgetar.

## Tester och begränsningar

- 33 berörda tester gröna via isolerad Vitest 3.2.4. Ordinarie npm test kan inte starta på grund av befintlig Vitest 4/Vite 5-inkompatibilitet (isFileLoadingAllowed).
- Ytterligare kontroll av simpleProjectWorkspace.static.test.ts: 3 äldre assertions fallerar eftersom de väntar direkt Booking-skrivning, gamla datumfält och lila rubrik/actions; dessa är oberoende av laddningsändringarna och ändrades inte.
- Preview build OK 2026-10-18T02:16:59Z.
- Inloggad ekonomi, schema, lager, övriga datasidor och projektdetaljer: blockerade av external_unmanaged utan tillgänglig behörig session. Ingen påstådd komplett end-to-end-verifiering.

## Alla fasta adresser

| Adress | Före ms | Efter ms | Observerad vy |
|---|---:|---:|---|
| / | 1453 | 914 | /auth |
| /admin/crash-reports | 1310 | 691 | /auth |
| /admin/legacy-incoming-packing | 1776 | 497 | /auth |
| /admin/presence | 1717 | 688 | /auth |
| /admin/presence/day-overview | 1459 | 621 | /auth |
| /admin/staff-live | 1529 | 615 | /auth |
| /admin/staff-presence | 1558 | 476 | /auth |
| /admin/sync | 1560 | 565 | /auth |
| /admin/time-debug | 1552 | 692 | /auth |
| /admin/time-intelligence-debug | 1574 | 613 | /auth |
| /admin/time-review | 1372 | 612 | /auth |
| /admin/warehouse-assignments-debug | 1540 | 619 | /auth |
| /admin/warehouse-selftest | 1263 | 602 | /auth |
| /analytics | 1383 | 575 | /auth |
| /api-docs | 1233 | 675 | /auth |
| /auth | 1287 | 716 | /auth |
| /auth/reset | ej mätbar | ej mätbar | reset verifieringsväntan |
| /booking-list | 1250 | 730 | /auth |
| /calendar | 1211 | 559 | /auth |
| /communication | 1418 | 788 | /auth |
| /dashboard | 1491 | 474 | /auth |
| /economy | 1416 | 594 | /auth |
| /invoicing | 1382 | 768 | /auth |
| /logistics | 1351 | 693 | /auth |
| /logistics/planning | 1411 | 570 | /auth |
| /logistics/routes | 1464 | 602 | /auth |
| /logistics/vehicles | 1487 | 466 | /auth |
| /m | 1497 | 748 | /m/login |
| /m/day-review | 1343 | 617 | /m/login |
| /m/expenses | 1445 | 588 | /m/login |
| /m/inbox | 1432 | 604 | /m/login |
| /m/login | 1420 | 891 | /m/login |
| /m/my-flags | 1391 | 664 | /m/login |
| /m/overview | 1751 | 620 | /m/login |
| /m/profile | 1590 | 615 | /m/login |
| /m/report | 1661 | 587 | /m/login |
| /m/time-history | 1538 | 703 | /m/login |
| /my-page | 1720 | 881 | /auth |
| /my-page/calendar | 1682 | 747 | /auth |
| /my-page/projects | 1538 | 792 | /auth |
| /my-page/todos | 1627 | 584 | /auth |
| /my-projects | 1306 | 752 | /auth |
| /ops-control | 1188 | 940 | /auth |
| /personalkalendern | 1549 | 989 | /personalkalendern/login |
| /personalkalendern/login | 1369 | 883 | /personalkalendern/login |
| /project-planning | 1281 | 808 | /auth |
| /projects | 1270 | 576 | /auth |
| /projects/archive | 1238 | 642 | /auth |
| /projects/closing | 1375 | 773 | /auth |
| /scanner | 1366 | 512 | /scanner/login |
| /scanner/login | 1566 | 727 | /scanner/login |
| /staff-dashboard | 1277 | 571 | /auth |
| /staff-management | 1467 | 556 | /auth |
| /staff-management/ai-learned-rules | 1393 | 655 | /auth |
| /staff-management/day-reports | 1243 | 707 | /auth |
| /staff-management/gps-satellite-map | 1300 | 547 | /auth |
| /staff-management/payroll-month-report | 1372 | 504 | /auth |
| /staff-management/payroll-periods | 1382 | 611 | /auth |
| /staff-management/time | 1453 | 752 | /auth |
| /staff-management/time-approvals | 1472 | 487 | /auth |
| /staff-management/time-approvals-legacy | 1393 | 585 | /auth |
| /staff-management/time-reports | 1419 | 824 | /auth |
| /staff-management/time-reports/month | 1586 | 657 | /auth |
| /suppliers | 1791 | 943 | /auth |
| /time-v2 | 1228 | 888 | /auth |
| /time-v2/expenses | 1460 | 954 | /auth |
| /time-v2/operations | 1380 | 757 | /auth |
| /time-v2/personnel | 1363 | 701 | /auth |
| /time-v2/review | 1417 | 544 | /auth |
| /transport-svar | 1353 | 603 | /transport-svar |
| /warehouse | 1410 | 676 | /auth |
| /warehouse/calendar | 1442 | 707 | /auth |
| /warehouse/economy | 1503 | 858 | /auth |
| /warehouse/inventory | 1238 | 682 | /auth |
| /warehouse/packing | 1258 | 747 | /auth |
| /warehouse/service | 1456 | 584 | /auth |
