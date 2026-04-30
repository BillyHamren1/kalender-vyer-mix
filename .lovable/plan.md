## Mål

Två problem i `Planera projekt`-dialogen (`src/components/project/ProjectPlanningSheet.tsx`):

1. **Tar över hela skärmen** – idag ett höger-`Sheet` som täcker en stor del av vyn, så kalendern bakom göms.
2. **Bara en dag per fas** – Riggning/Event/Demontering visas som exakt en rad var, härlett från `rigdaydate` / `eventdate` / `rigdowndate`. Användaren kan inte lägga till fler riggdagar eller demonteringsdagar.

## Ändringar (bara denna fil)

### 1. Byt panel-typ: Sheet → flytande, icke-modal sidopanel
- Ersätt `<Sheet>` / `<SheetContent>` med en egen container:
  - `position: fixed`, `right-4 top-20 bottom-4`, `w-[420px] max-w-[90vw]`
  - `z-40`, `bg-background`, `border`, `rounded-lg`, `shadow-xl`, `overflow-y-auto`
  - **Ingen backdrop / overlay** – kalendern bakom förblir synlig och klickbar.
  - Stäng-knapp (X) uppe till höger.
- Behåll samma props (`open`, `onClose`); rendera bara `null` när `!open`.
- Behåll `SheetHeader/Title/Description`-stilen visuellt men som vanliga `div`.

### 2. Lägg till "+ Lägg till dag" per fas
- Gruppera `days` per `kind` (`rig` / `event` / `rigDown`) i renderingen, sektion per fas med rubrik + en lista med dagar + en `+ Lägg till dag`-knapp.
- Ny knapp `addDay(kind)`:
  - Default-datum = sista befintliga dagen i fasen + 1 dag, annars första bokningens motsvarande datum, annars idag.
  - Defaulttider per fas (samma konstanter som idag).
  - Default-team = `masterTeam` om `useSameTeamForAll`, annars `team-1`.
- Lägg till **datum-input** (`type="date"`) per dag-rad så användaren kan justera datumet på extra dagar (görs synligt även för original-raderna för enhetlighet).
- Ny knapp **ta bort dag** (papperskorg) per rad – men dölj den om det är fasens enda kvarvarande dag (för att inte tappa fasen helt; om man vill ta bort hela fasen kan vi tillåta det också – föreslår: tillåt att radera, faserna är valfria).
- Sortera fortfarande hela `days`-listan efter datum vid spara.

### 3. Spara: stötta flera dagar per fas
- Loopen som skapar `calendar_events` funkar redan per dag → ingen ändring i kärnlogik.
- `bookings.<phase>_*_time`-uppdateringen tar idag första matchande dag per fas. Behåll det (tider per dag är ändå redan i `calendar_events`); använd `days.find(d => d.kind === 'rig')` på den tidigaste rig-dagen efter sortering – byt till `days.filter(...).sort()[0]` för tydlighet.
- Inget DB-schemat ändras.

### 4. Övrigt
- Filen blir fortfarande < 200 rader → ingen ytterligare splittring krävs.
- Inga andra filer ändras. Inga migrations. Inga edge functions.

## Tekniska detaljer

```text
Före:                                After:
┌─────────────────────────┐         Kalender (synlig hela tiden)
│ Sheet (höger, ~50vw)    │              ┌──────────────────┐
│ skymmer kalendern       │              │ Planera projekt  │
│                         │              │  Riggning        │
│  Riggning  tors 2 juli  │              │   • tors 2 juli  │
│  Event     lör 4 juli   │              │   • fre 3 juli   │  ← ny
│  Demont.   mån 6 juli   │              │   [+ Lägg till dag]│
│                         │              │  Event           │
└─────────────────────────┘              │   • lör 4 juli   │
                                         │   [+ Lägg till dag]│
                                         │  Demontering     │
                                         │   • mån 6 juli   │
                                         │   • tis 7 juli   │  ← ny
                                         │   [+ Lägg till dag]│
                                         │ [Avbryt] [Spara] │
                                         └──────────────────┘
                                         (flytande, ingen overlay)
```

State-form per dag oförändrad:
```ts
{ date, kind: 'rig'|'event'|'rigDown', startTime, endTime, teamId }
```

Spara-loopen iterar redan över alla `days` → en rad i `calendar_events` per (dag × bokning × fas), så multipla dagar per fas hanteras automatiskt så snart UI tillåter dem.

## Risker
- Att panelen är icke-modal innebär att användaren kan klicka i kalendern medan den är öppen. Det är önskat (de vill se kalendern). Vi sparar dock state inom panelen tills `Spara` klickas – inga side effects förrän dess.
- Default-datumet vid `+ Lägg till dag` kan krocka med befintlig dag i samma fas – det är OK, calendar_events-tabellen tillåter flera per dag/fas/booking.
