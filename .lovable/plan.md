
## Problemet

`useState` lazy-init (`() => new Set(...)`) körs bara **en gång** — vid första renderingen. Om `productCosts.products` är tom vid den tidpunkten (data laddas asynkront), skapas `expandedGroups` som en tom Set och alla grupper startar kollapsade. Senare när data väl laddats in renderas tabellen men expandedGroups uppdateras aldrig automatiskt.

## Lösning

Ersätt `useState` med ett `useMemo` som alltid är synkroniserat med `groupedProducts`:

```typescript
// NUVARANDE (fel — körs bara en gång vid mount):
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
  () => new Set(groupedProducts.filter(g => g.children.length > 0).map(g => g.parent.id))
);

// NY (korrekt — beräknas om när groupedProducts ändras):
const defaultExpanded = useMemo(
  () => new Set(groupedProducts.filter(g => g.children.length > 0).map(g => g.parent.id)),
  [groupedProducts]
);
const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

useEffect(() => {
  setExpandedGroups(defaultExpanded);
}, [defaultExpanded]);
```

Alternativt — enklare lösning: Istället för att hålla state, beräkna "är denna grupp expanderad?" dynamiskt. Om en grupp aldrig har klickats på, visa den som expanderad. Använd en `collapsedGroups` Set istället (tom från start = allt expanderat), och toggle lägger till/tar bort ID från collapsed-set:

```typescript
// Tom Set från start = alla expanderade
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

const toggleGroup = (id: string) => {
  setCollapsedGroups(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
};

// I renderGroupRows:
const isExpanded = !collapsedGroups.has(group.parent.id);
```

Detta är den enklaste och mest robusta lösningen — inga `useEffect` eller timing-problem.

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/project/ProductCostsCard.tsx` | Byt från `expandedGroups` (tom från start) till `collapsedGroups` (tom från start = allt expanderat). En grupp kollapsar när man klickar, och expanderar igen vid nytt klick. |

## Beteende efter fix

- Alla förälderprodukter med barn (t.ex. Multiflex 10x21) visas **expanderade från start**
- Barn (↳ Kassetgolv, ↳ Nålfiltsmatta etc.) syns direkt utan att klicka
- Klick på föräldrad kollapsar barnen (som önskat)
- Klick igen expanderar dem på nytt
- Ingen timing-problematik med asynkron data
