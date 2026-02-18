
## Fix: Föräldarraden ska visa förälderns egna kostnader

### Problem
`renderGroupRows` i `ProductCostsCard.tsx` (rad 96–102) summerar förälderns + alla barns kostnader via `allItems.reduce`:

```ts
const allItems = [group.parent, ...group.children];
const groupAssembly = allItems.reduce((s, p) => s + p.assemblyCost, 0); // FEL
```

Det gör att t.ex. Multiflex 10x21 visar 31 626 (12 600 + 11 151 + 7 875) istället för korrekt 12 600.

### Lösning
Byt ut de fem reduce-raderna (97–102) mot förälderns egna värden:

```ts
const groupRev      = group.parent.totalRevenue;
const groupCost     = group.parent.totalCost;
const groupAssembly = group.parent.assemblyCost;
const groupHandling = group.parent.handlingCost;
const groupPurchase = group.parent.purchaseCost;
```

### Fil att ändra
| Fil | Rad | Ändring |
|---|---|---|
| `src/components/project/ProductCostsCard.tsx` | 97–102 | Byt reduce-summeringar mot `group.parent.*`-värden |

En rad ändring, rätt utfall.
