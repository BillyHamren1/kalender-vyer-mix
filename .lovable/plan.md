## Problem

De tre projekten ("Pick up key…", "Pick up carpet nessim", "Pick up tross workman") är redan **soft-deletade** i databasen — alla har `deleted_at = 2026-05-15 09:37:29`. Förra gången jag agerade tog jag alltså bort rätt projekt, men de visas fortfarande i "Att planera"-listan.

Orsak: `src/hooks/useUnplannedProjects.ts` filtrerar bara på `planning_status = 'needs_planning'` och saknar filter på `deleted_at IS NULL`. Soft-deletade projekt läcker därför in i listan.

## Åtgärd (en fil)

**`src/hooks/useUnplannedProjects.ts`**
- Lägg till `.is('deleted_at', null)` på både `projects`- och `large_projects`-queryn.

Det räcker — projekten är redan borta, de ska bara försvinna ur vyn. Inget databasarbete behövs (de tre raderna är redan markerade raderade och hamnar i Papperskorgen där de kan återställas).

## Verifiering

- Kör `bunx vitest run` för relevanta planning-tester.
- Bekräfta i preview att de tre raderna försvinner ur "Att planera".
