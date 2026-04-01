

## Plan: Byt alla gröna färger till teal i ekonomivyn

Alla gröna statusfärger (green/emerald) i ekonomisektionen byts ut mot **teal**.

### Ändringar

**`src/components/project/ProjectEconomyTab.tsx`**
- `bg-green-500` → `bg-teal-500` (signalDot ok)
- `text-green-600` → `text-teal-600` (margin text)
- `bg-green-600 hover:bg-green-700` → `bg-teal-600 hover:bg-teal-700` (stäng-knapp)

**`src/components/project/ProjectClosureDialog.tsx`**
- `text-green-600` → `text-teal-600` (checkmark icon)
- `bg-green-600 hover:bg-green-700` → `bg-teal-600 hover:bg-teal-700` (stäng-knapp)

**`src/pages/ProjectEconomyDetail.tsx`**
- `border-emerald-200 text-emerald-600 bg-emerald-50` → `border-teal-200 text-teal-600 bg-teal-50` (ÖPPEN badge)

**`src/components/economy/EconomyStatusBadge.tsx`**
- Alla `green-*` references → `teal-*` equivalents

