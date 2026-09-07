# Planning-lila i projektvyn

## Ändring
- Byt projektvyns översta sidhuvud från neutral yta till samma semantiska Planning-lila som resten av Planning (`theme-purple` / `primary`).
- Säkerställ att projektvyns primära knappar och aktiva flikar använder samma Planning-lila, med korrekt kontrast i det lila sidhuvudet.
- Ta bort kvarvarande lokala lila nyanser i projekthuvuden där de avviker från Planning-token.

## Verifiering
- Uppdatera färgkontraktstestet för projektvyn.
- Kör berörda tester och typkontroll.
- Kontrollera resultatet visuellt i preview på desktop och kontrollera byggloggen.

## Tekniskt
- Endast semantiska färgklasser används; den kanoniska färgen fortsätter att komma från `theme-purple` (`#7357C8`).
- Ingen affärslogik eller projektfunktion ändras.
