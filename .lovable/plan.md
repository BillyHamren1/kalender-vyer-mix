## Mål

1. Återställ läget så People Partner (#2603-14) och de övriga 21 bokningarna ligger där de låg före kl. 09:00 idag.
2. Förhindra att samma olycka kan hända igen från projekt-/personalkalendern.

## Vad databasen visar

- Storprojekt `a5d3f31b` "Almedalenveckan 2026" skapades 09:00:00 idag och drog in 22 bokningar i `large_project_bookings`.
- Källprojekten enligt audit:
  - Storprojekt `5c94ebcc` — **hård-raderat** (finns inte längre i `large_projects`). Inga rader att återställa, bara audit-spår.
  - Mediumprojekt `d75279e7` "NT Management AB – 22 juni 2026" — **soft-deleted** (`deleted_at` satt 09:00:00.185). Kan väckas till liv.
- Bokningarna har `large_project_id = a5d3f31b` på sig. De gamla länkarna i `large_project_bookings` mot `5c94ebcc` är borta.

Eftersom `5c94ebcc` är hårddraderat går det **inte** att exakt återställa den gamla projekt-raden (namn/intern­anteckningar/leveransadress/files). Däremot kan jag återställa själva bokningskopplingen — vilket är det viktiga för People Partner.

## Steg 1 — Återställning (engångsmigration, ingen kodändring)

1. Återväck mediumprojektet `d75279e7` (sätt `deleted_at = NULL`, `planning_status = 'planned'`).
2. Flytta tillbaka rätt booking till mediumprojektet: sätt `bookings.assigned_project_id = d75279e7`, `assigned_to_project = true`, `large_project_id = NULL` för bokningen som ursprungligen tillhörde mediumprojektet (booking_id `72ff457e-06be-4ae4-b400-6219729a2c38`, dvs medium-projektets `booking_id`).
3. Återskapa ett storprojekt för de övriga 21 bokningarna (ersätter det hård-raderade `5c94ebcc`). Skapar en NY `large_projects`-rad med samma namn som källkonsolideringen ("Almedalenveckan 2026" minus mediumbokningen ovan), `planning_status = 'planned'` (så den INTE poppar upp i Nya bokningar), `status = 'planning'`. Återskoppla de 21 övriga via `large_project_bookings`.
4. Ta bort det av misstag skapade `a5d3f31b` (soft-delete) och dess `large_project_bookings`-rader.
5. Skriver audit-rad `rollback_consolidation` med referens till de tre projekt-id:na så vi har spår av vad som gjordes.

Effekt: People Partner ligger tillbaka i ett storprojekt med `planning_status='planned'` → försvinner från "Nya bokningar". Den medium-bokning som hade ett eget projekt får tillbaka sitt eget mediumprojekt.

**Risker / begränsningar (transparent):**
- Det gamla storprojektets **namn, internalnotes, attachments, project_leader, address** går inte att återskapa exakt (raderna är hård-raderade). Vi får återanvända samma fält som källkonsolideringen läste från (`Almedalenveckan 2026`), eller du säger ett annat namn så använder jag det.
- Eventuella ändringar gjorda i `a5d3f31b` efter 09:00 idag (extra anteckningar, dokument, team-tilldelningar) flyttas till det återställda storprojektet så inget arbete tappas.

## Steg 2 — Kodfix mot framtida olyckor

**A. Bekräftelsedialog innan konsolidering.** Ändring i `ConsolidateProjectsDialog.tsx`: lägg till en explicit "Är du säker?"-steg med listan av källprojekt och totalantalet bokningar som ska flyttas, samt en "Skriv ordet KONSOLIDERA"-input innan submit blir aktiv. Inget kan triggas av misstag.

**B. Dölj högerklicksmenyn i projektkalendern.** I `CustomEvent.tsx` (rad 454–490) återanvänds samma ContextMenu för alla event. Lägg till en `disableConsolidate`-prop (eller läs från context) som tystar `ContextMenuItem`-raderna när komponenten renderas inuti `LargeProjectPlannerCalendarView` / `ProjectCalendarView`. Konsolideringsmenyn finns kvar i personalkalendern där den hör hemma.

**C. Test som låser beteendet.**
- `src/components/Calendar/__tests__/consolidateMenuGuard.test.tsx`: säkerställer att menyalternativen "Konsolidera till nytt stort projekt…" / "Lägg till i stort projekt…" INTE finns i DOM:en när `disableConsolidate=true`.
- `src/components/project/__tests__/consolidateConfirm.test.tsx`: säkerställer att submit-knappen är disabled tills bekräftelsetexten skrivits.

## Filer som kommer ändras

- `src/components/project/ConsolidateProjectsDialog.tsx` (bekräftelsesteg)
- `src/components/Calendar/CustomEvent.tsx` (gate på menyn)
- `src/components/Calendar/EventActionPopover.tsx` eller motsvarande props-genomgång om det behövs för att skicka `disableConsolidate` neråt
- Ny: `src/components/Calendar/__tests__/consolidateMenuGuard.test.tsx`
- Ny: `src/components/project/__tests__/consolidateConfirm.test.tsx`
- Ny migrations-fil: rollback av Almedalenveckan-konsolideringen (steg 1)

## Vad jag INTE rör

- `consolidate-projects` edge function (den fungerar som tänkt — problemet är att den var för lätt att råka trigga).
- Personalkalenderns rendering, BSA, `calendar_events`.
- Konsolideringslogik i mobil / packlista.

## Innan jag kör

Bara en sak: när jag återskapar storprojektet i steg 1.3 — vill du ha det med namnet **"Almedalenveckan 2026"** (samma som det konsoliderade), eller vill du att jag använder **något annat namn** (t.ex. exakt det som `5c94ebcc` hette innan)? Jag har inte det gamla namnet kvar i någon backup, så om det fanns ett specifikt original­namn måste du säga det. Annars kör jag "Almedalenveckan 2026" och du kan döpa om i UI:n.
