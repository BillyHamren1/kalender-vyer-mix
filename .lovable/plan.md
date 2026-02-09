
# Projekt syns inte pa kartan - Fixplan

## Problem
Projektmarkorer renderas pa kartan men ar for sma (12px) for att synas tydligt mot satellitbakgrunden. Datan finns - 2 bekraftade bokningar med koordinater inom aktuell vecka - men punkterna ar nastan osynliga.

## Losning

### 1. Gora markorerna storre och mer synliga
- Oka markorstorlek fran 12px till 20px
- Lagga till en pulserande animationsring runt varje markor for att dra uppmarksamhet
- Anvanda tydligare fargkontrast och tjockare border

### 2. Lagga till labels pa markorerna
- Visa klientnamnet som en liten etikett bredvid varje markor sa att det ar tydligt vad som visas

### 3. Fixa eventuell filtreringsbugg
- Sakerstaalla att bokningar som INTE har status CONFIRMED ocksa kan visas om de har koordinater (t.ex. OFFER-status)
- Overvaag att ta bort status-filtret och visa alla bokningar med koordinater

## Tekniska detaljer

### Fil: `src/components/logistics/widgets/LogisticsMapWidget.tsx`

**Markorstorleksandring (rad 101-102):**
- Andra `width:12px;height:12px` till `width:22px;height:22px` 
- Lagga till animation/pulseffekt via en extra DOM-ring

**Bredda datahämtning (rad 70):**
- Overvaag att anvanda `fetchBookings()` istallet for `fetchConfirmedBookings()` for att inkludera alla bokningar, eller lagg till ytterligare statusar

**Transportmarkorer (rad 126):**
- Samma storleksforandring fran 12px till 22px

Inga nya filer behovs - enbart andringar i `LogisticsMapWidget.tsx`.
