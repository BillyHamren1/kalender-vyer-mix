# Ta bort "Väntar på avslut" från projektöversikten

## Vad som ändras

- Sektionen "Väntar på avslut" (listan med genomförda men öppna projekt) tas bort helt från /projects.
- Statuskortet "varav Väntar på avslut" i sifferraden tas också bort, så sidan inte visar samma sak i en annan form.
- Inget annat på sidan påverkas: Aktiva totalt, Planering, Pågående, Avslutade, Kommande 14 dagar och Projektbelastning framåt ligger kvar.
- Avslutsfunktionen finns kvar oförändrad på sidan Projektavslut (/projects/closing) — det är där projekt stängs.

## Teknisk detalj

- `src/components/project/ProjectDashboardWidgets.tsx`: ta bort `attentionProjects`-memon, dess kort/render-block, samt `closingCount` och tillhörande post i `statItems`. Rensa oanvända imports (t.ex. `AlertCircle`, `CheckCircle2` om de blir oanvända).
- Ingen ändring i `ClosingProjectsList.tsx`, inga datalager- eller DB-ändringar.
