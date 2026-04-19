
**Mål:** Komprimera staff-kort i `WarehouseStaffActivationCard.tsx` rejält och ta bort "X poster"-raden.

**Ändringar (1 fil: `src/components/warehouse-dashboard/WarehouseStaffActivationCard.tsx`):**

1. **Ta bort "X poster / Ledig"-raden** under namnet helt.
2. **Komprimera staff-grupp-kortet:**
   - `p-3` → `p-2`
   - `mb-2` (header) → `mb-1`
   - Namn: `text-sm` → `text-xs font-semibold`
3. **Komprimera Aktiv-badge:** mindre padding, `text-[10px]`, ingen extra höjd.
4. **Komprimera ScheduleItemRow:**
   - `px-2 py-1.5` → `px-1.5 py-0.5`
   - `gap-2` → `gap-1.5`
   - Tidsstämpel + titel på samma rad redan — minska radavstånd `mt-0.5` → `mt-0`
   - Meta-rad (UTE I FÄLT • TEAM 1 • #P-...): `text-[10px]` → `text-[9px]`, `gap-1.5` → `gap-1`
5. **Komprimera yttre container:** `p-4` → `p-2`, `space-y-3` → `space-y-1.5`, header `p-4 pb-3` → `p-3 pb-2`.
6. **Date-grupperingsblock (vecka/månad):** `p-2` → `p-1.5`, `mb-1` → `mb-0.5`.

Resultat: kortet i screenshoten krymper från ~110px → ~55px höjd. Ingen logikändring, endast spacing/typografi.
