

## Fix: Personalval i etableringsuppgifter

### Vad som är fel
1. **Fallback-logik**: `hasStaffPool` kollar `staffPool.length > 0`, vilket betyder att en tom array (`[]`) triggar en fetch av ALL aktiv personal — helt fel beteende för stora projekt.
2. **Dropdownen borde redan synas** i koden (rad 250-268), men det kan finnas en stale preview. Inga kodändringar behövs för renderingen — den är redan ovillkorlig.

### Ändring i `EstablishmentTaskDetailSheet.tsx`

**Rad 86-101** — Ändra logiken:

```typescript
// FRÅN:
const hasStaffPool = staffPool && staffPool.length > 0;
const { data: allStaffMembers = [] } = useQuery({
  ...
  enabled: !hasStaffPool,
});
const effectiveStaff: StaffMember[] = hasStaffPool ? staffPool : allStaffMembers;

// TILL:
const shouldFetchAll = staffPool === undefined;
const { data: allStaffMembers = [] } = useQuery({
  ...
  enabled: shouldFetchAll,
});
const effectiveStaff: StaffMember[] = staffPool !== undefined ? staffPool : allStaffMembers;
```

Detta gör att:
- **Medelstora projekt** (`staffPool` = `undefined`): hämtar all aktiv personal som förut
- **Stora projekt** (`staffPool` = `[]` eller `[...]`): använder exakt den pool som skickas in, ingen fallback — om poolen är tom visas bara "Ingen tilldelad"

### Fil att ändra
- `src/components/project/EstablishmentTaskDetailSheet.tsx` — rad 87-101

