---
name: No Default Project Checklist
description: Projekt har ingen standardchecklista — enda automatiska uppgiften är "Boka transport"
type: constraint
---

Projekt får **ingen** standardlista med uppgifter. Användaren bygger sin "Att göra"-lista själv.

- Den gamla `DEFAULT_CHECKLIST` (Transportbokning, Kontroll av material tillgänglighet, Bokning av UE, Personalplanering, Platskontroll, Slutkontroll, Packning, Byggnation, Event, Nedmontering, Feedback, Stängning) är **borttagen och får aldrig återinföras**.
- Enda automatiska punkten: **"Boka transport"**, skapad av DB-triggern `trg_create_default_project_todo` (funktion `create_default_project_todo`) på `projects` AFTER INSERT. Idempotent.
- `src/components/project/defaultChecklist.ts` innehåller endast `DeadlineRule`, `DEFAULT_TRANSPORT_TODO_TITLE`, `TRANSPORT_TODO_TITLES`, `isTransportTodoTitle`.
- Auto-kryss: `ProjectViewPage` bockar av transportuppgiften via `isTransportTodoTitle` (matchar även historiska "Transportbokning") när transportuppdrag finns.
- Gamla projekt (skapade 2026-02-07 – 2026-04-28) har kvar arvsuppgifter från mallen — radera dem aldrig utan uttrycklig begäran.

**Why:** Användaren vill inte ha en påtvingad mall; den skapade brus på jobb som inte behövde punkterna.
