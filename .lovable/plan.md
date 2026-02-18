
## Ta bort "Dölj/Visa detaljer"-knappen och visa alltid all info

### Problem
Bokningsinformationen är inpackad i ett `Collapsible`-element med en toggle-knapp ("Visa detaljer" / "Dölj detaljer"). Användaren vill att all info ska synas hela tiden utan att behöva klicka.

### Lösning
Refaktorera `BookingInfoExpanded.tsx` för att:
1. Ta bort `useState` för `isExpanded`
2. Ta bort `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`-komponenterna
3. Ta bort toggle-knappen helt
4. Flytta det expanderbara innehållet (adress, kontakt, logistik, interna anteckningar) till att alltid visas

### Fil att ändra
| Fil | Ändring |
|---|---|
| `src/components/project/BookingInfoExpanded.tsx` | Ta bort Collapsible-logik, visa allt direkt |

### Resultat
All bokningsinformation (kund, bokningsnummer, projektledare, schema, adress, kontakt, logistik, anteckningar, utrustning, bilder) visas alltid i sin helhet — ingen knapp behövs.
