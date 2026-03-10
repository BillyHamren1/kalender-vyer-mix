

## Problem

Kalenderns veckovy (weekly/monthly) har `scroll-snap-type: x mandatory` och `scroll-behavior: smooth` i CSS. Detta gör att scrollningen "snäpps" tillbaka till närmaste kort-gräns — vilket upplevs som att den fastnar. `scroll-snap` med mandatory kräver att varje scroll-gest når halvvägs till nästa snap-punkt, annars snäpps den tillbaka.

## Fix

### `src/components/Calendar/Carousel3DStyles.css`

- Ta bort `scroll-snap-type: x mandatory` och `scroll-behavior: smooth` från `.weekly-horizontal-grid`
- Behåll `overscroll-behavior-x: contain` och `touch-action: pan-x pan-y` (dessa skyddar mot browser-back)

### `src/components/Calendar/Carousel3DStyles.css` — `.weekly-day-card`

- Sök efter och ta bort eventuell `scroll-snap-align` på `.weekly-day-card` (om den finns)

### Resultat

Fri horisontell scroll utan snap-effekt. `overscroll-behavior-x: contain` förhindrar fortfarande browser-back-gesten.

