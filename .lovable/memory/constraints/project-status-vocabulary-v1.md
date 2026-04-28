---
name: Project Status Vocabulary
description: Endast tre projektstatusar visas för användare i listor/badges - Aktivt, Stängt, Avbokat. Härledda ekonomistatusar är intern analys.
type: constraint
---

## Regel

Projekt har **endast tre statusar** ut mot användaren:

- **Aktivt** (`active`) — projektet är öppet/pågående
- **Stängt** (`closed`) — `projects.status === 'completed'` eller `economyClosed`
- **Avbokat** (`cancelled`) — `projects.status === 'cancelled'`

Mappning sker i `src/lib/economy/projectLifecycleStatus.ts` via `getProjectLifecycleStatus()`.

## Förbjudet i UI-listor och badges

Visa **aldrig** dessa som projektstatus mot användaren:
`upcoming`, `ongoing`, `event-completed`, `ready-for-invoicing`, `partially-invoiced`, `fully-invoiced`, `risk`, `missing-data`.

Speciellt **"Saknar data"** är en intern analys-flagga, inte en status. Den uppstår mekaniskt när 3+ datapunkter saknas och slår alltid till på kommande projekt utan fakturor/tidrapporter — vilket är förvirrande nonsens.

## Tillåten användning av `EconomyProjectStatus`

`getEconomyStatus` och `EconomyProjectStatus`-typen får leva kvar i `src/lib/economy/economyOverviewSelectors.ts` för **interna analysvyer** i Ekonomi-dashboarden där projekt grupperas per fakturerings-fas. De får aldrig sippra ut som badge eller listfilter.

## Komponenter som följer regeln

- `EconomyStatusBadge` — accepterar både ny `ProjectLifecycleStatus` och äldre `EconomyProjectStatus` men mappar alltid ner till de tre livscykel-värdena
- `CompletedProjectsList` — filter: Aktiva (default) / Stängda / Avbokade / Alla
