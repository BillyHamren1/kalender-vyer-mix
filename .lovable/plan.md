## Problem

Just nu finns det två parallella "status"-system som krockar i Projektöversikten:

1. **Riktig projektstatus** (`projects.status`): aktiv, completed (=stängt), cancelled (=avbokat).
2. **Härledd ekonomi-status** (`getEconomyStatus`): hittar på 9 olika etiketter — `missing-data`, `risk`, `partially-invoiced`, `event-completed`, `upcoming` osv. — baserat på vad som råkar saknas i datan.

Det är (2) som producerar **"Saknar data"**. Den triggas så fort 3 av 7 datapunkter saknas (faktura, tidrapport, lev.faktura, budget, offert, eventdatum, booking). Ett helt normalt **kommande** projekt har naturligt 4 av dessa tomma → märks felaktigt som "Saknar data".

Du vill bara ha **tre** statusar, överallt:

- **Aktivt / Öppet**
- **Stängt**
- **Avbokat**

## Lösning

### 1. Ny enkel status-funktion

Ny fil `src/lib/economy/projectLifecycleStatus.ts`:

```ts
export type ProjectLifecycleStatus = 'active' | 'closed' | 'cancelled';

export function getProjectLifecycleStatus(p): ProjectLifecycleStatus {
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'completed' || p.economyClosed) return 'closed';
  return 'active';
}
```

### 2. Förenkla `EconomyStatusBadge`

Ersätt de 9 varianterna med 3:

```text
Aktivt    — grön/primary outline
Stängt    — grå (muted)
Avbokat   — röd (destructive)
```

Komponenten tar nu `ProjectLifecycleStatus` istället för `EconomyProjectStatus`.

### 3. Uppdatera `CompletedProjectsList` (Projektöversikten)

- Filter-dropdown blir bara: **Aktiva** (default), **Stängda**, **Avbokade**, **Alla**.
- Statuskolumn använder nya `getProjectLifecycleStatus`.
- Tar bort all logik som testar `economy-closed`, `missing-data`, `risk` osv. för filtrering/visning av status.

### 4. Behåll datafel som "varningsikoner", inte status

Ekonomi-flaggorna (saknad faktura/tidrapport/budget) är fortfarande nyttiga — men **inte som status**. De visas i de detaljerade ekonomi-vyerna (`ProjectEconomyTab`, `EconomyOverview`-dashboarden) som små varnings-chips/ikoner på raden, inte som projektets huvudstatus. Det här ändrar vi inte i den här rundan; vi rör bara översiktslistan.

### 5. Behåll bakåtkompatibilitet

`getEconomyStatus` och `EconomyProjectStatus`-typen tas **inte** bort — de används fortfarande av Ekonomi-dashboarden (`/economy` analyspanelerna) som grupperar projekt per fakturerings-fas. Vi byter bara ut dem på platsen där användaren ser en enkel "vad är statusen på projektet"-badge.

## Filer som ändras

- `src/lib/economy/projectLifecycleStatus.ts` (ny)
- `src/components/economy/EconomyStatusBadge.tsx` — accepterar `ProjectLifecycleStatus`, 3 varianter
- `src/components/economy/CompletedProjectsList.tsx` — nytt filter (Aktiva/Stängda/Avbokade/Alla), använder ny status-funktion
- `mem://features/project-economy/ui-hierarchy` — uppdatera regel: "Projektöversikten visar enbart livscykel-status (Aktivt/Stängt/Avbokat). Härledda ekonomi-statusar används bara i Ekonomi-dashboardens analysvyer."

## Resultat

Listan i Projektöversikten visar bara: **Aktivt** / **Stängt** / **Avbokat**. Inga fler "Saknar data", "Event klart", "Risk" eller "Redo fakturera" som projektstatus. Samma språk som du själv använder.
