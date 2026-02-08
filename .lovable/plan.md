

## Uppgradering av Projektsidan till ett riktigt projektledningssystem

Projektsidan behover en ordentlig uppgradering for att visa alla relevanta bokningsuppgifter, spara projekthistorik och ge en professionell projektledningsupplevelse.

### Vad som saknas idag

1. **Begransad bokningsinformation** -- Bara kund, eventdatum, adress och kontaktperson visas. Riggdatum, nedrivningsdatum, interna anteckningar, logistikdata (barningsavstand, markspett etc.) och produktlista saknas helt.
2. **Ingen projekthistorik/aktivitetslogg** -- Det finns ingen mojlighet att folja vad som hant i projektet, vem som gjort vad och nar.
3. **Projektledare visas inte** -- Trots att `project_leader` sparas i databasen visas den inte pa sidan.
4. **Oversiktsvy saknas** -- Ingen snabb sammanfattning av projektets framdrift (antal klarade uppgifter, senaste aktivitet, tid kvar etc.).
5. **Schema-oversikt saknas** -- Rig/Event/Rigdown-datum syns inte samlat som en tydlig tidslinje.

---

### Plan: 5 forbattringar

#### 1. Ny databas-tabell: `project_activity_log`

Skapar en aktivitetslogg som automatiskt spelar in alla forandringar i projektet.

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| id | uuid | Primar-nyckel |
| project_id | uuid | FK till projects |
| action | text | Typ av handling (t.ex. `task_completed`, `status_changed`, `comment_added`, `file_uploaded`, `staff_assigned`) |
| description | text | Mänskligt lasbar beskrivning |
| performed_by | text | Namn pa personen som utforde handlingen |
| metadata | jsonb | Extra data (t.ex. gammal/ny status, uppgiftsnamn) |
| created_at | timestamptz | Tidsstampel |

#### 2. Utokad bokningsinformation-sektion

Visar ALLA bokningsuppgifter i en expanderbar layout:

- **Rad 1**: Kund, Bokningsnummer, Status, Projektledare
- **Rad 2**: Riggdatum, Eventdatum, Nedrivningsdatum (med visuell tidslinje)
- **Rad 3**: Leveransadress, Stad, Postnummer
- **Rad 4**: Kontaktperson med telefon och e-post (klickbar)
- **Rad 5**: Logistikdata (barningsavstand >10m, markspett tillatet, exakt tid)
- **Interna anteckningar**: Expanderbar sektion med bokningens anteckningar

#### 3. Ny komponent: Projektovversikt (Dashboard-kort)

En sammanfattningssektion overst med:

- **Framdrift**: Cirkeldiagram/progressbar med andel klarade uppgifter
- **Schema**: Visuell tidslinje Rigg -> Event -> Rigdown med nedrakning (t.ex. "3 dagar till rigg")
- **Projektledare**: Namn och avatar
- **Senaste aktivitet**: De 3 senaste handlingarna fran aktivitetsloggen
- **Snabbstatistik**: Antal uppgifter, filer, kommentarer, personalstyrka

#### 4. Ny flik: "Aktivitetslogg" (Historik)

En kronologisk lista over alla forandringar i projektet:

- Ikon + fargkod baserat pa typ (gron for uppgift klar, bla for kommentar, gul for statusandring etc.)
- Filtrerbar pa typ (uppgifter, kommentarer, filer, statusandringar)
- Visar vem som utforde handlingen och nar
- Grupperad per dag med datum-rubriker

#### 5. Automatisk loggning av handlingar

Alla befintliga mutationer (i `useProjectDetail`) utvidgas for att automatiskt skriva till aktivitetsloggen:

- Statusandring (gammal -> ny status)
- Uppgift tillagd/avslutad/borttagen
- Kommentar tillagd
- Fil uppladdad/borttagen
- Tidrapport inlagd
- Inkop registrerat

---

### Teknisk specifikation

**Nya filer:**
| Fil | Beskrivning |
|-----|-------------|
| `src/components/project/ProjectOverviewHeader.tsx` | Dashboard-kort med framdrift, schema, projektledare |
| `src/components/project/ProjectActivityLog.tsx` | Aktivitetslogg-flik med filtrering |
| `src/components/project/ProjectScheduleTimeline.tsx` | Visuell tidslinje Rigg/Event/Rigdown |
| `src/components/project/BookingInfoExpanded.tsx` | Utokad bokningsinformations-sektion |
| `src/services/projectActivityService.ts` | CRUD for aktivitetsloggen |
| Databasmigrering | Skapar `project_activity_log`-tabellen |

**Andrade filer:**
| Fil | Andring |
|-----|---------|
| `src/pages/ProjectDetail.tsx` | Ny layout med oversikt, utokad bokningsinfo, ny Aktivitetslogg-flik |
| `src/hooks/useProjectDetail.tsx` | Loggar alla handlingar till aktivitetsloggen |
| `src/services/projectService.ts` | Hamtar utokad bokningsdata (fler falt) |
| `src/types/project.ts` | Nya typer for `ProjectActivity` och utokad `ProjectWithBooking` |

**Layout-andring pa ProjectDetail:**

Nuvarande ordning: Header -> Bokningsinfo (liten) -> Tabs

Ny ordning: Header (med projektledare) -> Oversikt-dashboard -> Bokningsinfo (expanderbar, komplett) -> Tabs (+ ny Aktivitetslogg-flik)

