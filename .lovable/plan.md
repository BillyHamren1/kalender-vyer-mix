

## Fix: Ta bort den stora tomma raden mellan personal-pills och tidslinjerna

### Problem
Row 4 i kalenderhuvudet ("Staff Assignment Areas per team") har `min-height: 88px` i CSS-klassen `.staff-assignment-header-row`, vilket skapar en stor tom yta när inga personal är tilldelade till teamen.

### Lösning
Ändra `min-height` från `88px` till ett lägre värde (t.ex. `24px` eller `auto`) i `src/components/Calendar/TimeGrid.css` så att raden kollapsar när den är tom men fortfarande kan expandera när personal tilldelas.

### Fil som ändras
- `src/components/Calendar/TimeGrid.css` — ändra `.staff-assignment-header-row { min-height: 88px }` till `min-height: 24px`

