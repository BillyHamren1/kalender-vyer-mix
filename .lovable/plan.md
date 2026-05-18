## Problem

I veckovyn scrollar `.weekly-horizontal-grid` horisontellt, men varje `.weekly-day-card` innehåller egna scroll-containrar (`.time-grid-with-staff-header`, `.time-grid-scrollable-content`, samt grid-elementet i `TimeGrid.tsx`) som alla har `overflow-x: hidden` + `overflow-y: auto`. När man drar/swajpar/scrollar horisontellt över ett dagkort fångar dessa inre containrar gesten (browser-default: en overflow:hidden-axel är fortfarande en scroll container som äter sin axels delta) och veckoscrollen blockeras.

## Lösning

Gör dagkortens inre vertikala scroll-containrar genomskinliga för horisontella gester, så att hjul/touch/trackpad-deltat bubblar upp till `.weekly-horizontal-grid`.

### 1. `src/components/Calendar/TimeGrid.css`
- `.time-grid-with-staff-header`: behåll `overflow: hidden` men lägg till `touch-action: pan-y` så horisontella swipes inte sväljs.
- `.time-grid-scrollable-content`: behåll `overflow-y: auto` men byt `overflow-x: hidden` → `overflow-x: clip` (eller behåll hidden) **och** lägg till `touch-action: pan-y` + `overscroll-behavior-x: auto`. Detta gör att horisontella wheel/swipe-deltan passerar vidare till veckoraden.
- `.day-card`: redan `overflow-x: hidden` (rad 70). Lägg till `touch-action: pan-y` så hela dagkortet släpper x-gester uppåt. (Behåll `.weekly-day-card .day-card { overflow-x: visible }` som det är.)

### 2. `src/components/Calendar/TimeGrid.tsx` (rad 281)
- Det inre grid-elementet sätter `overflowY: 'auto', overflowX: 'hidden'`. Lägg till `touchAction: 'pan-y'` i samma style så att även denna inre scroller släpper x-axel till föräldern.

### 3. `src/components/Calendar/Carousel3DStyles.css`
- `.weekly-horizontal-grid`: ändra `touch-action: pan-x pan-y` → `touch-action: pan-x` (vi behöver inte pan-y på själva veckoraden — vertikal scroll hör hemma inne i dagkorten). Det säkrar att horisontella gester alltid greppar veckoraden, inte tappas till barnen.
- Lägg till `scroll-snap-type: x proximity` + `.weekly-day-card { scroll-snap-align: start }` (valfritt, men gör veckoscroll trevligare). Hoppar över om du inte vill ha snap.

## Verifiering

- `bunx vitest run` (defaultVisibleTeams + ev. relaterade tester).
- Browser-screenshot: scrolla horisontellt med trackpad/musmaskin över ett dagkort i veckovyn → veckoraden ska röra sig, inget "ryck" inne i dagen. Vertikal scroll inne i dagkortet ska fortfarande fungera.

## Filer som ändras

- `src/components/Calendar/TimeGrid.css`
- `src/components/Calendar/TimeGrid.tsx`
- `src/components/Calendar/Carousel3DStyles.css`
