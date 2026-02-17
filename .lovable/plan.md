

## Strukturell och visuell upprensning av EventFlow

### Sammanfattning
Appen har ackumulerat oanvanda komponenter, duplicerade navigationslosningar och inkonsekvenser i sidofaltets struktur. Planen fokuserar pa att rensa bort dod kod, forbattra sidofaltets organisation och harmonisera det visuella uttrycket - utan att andra nagon befintlig funktionalitet.

---

### 1. Ta bort oanvanda navigationskomponenter

Foljande filer importeras aldrig nagonstans och ar rester fran tidigare versioner:

- `src/components/Navigation.tsx` (gammal toppnavigering)
- `src/components/Navigation/Navbar.tsx` (gammal navbar med hardkodade bla farger)
- `src/components/GlobalTopBar.tsx` (aldrig anvand)
- `src/components/WarehouseTopBar.tsx` (aldrig anvand)

**Atgard:** Radera alla fyra filer. Ingen funktionalitet paverkas.

---

### 2. Ta bort oanvanda/overgivna sidor

Dessa sidor importeras i `App.tsx` men har inga rutter kopplade till sig:

- `src/pages/FinishedJobs.tsx` - importeras men ar aldrig i en `<Route>`
- `src/pages/StaffEndpoint.tsx` - importeras men ar aldrig i en `<Route>`
- `src/pages/CalendarPage.tsx` - ersatt av `CustomCalendarPage.tsx`
- `src/pages/LogisticsMap.tsx` - ingen rutt kopplar hit
- `src/pages/Index.tsx` - `/` renderar redan `PlanningDashboard`, Index ar overflodigt

**Atgard:** Radera filerna och ta bort deras oanvanda importer fran `App.tsx`.

---

### 3. Fixa sidofaltet (Sidebar3D)

**Problem som atsardas:**

| Problem | Losning |
|---|---|
| "Personal-\nadministration" har en literal `\n` i titeln, ger konstig radbrytning | Andra till "Personaladmin" eller "Personal" som enradig text |
| Mobil-navigeringen visar alla 7 poster (for trangt) | Begansa mobilvyn till de 4-5 viktigaste (Dashboard, Kalender, Projekt, Personal, Logistik) |
| Breddskillnad: huvudsystem w-56 vs lager w-64 | Harmonisera till samma bredd (w-56) |

---

### 4. Rensa dubbel rutt

- `/` och `/dashboard` pekar bada pa `PlanningDashboard`
- **Atgard:** Behal bada men ta bort importen av `Index`-sidan som aldrig renderas

---

### 5. Sammanfattning av filandringar

| Fil | Andring |
|---|---|
| `src/components/Navigation.tsx` | Radera |
| `src/components/Navigation/Navbar.tsx` | Radera |
| `src/components/GlobalTopBar.tsx` | Radera |
| `src/components/WarehouseTopBar.tsx` | Radera |
| `src/pages/FinishedJobs.tsx` | Radera |
| `src/pages/StaffEndpoint.tsx` | Radera |
| `src/pages/CalendarPage.tsx` | Radera |
| `src/pages/LogisticsMap.tsx` | Radera |
| `src/pages/Index.tsx` | Radera |
| `src/App.tsx` | Ta bort oanvanda importer (Index, FinishedJobs, StaffEndpoint, CalendarPage, LogisticsMap) |
| `src/components/Sidebar3D.tsx` | Fixa sidofaltstiteln, begansa mobil-nav till 5 poster |
| `src/components/WarehouseSidebar3D.tsx` | Andra bredd fran w-64 till w-56 |

### Vad som INTE andras
- Alla befintliga rutter och sidorna de pekar pa
- All affarslogik (formulae, databasanrop, hooks)
- Designsystemets farger och tokens
- Mobilappens separata navigering (`/m/*`)
- Lagersystemets funktionalitet

