## Problem

Routen `/staff-management/time-reports` används idag som **två olika saker**:

1. Huvudvyn under Personal (vecko-Gantt med all personal).
2. En "drilldown" till en enskild persons dag — t.ex. från:
   - `ProjectAutoTimeSection` (projektets ekonomi/tidsrapportering → "Öppna dag")
   - Externa länkar / bokmärken med `?staff=…&date=…`
   - Klick i Gantt-listan internt

Sidan växlar internt mellan översikt och detaljvy via `selectedStaffId`, men den vet inte *varifrån* användaren kom. "Tillbaka"-knappen i detaljvyn gör alltid `setSelectedStaffId(null)` → man landar i vecko-Ganttsidan oavsett om man kom från ett projekt, från ekonomi eller någon annan vy. Det är det som upplevs som "felaktigt inkopplat lite överallt".

Användarens svar:
- **Tidrapportsidan ska bara nås från Personal.**
- **Tillbaka ska gå tillbaka till ursprungssidan.**

## Plan

### 1. Tidrapportsidan är endast egen sida från Personal

`/staff-management/time-reports` ska enbart vara översiktsvyn (Gantt + vecka). Den ska inte längre fungera som drilldown till en specifik person/dag via querystring.

**Ändringar:**
- `src/pages/StaffTimeReports.tsx`
  - Ta bort deep-link-läsningen av `?staff` och `?date` i komponenten.
  - Ta bort det interna detaljvyläget (`selectedStaffId` → `<StaffTimeReportDetail/>`). När man klickar på en person i Ganttsen `onSelectStaff` → navigera till en *egen* dagsroute istället (se punkt 2).
  - Sidan visar alltid bara Gantt-vyn.

### 2. Ny dedikerad dagsdetalj-route med smart Tillbaka

Lägg in en separat route för en persons dag, så att den kan ha sin egen URL, sitt eget tillbaka-beteende och inte tränger sig in över tidrapportsidan.

- Ny route i `src/App.tsx`:
  ```
  /staff-management/time-reports/:staffId            → StaffTimeReportDay (defaultdatum = idag)
  /staff-management/time-reports/:staffId/:date      → StaffTimeReportDay (date = YYYY-MM-DD)
  ```
- Ny sida `src/pages/StaffTimeReportDay.tsx`:
  - Läser `staffId` och valfri `:date` från params.
  - Hämtar staffens namn (samma `staff_members.select('name')` som idag).
  - Renderar `<StaffTimeReportDetail staffId=… staffName=… initialDate=… />` (komponenten är redan separerad).
  - Header: `PageHeader` med personens namn + "Tidrapporter per vecka", precis som idag.
  - **Tillbaka-knapp** med smart fallback:
    - `navigate(-1)` om `location.state?.from` finns *eller* `window.history.length > 1` och föregående entry är intern.
    - Annars fallback till `/staff-management/time-reports`.
    - Implementeras som en liten hook `useSmartBack(fallbackPath)`.

### 3. Uppdatera alla call-sites att navigera till nya routen och skicka `from`

- `src/pages/StaffTimeReports.tsx` (Gantt-klick i översikten):
  ```ts
  onSelectStaff={(id, _name) =>
    navigate(`/staff-management/time-reports/${id}/${dateStr}`, {
      state: { from: location.pathname + location.search },
    })
  }
  ```
- `src/components/project/ProjectAutoTimeSection.tsx` (`openDay`):
  - Sluta länka till `/staff-management/time-reports?staff=…&date=…`.
  - Byt till `/staff-management/time-reports/${staffId}/${isoDate ?? ''}` med `state: { from: location.pathname + location.search }`.
- Sök/uppdatera ev. andra ställen som länkar till `/staff-management/time-reports?staff=` (i denna sökning fanns bara `ProjectAutoTimeSection`, men jag dubbelkollar i implementationssteget).

### 4. Behåll en mjuk redirect för gamla deep-links

För att inte krascha gamla bokmärken eller länkar (`?staff=…&date=…`):
- I `StaffTimeReports.tsx`: om query innehåller `staff`, gör en `<Navigate replace>` till `/staff-management/time-reports/:staff/:date` på mount, och *behåll inte* deep-link-logiken i själva översikten.

### 5. Sidomenyn

`Sidebar3D` länkar redan bara till översikten, ingen ändring behövs.

### 6. Tester

Lägg till lightweight test som verifierar:
- `useSmartBack` fallback till given path när history är tom / extern referrer.
- Att den nya routen renderar `StaffTimeReportDetail` med rätt staffId/initialDate (snapshot/render-test med MemoryRouter).
- Att `?staff=…` på översikten gör redirect till `/staff-management/time-reports/:staff/:date`.

Kör `bun vitest run` för relevanta filer efter ändringarna.

## Tekniska detaljer

- `useSmartBack(fallback: string)`:
  - returnerar `() => { if (location.state?.from) navigate(location.state.from); else if (window.history.length > 1 && document.referrer && new URL(document.referrer).origin === window.location.origin) navigate(-1); else navigate(fallback); }`
  - Placering: `src/hooks/useSmartBack.ts`.

- Datumformat i URL: `YYYY-MM-DD` (Europe/Stockholm), samma format som dagens deep-link.

- Inga ändringar i `StaffTimeReportDetail` själv. Den är redan en ren komponent som tar `staffId/staffName/initialDate`.

- Inga datamodell- eller backend-ändringar.

## Utanför scope

- Layouten/innehållet i själva dagsdetaljen (`StaffTimeReportDetail`) rörs inte — bara hur man tar sig dit och tillbaka.
- Mobilappens spegling (`/m/report`) påverkas inte.
- Ingen ändring av Personal-översiktens länk eller behörigheter.
