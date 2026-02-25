

# Plan: Lägg till toggle-knapp för att dölja/visa sidebar

## Problem
Båda sidebars (`Sidebar3D` och `WarehouseSidebar3D`) har redan `isCollapsed`-state men saknar en knapp för att toggla den. Användaren kan inte dölja sidebaren.

## Lösning
Lägg till en liten toggle-knapp (chevron-ikon) högst upp i varje sidebar som kollapsar den till en smal 14-vy (bara ikoner) och expanderar tillbaka till full bredd.

### Ändringar

**1. `src/components/Sidebar3D.tsx`**
- Importera `PanelLeftClose` / `PanelLeftOpen` från lucide-react
- Lägg till en toggle-knapp överst i sidebar-content (före nav), som kör `setIsCollapsed(!isCollapsed)`
- Knappen visar `PanelLeftClose` när expanded, `PanelLeftOpen` när collapsed

**2. `src/components/WarehouseSidebar3D.tsx`**
- Samma ändring som ovan, med warehouse-accentfärger på hover

Beteende:
- Collapsed = `w-14`, bara ikoner visas (redan implementerat i koden)
- Expanded = `w-48`, ikoner + text (redan implementerat)
- Toggle-knappen syns i båda lägena

