

## Plan: Exact rig times i kalender + varning vid tidsändring

### Bakgrund

Synklogiken i `bookingCalendarService.ts` (rad 177-178) använder redan `rig_start_time`, `event_start_time`, `rigdown_start_time` etc. om de finns, med fallback till 08:00-14:00. Så bokningar med exakta tider hamnar redan på rätt tid i kalendern -- förutsatt att tiderna lagras korrekt i databasen.

Det som saknas är **varningen** när en användare försöker ändra tid/datum på en bokning som har bestämda tider (`exact_time_needed = true` eller har specificerade `rig_start_time`/`event_start_time` etc.).

### Vad som ska göras

**1. Propagera `exactTimeNeeded` till MoveEventDateDialog och QuickTimeEditPopover**

`CustomEvent.tsx` öppnar redan `MoveEventDateDialog` via högerklick. Vi behöver skicka med `exact_time_needed`-flaggan (som redan finns i `event.extendedProps.exactTimeNeeded`) till dialogen.

- I `CustomEvent.tsx`: Skicka `exactTimeNeeded` som prop till `MoveEventDateDialog`
- I `QuickTimeEditPopover`: Samma approach (om den fortfarande används)

**2. Visa varning i MoveEventDateDialog**

- Lägg till prop `exactTimeNeeded?: boolean` i `MoveEventDateDialogProps`
- Om `exactTimeNeeded` är true: visa en orange/amber varningsruta högst upp i dialogen:
  > "⚠️ Denna bokning har bestämda tider. Är du säker att du vill ändra?"
- Knappen "Flytta" ska fortfarande fungera (det är en varning, inte en blockering)

**3. Visa varning i EditEventTimeDialog**

- Samma approach: ta emot `exactTimeNeeded` prop och visa varning

**4. Visa varning i QuickTimeEditPopover (om aktiv)**

- Samma varningsruta i popover-innehållet

### Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/components/Calendar/CustomEvent.tsx` | Skicka `exactTimeNeeded` till `MoveEventDateDialog` |
| `src/components/Calendar/MoveEventDateDialog.tsx` | Ny prop + varningsruta |
| `src/components/Calendar/EditEventTimeDialog.tsx` | Ny prop + varningsruta |
| `src/components/Calendar/QuickTimeEditPopover.tsx` | Ny prop + varningsruta |

### Verifiering av korrekt tid i kalender

Synklogiken hanterar redan exakta tider korrekt. Vi behöver inte ändra `bookingCalendarService.ts`. Om bokningar trots allt hamnar på fel tid beror det på att tiderna inte sparas korrekt vid import -- det är ett separat problem i Edge Function `import-bookings`.

