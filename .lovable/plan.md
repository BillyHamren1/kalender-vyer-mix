

# Ta bort Beta-toggle från CalendarHeader

Beta-togglen i `CalendarHeader.tsx` är onödig — den vyn (`/calendar`) använder redan custom-kod utan FullCalendar.

## Åtgärd

**En fil**: `src/components/dashboard/CalendarHeader.tsx`

- Ta bort `FlaskConical`-import
- Ta bort `Switch`-import
- Ta bort `useState` för `useCustomCalendar`
- Ta bort hela Beta-toggle JSX-blocket (icon + label + switch mellan navigeringen och filter-dropdown)

Inga andra filer påverkas.

