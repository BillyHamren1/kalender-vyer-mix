## Problem

Min förra ändring färglade inte bara dagtitel-baren — den nollade också den lila accenten på team-cellerna (`Team 1/2/3/4/Lager`-raden) och hover-tonen på personalraden. Resultat (bild 1): kalendern såg "av-stylad" ut jämfört med personalkalendern (bild 2).

## Vad som ska göras

Endast **översta raden** (`.time-grid-header-bg` — där "Mon 18" + people-badge står) ska byta bakgrund till fas-färgen. **Team-raden** och **personal-raden** ska se ut precis som i personalkalendern (lila gradient/accenter).

## Ändring

Ta bort dessa override-regler från `src/components/project/ProjectCalendarView.css`:

```text
.project-weekly-day-card .team-header-cell        { background: ... }   ← TA BORT
.project-weekly-day-card .team-header-cell:hover  { background: ... }   ← TA BORT
.project-weekly-day-card .staff-assignment-header-row:hover { ... }     ← TA BORT
.project-weekly-day-card .time-column-header { border-right-color: ... } ← TA BORT
```

Behåll bara:
- Bredare day-cards (oförändrat)
- Fas-färg-variabler (`--phase-header-bg`, `--phase-header-fg`) per `.project-phase-rig/event/rigDown`
- `.time-grid-header-bg` får `background: var(--phase-header-bg)` (bara den översta baren)
- `.day-title` och `.time-title` får mörk fas-text (läsbart på pastellbakgrund)

Inga ändringar i komponentfiler, ingen ändring av `getDayCardClassName`-prop.

## Resultat

- Dagtitel-bar: grön på rig-dagar, gul på event-dagar, ljusröd på rigDown-dagar (matchar event-färgerna i personalkalendern)
- Team-rad + personal-rad: identisk med bild 2 (lila accenter bevaras)
