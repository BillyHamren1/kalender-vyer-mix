Lägg till en länk till den nya "GPS satellitkarta"-vyn i huvudsidebaren under sektionen **Personal**, så den blir lätt åtkomlig utan att gå via Tidrapporter.

## Ändring

I `src/components/Sidebar3D.tsx`:

1. Importera `Satellite`-ikonen från `lucide-react`.
2. Lägg till en ny `NavChild` i `Personal`-gruppens `children`:
   - title: "GPS satellitkarta"
   - url: "/staff-management/gps-satellite-map"
   - icon: Satellite

Resultat: Personal-gruppen får en ny rad sist:

```text
Personal
├─ Personalöversikt
├─ Personalplanering
├─ Personalkalendern (publik)
├─ Tidrapporter
└─ GPS satellitkarta   ← ny
```

## Påverkan

- Ingen ändring av routing (route finns redan registrerad i `src/App.tsx`).
- Ingen ändring av befintlig funktionalitet — endast en additiv menypost.
- Active-state, collapsed-läge och badge-logik fungerar automatiskt via befintlig sidebar-kod.