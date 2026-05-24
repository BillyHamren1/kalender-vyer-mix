## Mål

Veckopanelen ska ligga **ovanför kartan** och visa de 7 dagarna **horisontellt** (mån–sön i en rad), inte som en vertikal lista i en sidopanel. Vald dag expanderar nedåt och visar geofence-besöken — fortfarande ovanför kartan.

## Layout (ny)

```text
┌─────────────────────────────────────────────────────────┐
│ Person ▾   ◀ Vecka 21 (18–24 maj 2026) ▶   Idag        │
├─────────────────────────────────────────────────────────┤
│ Mån 18/5 │ Tis 19/5 │ Ons 20/5 │ Tors 21/5 │ Fre 22/5 │ Lör │ Sön │
│ 13h 20m  │ 11h 54m  │ Endast   │ 16h 40m   │ 14h 6m ● │ ... │ —   │
│          │          │ hemma    │           │ (vald)   │     │     │
├─────────────────────────────────────────────────────────┤
│ ▼ Fre 22/5 — geofence-besök (FA Warehouse, projekt …)  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                       KARTA                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Ändringar

### 1) `StaffGpsWeekPanel.tsx` — bygg om som horisontell topbar
- Byt ytter-`<aside>` från `w-[400px]` sidopanel → full bredd-kort `w-full`.
- Person-select + vecknavigation läggs på **en rad** högst upp (person till vänster, veckopil/Idag till höger).
- Dagrutorna renderas i ett **7-koloners grid** (`grid grid-cols-7`) istället för vertikal lista. Varje cell visar veckodag, datum, total ("13h 20m" / "Endast hemma" / "—"), och markeras när vald.
- Ny komponent `StaffGpsDayCell` (eller variant via prop på `StaffGpsDayRow`) för det kompakta horisontella formatet.
- Vald dags besökslista (samma `GeofenceVisitRows`) renderas **under** grid:et, full bredd — inte inuti cellen.

### 2) `StaffGpsSatelliteMap.tsx` — vertikal stack
- Byt ytter-layouten från `flex md:flex-row` → `flex flex-col gap-4`.
- Ordning: `<StaffGpsWeekPanel … />` först, sedan kart-kolumnen (`flex-1`).
- Ta bort `w-[400px]`-bredd; kartan får full bredd.

### 3) Inga ändringar i datakällor
- `useStaffGpsWeekSummary`, `useMobileStaffDayPings`, `GeofenceVisitRows` återanvänds oförändrat.
- Tidsdata, geofence-logik och known-sites berörs inte.

## Responsivt
- ≥ md: 7 kolumner horisontellt.
- < md (mobil): faller tillbaka till 2 rader á 4/3 kolumner (`grid-cols-4 md:grid-cols-7`) eller horisontell scroll. Default: `grid-cols-7` med `text-[11px]` så det får plats i 1245px-vyn användaren är på nu.

## Filer som ändras
- `src/components/staff/StaffGpsWeekPanel.tsx` (omstrukturerad)
- `src/components/staff/StaffGpsSatelliteMap.tsx` (vertikal stack)
- `src/components/staff/StaffGpsDayRow.tsx` (lägg till `variant="horizontal"` eller ny `StaffGpsDayCell.tsx`)

Inga DB-, hook- eller affärslogikändringar.
