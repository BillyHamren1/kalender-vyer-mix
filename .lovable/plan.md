
## Problem

Personalplaneringens månadvy (`/calendar` → "Månad") använder komponenten `SimpleMonthlyCalendar` – en traditionell kalendergrid med datumrutor. Lagerkalendern använder istället `CustomCalendar` med `viewMode="monthly"` vilket ger sidovisa dagkort med tidsgrid + `WeekTabsNavigation` (veckoflikar längst ned). Användaren vill att personalplaneringens månadvy ska se ut och fungera exakt som lagerkalendern.

## Rotorsak

I `src/pages/CustomCalendarPage.tsx` (rad 258–274) renderas `SimpleMonthlyCalendar` när `viewMode === 'monthly'`. Lagerkalendern (`src/pages/WarehouseCalendarPage.tsx` rad 484–512) renderar `CustomCalendar` + `WeekTabsNavigation` för samma vy.

## Lösning

Ersätt `SimpleMonthlyCalendar`-blocket i `CustomCalendarPage.tsx` med samma mönster som lagerkalendern:

1. Byt ut `SimpleMonthlyCalendar` mot `CustomCalendar` med `viewMode="monthly"`
2. Lägg till `WeekTabsNavigation` under `CustomCalendar` (veckoflikar)
3. Lägg till `handleWeekSelect` som anropar `setCurrentWeekStart` (funktionen finns redan men är inte kopplad)
4. Ta bort importen av `SimpleMonthlyCalendar` (används inte längre)

## Tekniska ändringar

**Fil: `src/pages/CustomCalendarPage.tsx`**

Ersätt detta block (rad 258–274):
```tsx
) : viewMode === 'monthly' ? (
  // Monthly View - simple calendar overview
  isMobile ? (
    <MobileCalendarView events={events} />
  ) : (
    <SimpleMonthlyCalendar
      events={events}
      currentDate={monthlyDate}
      onDateChange={handleMonthChange}
      onDayClick={(date: Date) => {
        const centeredWeekStart = subDays(date, 3);
        setCurrentWeekStart(centeredWeekStart);
        setViewMode('weekly');
      }}
    />
  )
```

Med detta (identiskt med lagerkalendern, men utan `variant="warehouse"` och utan `isEventReadOnly`/`onEventClick`):
```tsx
) : viewMode === 'monthly' ? (
  // Monthly View - same day-grid style as warehouse calendar
  isMobile ? (
    <MobileCalendarView events={events} />
  ) : (
    <>
      <CustomCalendar
        events={events}
        resources={teamResources}
        isLoading={isLoading}
        isMounted={isMounted}
        currentDate={currentWeekStart}
        onDateSet={handleDatesSet}
        refreshEvents={refreshEvents}
        onStaffDrop={staffOps.handleStaffDrop}
        onOpenStaffSelection={handleOpenStaffSelection}
        viewMode="monthly"
        weeklyStaffOperations={staffOps}
        getVisibleTeamsForDay={getVisibleTeamsForDay}
        onToggleTeamForDay={handleToggleTeamForDay}
        allTeams={teamResources}
      />
      <WeekTabsNavigation
        currentMonth={monthlyDate}
        currentWeekStart={currentWeekStart}
        onWeekSelect={handleWeekSelect}
      />
    </>
  )
```

Importera `WeekTabsNavigation` och ta bort `SimpleMonthlyCalendar` + `subDays` från importerna (om `subDays` inte används på annat ställe).

## Effekt

| Före | Efter |
|---|---|
| Traditionell kalendergrid med datumrutor | Sidovisa dagkort med tidsgrid (identiskt med lagerkalendern) |
| Inga veckoflikar | Veckoflikar (Vecka 5, 6, 7…) längst ned |
| Klick på dag navigerar till veckovyn | Klick på veckofliken byter aktiv vecka |
| Saknar personalinformation i månadsvyn | Visar personal, team och händelser per dag precis som veckovyn |

Ingen ny komponent behöver skapas – enbart konfigurationsändring i `CustomCalendarPage.tsx`.
