# Byt namn till "Projektutvärdering" + sidebar

## Vad ändras

**1. Rename "Projektekonomi" → "Projektutvärdering"** överallt där rubriken visas:
- `src/pages/project/ProjectLayout.tsx` (flik i medelprojekt-vy)
- `src/pages/project/LargeProjectLayout.tsx` (flik i stora projekt)
- `src/pages/EconomyOverview.tsx` (rubrik "Projektekonomi" på översiktssidan)

Kod, hooks, services, typer (`useProjectEconomy`, `ProjectEconomyTab`, `computeProjectEconomySignals` osv.) lämnas orörda — bara användarsynlig text byts.

**2. Sidebar (`src/components/Sidebar3D.tsx`)** — under "Projekt"-gruppen lägger jag till en ny child-rad:

```
Projekt
 ├─ Mina projekt
 ├─ Under slutförande
 └─ Projektutvärdering   ← NY (länkar till /economy, ikon Wallet)
```

`/economy` är den befintliga ekonomiöversikten (`EconomyOverview.tsx`) som listar alla projekt och deras ekonomi/utvärdering. Det är den naturliga "globala" ingången eftersom själva utvärderingen annars bor per projekt på `/project/:id/economy`.

Den befintliga toppnivå-raden **"Ekonomiöversikt"** i sidebaren behålls oförändrad (samma URL `/economy`) — om du hellre vill att jag tar bort den när "Projektutvärdering" läggs in under Projekt, säg till.

## Filer som redigeras
- `src/components/Sidebar3D.tsx` — ny child under "Projekt"
- `src/pages/project/ProjectLayout.tsx` — label
- `src/pages/project/LargeProjectLayout.tsx` — label
- `src/pages/EconomyOverview.tsx` — rubriktext

## Att bekräfta
- Ska den gamla raden **"Ekonomiöversikt"** i sidebaren ligga kvar, eller tas bort när "Projektutvärdering" läggs in under Projekt?
