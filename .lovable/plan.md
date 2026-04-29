## Problem
Tidsraderna i mobilappens dagskalender (`/m`) tar för mycket vertikal plats — användaren måste scrolla mycket för att se en hel dag.

## Lösning
Minska timhöjden i `src/components/mobile-app/DayTimeline.tsx` från **64 px/timme → 40 px/timme**.

Det ger ca 37 % mindre höjd: en standarddag (06–22 = 16 h) går från 1024 px → 640 px, vilket nästan ryms på en mobilskärm utan scroll.

## Ändringar

**`src/components/mobile-app/DayTimeline.tsx`**
- `PX_PER_HOUR`: `64` → `40`
- Justera minimum block-höjd så korta pass fortfarande är läsbara: `Math.max(..., 28)` → `Math.max(..., 22)`
- Justera trösklarna för när extra rader (adress, projektinfo) visas i blocket så de fortfarande passar:
  - `heightPx > 50` (adress) → `heightPx > 36`
  - `heightPx > 64` (projektrad) → `heightPx > 48`

Inga andra filer påverkas. Tim-etiketterna fortsätter att rendera korrekt eftersom de positioneras med `i * PX_PER_HOUR`.

## Teknisk detalj
Konstanterna ligger överst i filen och används både för totalhöjd, tim-etiketter och blockpositionering — en enda värdesändring slår igenom hela komponenten.
