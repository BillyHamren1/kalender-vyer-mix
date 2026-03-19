
# Enhetliga eventfärger i hela appen

## Problem
Det finns 6+ separata `getEventColor`-funktioner med olika färger för samma eventtyper. Rigg, Event och Riv har olika färger beroende på vilken vy man tittar i.

## Lösning
Standardisera på: **Rigg = Grön, Event = Gul, Riv = Röd** (som redan definerat i `ResourceData.ts`). Ta bort alla lokala `getEventColor`-funktioner och importera från en gemensam källa istället.

## Filer som ändras

### 1. `src/components/Calendar/ResourceData.ts` — Exportera även Tailwind-varianter
Lägg till hjälpfunktioner för bg-class och border-class utöver befintlig hex-funktion:
- `getEventBgClass(eventType)` → `'bg-green-100'`, `'bg-yellow-100'`, `'bg-red-100'`
- `getEventDotClass(eventType)` → `'bg-green-500'`, `'bg-yellow-500'`, `'bg-red-500'`

### 2. Ta bort lokala duplicerade `getEventColor` från:
- `src/components/Calendar/StaffBookingsList.tsx` (rad 63-70)
- `src/components/Calendar/MobileDayDetailView.tsx` (rad 41-47)
- `src/components/Calendar/SimpleMonthlyCalendar.tsx` (rad 35-41)
- `src/components/Calendar/MobileMonthlyCalendar.tsx` (rad 33-39)
- `src/components/mobile/MobileEventsList.tsx` (rad 14-25)
- `src/components/mobile/MobileWarehouseEventsList.tsx` (rad 15+)

Ersätt med import från `ResourceData.ts`.

### 3. `src/components/ops-control/OpsStaffTimeline.tsx` (rad 37-41)
Byt `eventTypeColors` från lila/amber/secondary till grön/gul/röd:
```typescript
Rigg:    { bg: 'bg-green-200/75', border: 'border-green-400' }
Event:   { bg: 'bg-yellow-200/75', border: 'border-yellow-400' }
Nedrigg: { bg: 'bg-red-200/75', border: 'border-red-400' }
```

### Sammanfattning
~7 filer ändras. En källa för alla eventfärger. Inga visuella skillnader mellan vyer.
