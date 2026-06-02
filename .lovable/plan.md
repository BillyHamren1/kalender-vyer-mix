## Mål

Gör om `PageHeader`-komponentens `variant="purple"` så att den ser ut **exakt** som teal-bannern i bilden — fast i lila. Alla projektsidor som redan använder `variant="purple"` (Projekthantering, stora projektets shell, planning-vyer m.fl.) får automatiskt det nya utseendet.

## Vad som ändras visuellt

Från: vit kort-stil med liten 36×36 ikon-tile och kompakt typografi.

Till (matchar bilden):
- **Solid lila banner** (radius ~`rounded-2xl`, generös padding `px-6 py-5`) med mjuk drop-shadow.
- **Vit rundad ikon-tile** ~56×56 (`rounded-xl`/`rounded-2xl`, vit bg, mjuk inre skugga) med lila ikon i centrum.
- **Titel** stor och vit (`text-2xl/3xl font-bold`).
- **Subtitle** i vit/90 opacity, mindre, tight radavstånd direkt under titeln.
- **Höger sida**: action-knappar i två stilar:
  - Sekundära ikonknappar → halvtransparent vit pill (`bg-white/15 hover:bg-white/25`, vit ikon).
  - Primär action → solid **vit pill** med lila text/ikon (`bg-white text-[hsl(var(--planner))]`, fet, `rounded-xl`, ikon vänster).
- Behåller `children` som mellanslot för extra knappar (de stylas också på vit/transparent bakgrund så de syns mot lila).

Lila ton tas från befintliga tokens i `index.css` (`--planner` / `--gradient-planner` / `--shadow-planner`) — ingen ny färg införs.

## Scope

- **Endast** `src/components/ui/PageHeader.tsx` (variant `purple` får ny rendering).
- `variant="default"` (teal) och `variant="warehouse"` (amber) lämnas orörda.
- Inga callsites ändras — alla nuvarande purple-headers ärver automatiskt.
- Ingen logik, inga props, inga hooks ändras. Rent UI.

## Verifiering

1. Visuell QA i preview på `/projects` (ProjectManagement) + stora projektets shell — bannern ska matcha bilden i lila.
2. Bekräfta att children-knapparna (Uppdatera/Arkiv/Skapa to do) syns tydligt mot lila bakgrund.
3. Snabb responsiv koll: på smal vy stackar titel-block och knapp-block vertikalt (samma `flex-col sm:flex-row`-grund som idag).
4. Kör vitest-sviten för att säkerställa att inga snapshot/contract-tester bryts.

## Begränsningar

- UI-only. Ingen ändring i datalager, hooks, callbacks, routing, eller andra komponenter.
- Använder befintliga design-tokens, inga nya färger i komponenten.
