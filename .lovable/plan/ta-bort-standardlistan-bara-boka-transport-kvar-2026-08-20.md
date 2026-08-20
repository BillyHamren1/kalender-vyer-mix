# Ta bort standardlistan – bara "Boka transport" kvar

## Bakgrund (verifierat)

- Mallen ligger i `src/components/project/defaultChecklist.ts` med 12 punkter, men konstanten `DEFAULT_CHECKLIST` importeras inte längre av någon fil – bara typen `DeadlineRule` används av `calculateDeadline.ts`.
- Ingen databasfunktion innehåller dessa titlar; inget skapar listan idag.
- 93 av 271 projekt har uppgiften "Transportbokning". Alla sådana rader skapades mellan 2026-02-07 och 2026-04-28 – rena arvsdata från när mallen var aktiv.

Skillnaden du ser beror alltså enbart på projektets ålder, inte på jobbtyp.

## Vad som byggs

1. **Mallen tas bort.** `defaultChecklist.ts` rensas på checklistan; bara `DeadlineRule`-typen behålls (används av `calculateDeadline.ts`). Nya projekt får inte längre någon lista – användaren bygger sin egen.
2. **En enda defaultpunkt: "Boka transport".** Varje nytt projekt får automatiskt exakt en uppgift med titeln "Boka transport", utan deadline. Den skapas i databasen när projektet skapas, så den kommer med oavsett om projektet skapas manuellt, via bokningsimport eller via befintliga auto-skapa-triggers.
3. **Auto-kryss vid transportbokning.** Dagens logik bockar av uppgiften "Transportbokning" när det finns transportuppdrag. Den uppdateras till att matcha "Boka transport" (och fortsatt även den gamla titeln, så att äldre projekt beter sig likadant).
4. **Gammal data lämnas orörd.** De 93 projektens befintliga uppgifter raderas inte automatiskt. Vill du rensa dem säger du till separat – då visar jag exakt antal rader först.

## Tekniskt

- Ny migration: trigger `AFTER INSERT ON public.projects` som kör en `SECURITY DEFINER`-funktion vilken infogar en rad i `project_tasks` (`title = 'Boka transport'`, `sort_order = 0`, `completed = false`, `organization_id` från projektet). Idempotent – hoppar över om en likadan öppen rad redan finns.
- `src/components/project/defaultChecklist.ts`: ta bort `DEFAULT_CHECKLIST` och `ChecklistTemplate`, behåll `DeadlineRule`.
- `src/pages/project/ProjectViewPage.tsx` rad 44–50: matchning på titel utökas till `['Boka transport', 'Transportbokning']`.
- Test: vitest-test som verifierar att auto-kryssningen matchar båda titlarna, plus en DB-kontroll efter migrationen att ett nyskapat testprojekt får exakt en uppgift.
