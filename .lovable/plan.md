## Problem

Packningskalendern (`/warehouse/packing`) använder fel färger för UT/IN-rader. Idag används Tailwind `bg-green-300` (mättat grön) och `bg-red-300` (röd). Personalkalendern använder mjukare pastellfärger för rig/rigDown — och rigDown är **persika/orange**, inte röd.

## Källa (personalkalendern, `src/styles/calendar.css`)

- `event-rig` (UT/rigday): bakgrund `#F2FCE2`, kant `#D4EAB5`, text svart
- `event-rigDown` (IN/retur): bakgrund `#FEC6A1`, kant `#FEB190`, text svart

## Ändring

I `src/components/packing/PackingCalendarView.tsx`:

1. Ersätt `KIND_COLORS` så att klassuppsättningen inte längre använder `bg-green-300`/`bg-red-300`. Istället sätter vi färgerna via inline-style (matchar personalkalenderns palett exakt) och behåller en hover-klass.

   ```ts
   const KIND_STYLES: Record<EventKind, { bg: string; border: string; hoverBg: string }> = {
     out: { bg: "#F2FCE2", border: "#D4EAB5", hoverBg: "#E4F6CE" }, // rig — ljusgrön
     in:  { bg: "#FEC6A1", border: "#FEB190", hoverBg: "#FDB389" }, // rigDown — persika
   };
   ```

2. Applicera färgerna på event-chipsen (både månad- och vecka-vyn) via `style={{ backgroundColor, borderColor, color: '#000' }}` plus en tunn `border`-klass. Hover hanteras via en liten CSS-klass i samma fil eller via `onMouseEnter/Leave`-toggle.

3. Uppdatera `KIND_DOT_COLORS` (legendprickarna) till samma två färger så att legend matchar.

4. Inga ändringar av logik (UT/IN-uppdelning, span, navigering) — bara färger.

## Resultat

Packningskalenderns UT-rader blir samma mjuka ljusgrön som personalkalenderns rig-event, och IN-rader blir samma persika som personalkalenderns rigDown-event. Visuell konsistens mellan de två kalendrarna.
