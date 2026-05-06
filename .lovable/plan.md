# Fix: motsägande timer-status på "På projekt"-banner vs journal-block

## Vad användaren ser

Headern säger **"På projekt – timer saknas"** (eller "timer osäker") medan ett ProjectVisitBlock i huvudjournalen för samma projekt säger **"timer aktiv"** — eller tvärtom. Båda gäller samma projekt och samma dag, så det ser ut som en bugg.

## Rotorsak

I `src/components/staff/ProjectVisitBlock.tsx` (`buildProjectBlocks`) byggs ETT block per `gps_visit`-rad. Om personen besökt projektet två gånger samma dag (t.ex. lämnat, kom tillbaka) får vi **två block med samma `placeKey`**.

Timer-eventen (`timer_started` / `timer_stopped`) indexeras däremot **en gång per placeKey** — och kopplas alltså till ett av besöken, men `hasTimer/timerActive` får samma värde för **båda blocken** trots att timern bara verkligen var igång under ett av dem.

Banner (`ActualDayPanel.tsx` rad 1237–1246) väljer `currentOngoingProject` = **senaste pågående block**. Det blocket kan ha `timerActive=false` (timer stoppades vid första besökets slut), så bannern skriver "timer saknas", samtidigt som journalen visar det tidigare blocket som "timer aktiv" via samma karta.

Dessutom är ordet "saknas" missvisande — det betyder bara "ingen timer-event ligger inom detta GPS-fönster", inte att något är trasigt.

## Plan

1. **Tidsfönsterbaserad timer-koppling** i `buildProjectBlocks`
   - Bygg lista över timer-intervall `(placeKey, startedIso, stoppedIso|null)` istället för en map per placeKey.
   - För varje block, sätt:
     - `timerStartedIso` = första timer_started inom `[block.startIso, block.endIso ?? now]`
     - `timerStoppedIso` = motsvarande stop (om något)
     - `timerActive` = sant endast om en timer öppnad i blockets fönster fortfarande är öppen
     - `hasTimer` = sant om någon timer överlappar blockets fönster
   - Resultat: två besök på samma plats får sin egen, korrekta timer-status.

2. **Konsistent källa för bannern**
   - Bannern använder redan `currentOngoingProject` från samma `projectBlocks`-array, så fix #1 räcker för att ban­ner och journal alltid visar samma värde för samma block.

3. **Tydligare språk i bannern** (`ActualDayPanel.tsx` rad 1242–1246)
   - `'På projekt – timer aktiv'` → behåll
   - `'På projekt – timer saknas'` → **`'På projekt – ingen timer registrerad'`**
   - `'På projekt – timer osäker'` → **`'På projekt – timer stoppad tidigare'`** (när vi ser timer_stopped men ingen pågående timer)
   - `'På projekt – arbetsdag saknas'` → behåll

4. **Test**
   - Lägg till case i `src/lib/staff/__tests__/` (ny fil `projectBlocks.timerWindow.test.ts`):
     - Två besök, en timer som öppnas+stängs i besök 1 → besök 1: `timerActive=false, hasTimer=true`; besök 2: `hasTimer=false`.
     - Ett besök, timer fortfarande öppen → `timerActive=true`.
     - Ett besök, ingen timer → `hasTimer=false`.

## Filer som ändras

- `src/components/staff/ProjectVisitBlock.tsx` — `buildProjectBlocks` byter index till tidsfönster.
- `src/components/staff/ActualDayPanel.tsx` — nytt headline-språk (rad 1242–1246).
- `src/lib/staff/__tests__/projectBlocks.timerWindow.test.ts` — ny testfil.

Inga DB- eller edge-function-ändringar behövs.
