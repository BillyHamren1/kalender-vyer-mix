
# Plan: Skapa WarehouseSidebar3D

## Översikt
Skapa en exakt kopia av `Sidebar3D` för lagersystemet med samma visuella stil men anpassade navigationslänkar för lagerverksamheten.

## Navigationslänkar för Lagersidofältet

| Rubrik | URL | Ikon |
|--------|-----|------|
| Dashboard | `/warehouse` | LayoutDashboard |
| Personalplanering | `/warehouse/calendar` | Calendar |
| Planera packning | `/warehouse/packing` | Package |
| Inventarier | `/warehouse/inventory` | Boxes |
| Service | `/warehouse/service` | Wrench |

## Visuella Anpassningar

**Färgschema (Amber istället för Teal):**
- Primärfärg: `hsl(var(--warehouse))` (amber) istället för `hsl(var(--primary))` (teal)
- Aktiv bakgrund: `bg-warehouse/10` istället för `bg-primary/10`
- Aktiv ikon: `bg-warehouse text-white` istället för `bg-primary text-primary-foreground`
- Box-shadow: `hsl(var(--warehouse) / 0.3)` istället för `hsl(var(--primary) / 0.3)`

**Branding:**
- Logo-text: "Lagersystem" istället för "EventFlow"
- Undertext: "warehouse" istället för "planering"
- Ikon: `Package` eller `Boxes` istället för `Sparkles`

## Teknisk Implementation

### Steg 1: Skapa WarehouseSidebar3D.tsx
Skapa ny fil `src/components/WarehouseSidebar3D.tsx` som är en kopia av `Sidebar3D.tsx` med:
- Uppdaterade `navigationItems` för lager
- Amber-färgschema genomgående
- Anpassad branding

### Steg 2: Uppdatera WarehouseSystemLayout.tsx
- Ersätt `WarehouseTopBar` med `WarehouseSidebar3D`
- Lägg till samma layout-struktur som `MainSystemLayout` med `md:ml-64` margin och `pb-20` padding

### Steg 3: Ta bort WarehouseTopBar (valfritt)
- Kan behållas om du vill ha den tillgänglig, men den används inte längre

## Filändringar

```text
src/
├── components/
│   ├── WarehouseSidebar3D.tsx (NY)
│   └── layouts/
│       └── WarehouseSystemLayout.tsx (ÄNDRAS)
```

## Kodstruktur för WarehouseSidebar3D

```typescript
const navigationItems = [
  { title: "Dashboard", url: "/warehouse", icon: LayoutDashboard, exact: true },
  { title: "Personalplanering", url: "/warehouse/calendar", icon: Calendar },
  { title: "Planera packning", url: "/warehouse/packing", icon: Package },
  { title: "Inventarier", url: "/warehouse/inventory", icon: Boxes },
  { title: "Service", url: "/warehouse/service", icon: Wrench },
];
```

## Resultat
Lagersystemet får ett identiskt sidofält som huvudsystemet, men med:
- Amber/bärnsten färgpalett (warehouse-tema)
- Lagerspecifika navigationslänkar
- Egen branding ("Lagersystem")
