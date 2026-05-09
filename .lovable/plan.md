## Ändringar

**1. Tunnare röd ram runt låsta event**
- Fil: `src/components/Calendar/TimeGridEventLayer.tsx`
- Ändra `boxShadow: '0 0 0 3px ...'` → `'0 0 0 1.5px hsl(var(--destructive))'`

**2. Dubbelklick på event → projektsidan**
- Undersök var `onEventClick` / `onDoubleClick` hanteras (troligen `CustomEvent.tsx` eller event-handler i `TimeGridEventLayer`)
- Lägg till `onDoubleClick` på `EventWrapper` som navigerar till projektets sida (`/projects/:id` eller large project hub) istället för att öppna event-dialog
- Bevara enkelklick-beteende

**3. Datumväljare: klicka in/ur på samma ställe utan att annan dialog öppnas**
- Hitta date picker-popovern som används vid event-redigering (troligen `src/components/ui/calendar.tsx` via `Popover`)
- Problem: när popovern stängs vid klick-utanför och man klickar tillbaka på samma datum-fält, triggas en annan dialog (sannolikt parent-event-handler bubblar)
- Lösning: stoppa event propagation på datum-input/triggern, eller fixa popover-fokushantering så den toggle:ar rent

## Behöver kollas innan implementation
- Vilken komponent renderar event-dialogen som öppnas på enkelklick i kalendern (för att hooka in dubbelklick rätt)
- Vilken dialog är "den andra" som öppnas i punkt 3 — behöver titta på session replay eller komponenten där datumväljaren bor

## Frågor
Vill du att dubbelklick öppnar:
- **a)** Stora projektets hub (`/project/large/:id`) om det är ett large project, annars vanliga projektsidan
- **b)** Alltid samma route oavsett typ
