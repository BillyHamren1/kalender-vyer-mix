
## Mål

Ta bort auto-placeringen av nya projekt i personalkalendern. Istället ska varje nytt projekt (medel + stort) hamna i en **"Att planera"-container ovanför kalendern**, identiskt med "Nya bokningar"-listan. Användaren öppnar projektet, sätter tider och team per dag, och först då materialiseras eventen i kalendern. När ett projekt väl ligger i kalendern ska man via en knapp på en dag kunna **"Flytta denna dag"** eller **"Flytta alla dagar"** till ett annat team.

---

## Flöde (efter ändringen)

```text
[Bokning] --skapa projekt--> [Projekt: status=needs_planning]
                                        │
                                        ▼
              ┌───────────────────────────────────────┐
              │  Att planera-container (ovanför kalendern) │
              └───────────────────────────────────────┘
                                        │ (klick)
                                        ▼
              ┌───────────────────────────────────────┐
              │  Projekt-planeringsvy (per-dag rad)   │
              │  • Riggdag 1 — datum, tid, team ▼     │
              │  • Riggdag 2 — datum, tid, team ▼     │
              │  • Eventdag  — datum, tid             │
              │  • Rivdag 1  — datum, tid, team ▼     │
              │  [Spara & lägg i kalendern]           │
              └───────────────────────────────────────┘
                                        │
                                        ▼
              ┌───────────────────────────────────────┐
              │  Personalkalender                     │
              │  ↳ "Flytta dag"-knapp på event:       │
              │       • Flytta denna dag              │
              │       • Flytta alla dagar             │
              └───────────────────────────────────────┘
```

---

## Vad som ändras

### 1. Datamodell (migration)
- Ny kolumn `projects.planning_status` enum: `needs_planning` (default vid skapande) | `planned`.
- Ny kolumn `large_projects.planning_status` med samma värden.
- Migration sätter alla **befintliga** projekt till `planned` (inget rörs bakåt — per ditt val).
- Ingen ny tabell behövs. Status används bara som filter.

### 2. Project conversion / wizard
- `CreateProjectWizard` och large-project-skapande slutar implicit förlita sig på reconcilern.
- Vid "Skapa projekt" markeras projektet som `needs_planning` och **inga `calendar_events` skapas**.
- Bokningen markeras `assigned_to_project=true` (oförändrat) så den försvinner ur "Nya bokningar".

### 3. Backend (`import-bookings` reconciler)
- `reconcileCalendarEvents` får ett tidigt skip:
  ```text
  if project linked to booking has planning_status='needs_planning' → return
  ```
- Reconcilern fortsätter precis som idag för `planned`-projekt (uppdatera tider, ta bort stale, BSA-expansion).
- Inga befintliga events röjs ut: gamla projekt är redan `planned`.

### 4. Ny "Att planera"-container på kalendersidan
- Nytt komponent `UnplannedProjectsBanner.tsx` placeras i `CustomCalendarPage.tsx` direkt ovanför kalendergrid:t (samma utseende/teknik som `IncomingBookingsList`).
- Hämtar projekt + large_projects där `planning_status='needs_planning'`.
- Varje rad visar: Kund · Bokningsnummer · Eventdatum · Adress · "Planera"-knapp.
- Klick öppnar projektets planeringsvy (ny route, se nedan).
- Realtime-prenumeration på `projects` + `large_projects` så containern uppdateras direkt.

### 5. Projekt-planeringsvy (där användaren sätter tider + team)
- Ny route: `/project/:id/plan` och `/large-project/:id/plan`.
- Ny komponent `ProjectPlanningSheet.tsx` (öppnas som dialog/sheet eller egen sida — vi väljer sheet för snabbhet).
- Innehåll:
  - En rad per planerad dag, härledda från bokningens rig/event/rigdown-datum (samma logik som reconcilern).
  - För varje dag: datum (read-only) · starttid · sluttid · team-dropdown (team-1…team-5, transport).
  - **Default**: alla rig/rigdown-dagar pre-väljer **samma team** (t.ex. första lediga teamet via `findAvailableTeam` på första riggdagen). Detta uppfyller kravet "ett jobb som löper över flera dagar visas i samma team".
  - Toggle "Använd samma team för alla dagar" — när på är dropdownen master och alla dagar följer.
  - "Spara & lägg i kalendern"-knapp:
    - Sätter `planning_status='planned'`.
    - Skriver `calendar_events` direkt via `eventService.addCalendarEvent` (en rad per dag/typ med valt `resource_id` + tider).
    - Uppdaterar `bookings.rig_start_time`, `rig_end_time`, `rigdown_*_time` via `timeSync` så allt hänger ihop.
  - "Avbryt" → projektet stannar i `needs_planning`.

### 6. Bryta loss en dag — "Flytta dag"-knapp på event i kalendern
- I `BookingEvent.tsx` (eller `CustomEvent.tsx`) lägga till en liten knapp/ikon "⇄ Flytta team".
- Klick öppnar en popover med:
  - Lista av andra team.
  - Två val: **"Flytta denna dag"** | **"Flytta alla dagar i projektet"**.
- "Denna dag" → uppdaterar bara den klickade `calendar_events.resource_id` (+ recompute_booking_staff_for_day RPC, som redan finns).
- "Alla dagar" → hämtar alla `calendar_events` för samma `booking_id` (eller alla syskonbokningar i large_project) och flyttar varje till valt team via samma RPC, dag för dag.
- Personal följer **inte** med (per `calendar-team-model-v1`: BSA är spegling — bokningen flyttas, personalen stannar i sitt team). Det matchar dagens beteende.

### 7. Befintliga projekt
- Inga events flyttas. Migration sätter alla nuvarande projekt till `planned`. Endast nya projekt skapade efter denna release går igenom det nya flödet.

---

## Tekniska detaljer (för utvecklaren)

**Filer som ändras:**
- `supabase/migrations/<ny>.sql` — kolumner + default + bakåtfyll.
- `supabase/functions/import-bookings/index.ts` — early-return i `reconcileCalendarEvents` när linked project är `needs_planning`.
- `src/services/projectConversionService.ts` (+ ev. `projectService.ts`) — sätt `planning_status='needs_planning'` vid skapande.
- `src/components/project/CreateProjectWizard.tsx` — inget UI-tillägg, bara säkerställa default.
- `src/pages/CustomCalendarPage.tsx` — montera `UnplannedProjectsBanner` ovanför grid:t.
- **Nya filer**:
  - `src/components/Calendar/UnplannedProjectsBanner.tsx` (~150 rader)
  - `src/components/project/ProjectPlanningSheet.tsx` (~200 rader)
  - `src/hooks/useUnplannedProjects.ts` (~80 rader, query + realtime)
  - `src/components/Calendar/MoveDayPopover.tsx` (~120 rader)
- `src/components/Calendar/BookingEvent.tsx` — lägga till "⇄"-knapp som triggar `MoveDayPopover`.
- `src/App.tsx` (eller motsvarande router) — registrera `/project/:id/plan` och `/large-project/:id/plan` (eller mounta sheet utan route).

**Inga ändringar i:**
- `staff_assignments` / BSA-logiken (befintlig `recompute_booking_staff_for_day` RPC räcker).
- Mobil-/scanner-lager.
- Stora projektets Gantt — den fortsätter fungera när projektet väl är `planned`.

**Memory att uppdatera efter implementation:**
- Ny memory `mem://features/planning/unplanned-projects-staging-v1.md` som beskriver flödet.
- Lägg som referens i `mem://index.md`.

---

## Vad du som användare märker

1. Skapar du ett projekt → bokningen försvinner ur "Nya bokningar", projektet dyker upp i en gul/blå banner ovanför kalendern märkt "Att planera (N)".
2. Klickar du på projektet → en sheet öppnas med en rad per dag. Default är samma team för hela jobbet.
3. Trycker du Spara → eventen materialiseras i kalendern, projektet försvinner ur containern.
4. Vill du flytta en enskild riggdag → klicka på event:et, välj "⇄ Flytta team" → "Flytta denna dag".
5. Vill du flytta hela jobbet → samma popover → "Flytta alla dagar".
