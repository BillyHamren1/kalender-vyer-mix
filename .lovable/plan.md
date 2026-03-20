

## Genomgång: Projektledningshanteringen

### Status: Vad fungerar

Projektledningen har en solid 3-nivåstruktur (litet/medel/stort) med konvertering mellan nivåerna, en unified projektlista med sök/filter, och ett arkiv för avslutade projekt. Flödet från inkommande bokning → projekt → etablering → ekonomi → avslut fungerar. Etablerings-Gantt, uppgiftshantering, filuppladdning, kommentarer, historiklogg och transportbokning är implementerade och kopplade.

### Problem och förbättringar

**1. Oanvända/döda filer (bör raderas)**

| Fil | Anledning |
|-----|-----------|
| `src/pages/ProjectDetail.tsx` | Gammal tab-baserad detaljvy, ersatt av `ProjectLayout` + sub-pages. Inte importerad i App.tsx. |
| `src/pages/LargeProjectDetail.tsx` | Gammal tab-baserad vy för stora projekt, ersatt av `LargeProjectLayout` + sub-pages. Inte importerad i App.tsx. |
| `src/components/project/ProjectCard.tsx` | Inte importerad någonstans. |
| `src/components/project/CreateProjectDialog.tsx` | Ersatt av `CreateProjectWizard.tsx`. Inte importerad. |
| `src/components/project/JobCard.tsx` | Inte importerad någonstans. |
| `src/components/project/ProjectTransportSection.tsx` | Inte importerad, ersatt av `ProjectTransportWidget`. |
| `src/pages/APITester.tsx` | Inte routad i App.tsx. |

**2. Kommentarer saknas i nya ProjectViewPage**
Den nya medelprojekt-vyn (`ProjectViewPage.tsx`) visar filer, uppgifter, historik men **saknar kommentarssektionen** helt. `ProjectComments`-komponenten finns och fungerar, men renderas aldrig för medelprojekt. Den gamla `ProjectDetail.tsx` hade den som tab.

**3. JobDetail.tsx (litet projekt) saknar modern design**
`JobDetail.tsx` använder fortfarande det gamla tab-mindre designmönstret med `MainSystemLayout` som wrapper inuti komponenten (inte via routing), medan medel- och stora projekt använder det nya layout-systemet med nav-bar och sub-pages. Inkonsekvens i UX.

**4. Projektekonomi-detalj (`ProjectEconomyDetail.tsx`) — dubbel vy**
`/economy/:id` renderar en separat vy med "Stäng projekt"-knapp, medan `/project/:projectId/economy` redan visar ekonomitabben med samma `ProjectEconomyTab`. Stäng-projekt-funktionen finns bara i `/economy/:id`-vyn, inte i projektets egen ekonomi-tab.

### Åtgärdsplan

1. **Radera 7 oanvända filer** — `ProjectDetail.tsx`, `LargeProjectDetail.tsx`, `ProjectCard.tsx`, `CreateProjectDialog.tsx`, `JobCard.tsx`, `ProjectTransportSection.tsx`, `APITester.tsx`

2. **Lägg till kommentarssektion i ProjectViewPage** — Rendera `ProjectComments` i den befintliga 3-kolumnslayouten (byt ut historik-kolumnen mot en 2-raders layout med kommentarer + historik, eller lägg till en fjärde sektion)

3. **Flytta "Stäng projekt"-funktionen** till `ProjectEconomyPage.tsx` (ekonomi-tabben inom projektlayouten) så att man inte behöver gå via `/economy/:id` för att stänga ett projekt

### Tekniska detaljer

- Filer raderas rakt av — ingen annan fil importerar dem
- `ProjectViewPage.tsx`: Lägg till import av `ProjectComments` och rendera den med en `SectionHeader` i layouten
- `ProjectEconomyPage.tsx`: Lägg till "Stäng projekt"-knapp med samma checklista-dialog som `ProjectEconomyDetail.tsx`
- Ingen databasändring behövs

