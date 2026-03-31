

## Problem

Just nu visar `IncomingPackingList` varje bokning individuellt -- även de som tillhör ett stort projekt. Det betyder att ett stort projekt med 15 bokningar dyker upp som 15 separata rader, och användaren måste klicka "Skapa packning" 15 gånger. Det är opraktiskt.

## Lösning: Gruppera stora projekt i inkorgen

### Ändring i `IncomingPackingList.tsx`

**Queryn utökas** så att bokningar från `large_project_bookings` hämtas med `large_project_id` och projektnamn:

```text
┌─────────────────────────────────────────────────┐
│ 🔶 Projekt utan packning              3 nya     │
├─────────────────────────────────────────────────┤
│ ▌ Festivalen 2026 (stort projekt)               │
│   5 bokningar utan packlista                    │
│                        [Skapa alla packningar]  │
├─────────────────────────────────────────────────┤
│ ▌ Kund AB - 15 april 2026                      │
│   📅 15 apr 2026  📍 Storgatan 1               │
│                        [Skapa packning]         │
├─────────────────────────────────────────────────┤
│ ▌ Företag XY - 20 april 2026                   │
│   📅 20 apr 2026  📍 Industrivägen 5           │
│                        [Skapa packning]         │
└─────────────────────────────────────────────────┘
```

**Logik:**

1. Hämta `large_project_bookings` med `booking_id` OCH `large_project_id`
2. Joina `large_projects` för att hämta projektnamn
3. Gruppera bokningar utan packning per `large_project_id`
4. Visa grupperade stora projekt som EN rad med badge "X bokningar" och knappen "Skapa alla packningar"
5. Enskilda bokningar (från `jobs`/`projects`) visas som idag

**"Skapa alla packningar"-knappen:**
- Loopar igenom alla bokningar i det stora projektet som saknar packlista
- Skapar en `packing_projects`-rad per bokning (varje bokning = en packningslista, som redan är designen)
- Kör `syncBookingToPacking` för varje
- Navigerar till packningsdashboarden (inte en enskild packlista, eftersom det är flera)

### Fil att ändra

**`src/components/packing/IncomingPackingList.tsx`** -- enda filen. Utöka queryn, gruppera data, rendera grupperade rader för stora projekt och individuella rader för övriga.

