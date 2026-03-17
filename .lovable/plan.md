

# Plan: Vecko-knappar i botten på personalkalendern (desktop månadsvy)

## Problemet
Förra ändringen bytte ut mobilens månadsvy mot en `MobileEventsList` — det var fel. Du vill ha den vanliga kalendervyn med veckoknapparna i botten, precis som lagerkalendern (bilden visar "Vecka 9–14" längst ned).

Desktop-vyn har redan `WeekTabsNavigation` i botten (rad 311-315) — det fungerar redan korrekt.

## Vad ska ändras

### `src/pages/CustomCalendarPage.tsx`
Mobil månadsvy (rad 280-292): Byt tillbaka från `MobileEventsList` + `MobileWarehouseWeekSelector` till `MobileCalendarView`, men uppdaterad så den tar props från sidan och har veckoväljaren i **botten**.

```tsx
// Rad 280-292: Ändra till
<MobileCalendarView
  events={events}
  currentMonth={monthlyDate}
  selectedWeekStart={currentWeekStart}
  onMonthChange={handleMonthChange}
  onWeekSelect={handleWeekSelect}
/>
```

### `src/components/mobile/MobileCalendarView.tsx`
Refaktorera för att:
1. Ta emot `currentMonth`, `selectedWeekStart`, `onMonthChange`, `onWeekSelect` som props (valfria — fallback till internt state om ej angivna)
2. Flytta `MobileWeekSelector` från toppen till **botten** (under eventlistan)
3. Behålla den befintliga eventlistan — det är den mobila kalendervyn

Resultat: Samma layout som lagerkalendern — innehåll ovanför, veckoknappar i botten.

