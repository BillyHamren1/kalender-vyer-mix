# Plan för att stänga allt som fortfarande står öppet

## Läget just nu
Databasen visar inte öppna `time_reports` just nu.

Det som fortfarande står öppet är i stället:
- 1 öppen `location_time_entries`-rad
- 4 öppna `workdays`

Det är alltså sannolikt dessa som får systemet att se ut som att tidrapporter fortfarande är öppna.

## Jag kommer att göra
1. Stänga alla öppna `workdays` direkt i databasen.
2. Stänga alla öppna `location_time_entries` direkt i databasen.
3. Kontrollera att det efteråt finns:
   - 0 öppna `workdays`
   - 0 öppna `location_time_entries`
   - 0 öppna `time_reports`
4. Gå igenom end-of-day-flödet igen och täppa till glappet så att dagtimer + aktivitetstimer alltid stängs tillsammans.
5. Lägga till testskydd så samma fel inte kommer tillbaka.

## Kodändringar
### 1) Akut datastädning
Jag kör en riktad datarättning som stänger alla kvarvarande öppna sessioner i produktionsdatat:
- `workdays.ended_at` sätts för alla öppna rader
- `location_time_entries.exited_at` sätts för alla öppna rader

Ingen schemaändring behövs för detta.

### 2) Härdning av EOD-logiken
Jag går igenom kedjan:

```text
Avsluta dag
  -> spara time_report
  -> stoppa active timer
  -> stäng location_time_entry
  -> stäng workday
  -> markera UI som avslutad
```

Jag säkrar att ingen del kan bli kvar öppen om nästa steg lyckas eller om UI tappar synk efter servern.

### 3) Synk mellan server och UI
Jag justerar där det behövs så UI inte längre tolkar:
- öppen `workday`
- öppen `location_time_entry`

som om själva `time_report` fortfarande vore öppen.

### 4) Testskydd
Jag uppdaterar kontraktstesterna så de låser följande beteende:
- EOD lämnar inga öppna workdays
- EOD lämnar inga öppna location entries
- time_report + timer + workday blir konsekventa efter avslut
- dubbla submits / retry ger inte halvt öppet läge

## Tekniska detaljer
Nuvarande snapshot:
- `time_reports` med `end_time IS NULL`: 0
- `location_time_entries` med `exited_at IS NULL`: 1
- `workdays` med `ended_at IS NULL`: 4

Det här tyder på att felet inte är “öppna tidrapporter” i tabellen `time_reports`, utan att avslutskedjan lämnar kvar öppna sessionstabeller.

## Resultat efter implementation
När detta är gjort ska systemet ge samma sanning i alla lager:
- ingen kvarhängande dagtimer
- ingen kvarhängande aktivitetstimer
- inga falskt “öppna” rapporter i UI

Godkänn så kör jag datastädningen först och därefter koden/testerna direkt.