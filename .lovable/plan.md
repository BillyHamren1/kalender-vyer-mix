

# Plan: Personalkalender månadsvy — veckor längst ned (som lagerkalendern)

## Nuläge

Desktop: Personalkalendern har redan `WeekTabsNavigation` längst ned i månadsvyn — samma komponent som lagerkalendern använder. Denna fungerar redan.

Mobil: Personalkalendern använder `MobileCalendarView` som har en helt egen `MobileWeekSelector` med veckoknappar **högst upp** och eget internt state (disconnected från sidans state). Detta skiljer sig från lagerkalendern.

## Vad ska ändras

### 1. Mobilvy — byt till samma mönster som lagerkalendern
I `MobileCalendarView` (och motsvarande `MobileWeekSelector`):
- Flytta veckovalsknappar till **botten** av vyn istället för toppen
- Matcha designen med `MobileWarehouseWeekSelector` (rundad, tydlig aktiv-state)
- Alternativt: låt mobilvyn i månadsvyn använda samma `MobileWarehouseWeekSelector`-komponent (den är generisk nog)

### 2. Koppla mobilens state till sidans state
Istället för att `MobileCalendarView` har eget `useState` för `currentMonth` och `selectedWeekStart`, ska den ta emot dessa som props från `CustomCalendarPage` — precis som desktop-vyn gör med `monthlyDate` och `currentWeekStart`.

**Ändring i `CustomCalendarPage.tsx`** (rad 278-279):
```tsx
// Från:
<MobileCalendarView events={events} />

// Till:
<>
  <MobileEventsList events={events} weekStart={currentWeekStart} />
  <WeekTabsNavigation
    currentMonth={monthlyDate}
    currentWeekStart={currentWeekStart}
    onWeekSelect={handleWeekSelect}
  />
</>
```

**Ändring i `MobileCalendarView.tsx`**:
- Lägg till props för `currentMonth`, `selectedWeekStart`, `onMonthChange`, `onWeekSelect`
- Ta bort internt state
- Flytta veckoväljaren till botten

### Filer som ändras
- `src/pages/CustomCalendarPage.tsx` — koppla mobil månadsvy till sidans state + använd `WeekTabsNavigation` i botten
- `src/components/mobile/MobileCalendarView.tsx` — refaktorera för att ta props istället för eget state, placera veckor i botten

