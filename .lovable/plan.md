

## Visa bokning internt

Ändra "Visa bokning"-knappen i bokningskortet (BookingInfoExpanded) så att den expanderar bokningens detaljer direkt på sidan istället för att navigera bort till en separat bokningssida.

### Vad ändras

- **Knappen "Visa bokning"** kommer att toggla den expanderbara sektionen (samma som "Mer info") istället för att öppna en ny sida
- Ikonen ändras från `ExternalLink` till `ChevronDown/ChevronUp` eller `Eye`-ikon för att signalera att innehållet visas på plats
- Knappen och "Mer info"-knappen slås ihop till en enda toggle-knapp, eller så styr "Visa bokning" expansionen direkt

### Tekniska detaljer

**Fil:** `src/components/project/BookingInfoExpanded.tsx`

- Ta bort `<Link to={/booking/${booking.id}}>` runt "Visa bokning"-knappen
- Ändra onClick till att toggla `isExpanded` (samma som CollapsibleTrigger)
- Byt ikon från `ExternalLink` till `Eye`/`EyeOff` eller liknande
- Behåll "Mer info"-knappen som alternativ trigger, eller slå ihop dem till en knapp

