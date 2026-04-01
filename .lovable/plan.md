

## Plan: Ta bort Stängningskontroll

Tar bort `ProjectClosureGate`-komponenten och all relaterad logik från ekonomivyn.

### Ändringar

| Fil | Ändring |
|---|---|
| `src/components/project/ProjectEconomyTab.tsx` | Ta bort import av `ProjectClosureGate`, ta bort `closureGates`-beräkningen, ta bort renderingen (rad 356-357), ta bort gates-prop från `ProjectClosureDialog` |
| `src/components/project/ProjectClosureDialog.tsx` | Ta bort `ProjectClosureGate`-import och rendering inuti dialogen, ta bort `gates`-prop |
| `src/components/economy/ProjectClosureGate.tsx` | Radera filen |
| `src/lib/economy/projectEconomyStatus.ts` | Ta bort `buildGateItemsFromSignals`-funktionen och `GateItem`-importen |

Stäng-knappen och stängningsdialogen behålls — det är bara den opålitliga checklistan som tas bort.

