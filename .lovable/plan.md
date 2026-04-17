
## Kort svar
**Nej — det är inte samma "Lager".** Idag finns det **två separata Lager-projekt** per organisation:

| | Tidappen "Lager" | Lagerkalenderns "Lager" |
|---|---|---|
| Tabell | `projects` (`is_internal = true`) | `warehouse_projects` (`is_internal = true`) |
| Kopplat till | `location_id` (fast plats i `organization_locations`) | Ingen plats |
| Skapas av | Trigger på `organization_locations` med `show_as_project = true` | Trigger på `organizations` (planen vi nyss byggde) |
| Tidregistrering | Ja — mobilapp loggar mot detta via `location_id` | Nej — `warehouse_project_tasks` har ingen tidskoppling |

Verifierat i DB: organisation `f5e5cade…` har **båda** parallellt:
- `projects.id = aabe7606…` (Lager, location-länkad)
- `warehouse_projects.id = e87b6763…` (Lager, intern lagerprojektet vi skapade)

Detta strider mot din ursprungliga intention: *"Den tiden skall registreras i detta projekt."* — men idag går tidregistreringen till ett annat "Lager".

## Förslag — välj enhetlig modell

Två rimliga vägar (välj en):

### Alternativ A — Konsolidera till ETT Lager (rekommenderat)
- Ta bort `warehouse_projects.is_internal` Lager-projektet.
- Flytta lageruppgifterna (`warehouse_project_tasks` på Lager) till `tasks`-tabellen kopplad till det interna `projects`-Lager.
- Lagerkalendern visar tasks från `projects` (Lager) istället.
- Tid loggas redan på rätt projekt → uppgift kan väljas valfritt.

### Alternativ B — Brygga de två
- Behåll båda tabeller men säkerställ att `warehouse_projects` Lager **alltid speglar** motsvarande `projects` Lager (samma org).
- När man loggar tid på en lageruppgift går den till `projects` Lager via `location_id`.
- Lager-uppgifter visas i tidappen som valbara underuppgifter på Lager-projektet.

### Alternativ C — Behåll separation
- Acceptera två "Lager" — ett för operativa lageruppgifter (warehouse), ett för platsbaserad tidregistrering. Tydligare namn: "Lager (uppgifter)" vs "Lager (plats)".

## Rekommendation
**Alternativ A** — det matchar din ursprungliga formulering bäst ("Den tiden skall registreras i detta projekt"). Det innebär att vi tar bort dubbletten i `warehouse_projects` och centrerar allt internt arbete på det ena `projects`-Lager som tidappen redan känner till.

Säg till vilket alternativ du vill att jag bygger, så lägger jag plan för migration + UI-anpassning.
