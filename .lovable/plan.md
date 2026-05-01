## Vad som ska ändras

`src/components/project/LargeProjectScheduleEditable.tsx` ska byggas om från det stora 3-korts-utseendet (bild 1) till den kompakta en-rads-stripen i bild 2.

## Ny layout (bild 2)

En enda horisontell rad inuti header-kortet:

```text
[📅 DATUM]  [ 25,26,27/5 -26 ]   [ 29,30,31/5 -26 ]   [ 1/6 -26 ]
                UPPMONTERING         EVENEMANG          NEDMONTERING
```

Specifikation:
- Vänster: en kalender-ikon + texten "DATUM" i versaler, muted färg, liten storlek. Ingen ram.
- Tre pills till höger, lika breda (`flex-1`), med:
  - Tunn rundad border (`rounded-full` eller `rounded-lg`), `bg-card`, lätt border (`border-border/40`).
  - Centrerad text: stort/fet datum-rad överst (t.ex. `25,26,27/5 -26`), liten versal-label under (`UPPMONTERING` / `EVENEMANG` / `NEDMONTERING`).
- Inga ikoner inuti pillsen, ingen countdown ("Om X dagar"), inga tider, inget streck mellan pillsen.
- Tomt tillstånd per pill: visa `—` på datum-raden istället för "Lägg till datum"-knapp; hela pillen är fortfarande klickbar och öppnar `EditDateDialog` (oförändrad logik).
- Hela pillen är klickbar (cursor-pointer, hover: lite mörkare border). `EditDateDialog`-integrationen och `onUpdateScheduleMulti`-anropet behålls exakt som idag.

## Datumformat

Matchar bild 2: kompakt komma-separerad lista av dagar + månad/år.
- Flera dagar samma månad: `25,26,27/5 -26`
- En dag: `1/6 -26`
- Spänner över flera månader: `30/5,1/6 -26`

Ny helper `formatDatesCompact(dates)` ersätter `formatDateSpan` för denna vy. Tar dagar, grupperar per månad, joinar dagar med komma, lägger till `/M -YY` på sista gruppen i varje månad.

## Labels

Ändras till de exakta från bild 2 (versaler, tracking-wider):
- `RIGG` → `UPPMONTERING`
- `EVENT` → `EVENEMANG`
- `NEDRIVNING` → `NEDMONTERING`

(Internt `editKey` `rig`/`event`/`rigDown` är oförändrat så ingen annan kod påverkas.)

## Det som tas bort

- Ikoner per kort (Truck/PartyPopper/ArrowDownToLine).
- Countdown-text ("Om X dagar", "Idag", "Imorgon").
- Tids-raden (08:00–17:00).
- "X dagar"-raden.
- Streck-separator mellan korten.
- Pencil hover-ikon.
- Today/past-styling (bakgrund/opacity-skiftet) — behålls inte i den nya minimalistiska stripen.

## Filer som rörs

- `src/components/project/LargeProjectScheduleEditable.tsx` — full omskrivning av render + ny `formatDatesCompact` helper. Props-signaturen och `onUpdateScheduleMulti`-kontraktet är oförändrade, så `LargeProjectLayout.tsx` behöver inte ändras.

## Inte i scope

- Ingen ändring av tids-redigering i `EditDateDialog` (tider sparas fortfarande via dialogen även om de inte visas i pillsen).
- Ingen ändring av `LargeProjectLayout.tsx` eller övriga konsumenter.
