
## Fixa ankomstflödet så ALLA platstyper behandlas exakt likadant

### Problemet som ska bort
Koden behandlar idag samma verkliga händelse på tre olika sätt:

- **Fasta platser / Lager**: `report_location` skapar direkt en serverrad i `location_time_entries` med `source='gps'`.
- **Projekt / vanliga bokningar**: `useGeofencing` visar en lokal prompt och startar timer först när användaren bekräftar.
- **Arrival polling / push-påminnelse**: `useArrivalPrompt` + `handleGetArrivalState` fungerar bara för `location_id`, alltså fasta platser.

Det är exakt den splitten jag tar bort.

## Målet
En användare som anländer till:
- Lager
- stort projekt
- medelprojekt / vanlig bokning

ska gå genom **samma ankomstmodell**:

1. systemet registrerar en server-side “ankomstsignal”
2. samma promptlogik avgör om användaren ska få fråga
3. samma UI visas
4. samma val finns: starta från ankomst, starta nu, anpassa tid, inte nu
5. samma start-API används
6. samma testmatris gäller för alla platstyper

## Vad jag bygger

### 1. Inför ett gemensamt “arrival target”-kontrakt
Jag standardiserar ankomstdata överallt till en gemensam form, t.ex.:

```text
kind: 'location' | 'project' | 'booking'
target_id: string
label: string
arrived_at: ISO
address?: string
```

Detta används i:
- geofence-event från klienten
- arrival polling
- push-reminders
- confirm/dismiss
- tester

Så UI och server slutar tänka “lager vs projekt” och börjar tänka “arbetsplats/target”.

### 2. Gör servern till samma source-of-truth för ALLA ankomster
Jag flyttar bort särlogiken där bara fasta platser skapar riktig serverstate vid GPS-ankomst.

Istället bygger jag ett gemensamt serverflöde där ankomst registreras för:
- `location_id`
- `large_project_id`
- `booking_id`

med exakt samma regler för:
- öppen ankomst
- resolved/dismissed
- prompt_count
- arrived_at
- idempotens

Det innebär att dagens `arrival_prompt_log`-tänk generaliseras från bara `location_id` till alla target-typer.

### 3. Ersätt dagens location-specifika arrival state med ett generiskt API
Nuvarande:
- `get_arrival_state`
- `mark_arrival_resolved`

är hårdkodade till `location_id`.

Jag bygger om dem så de returnerar och hanterar:
- target type
- target id
- namn/label
- arrived_at
- prompts_sent
- should_prompt

Då kan både polling och cron använda exakt samma regelmotor för lager, projekt och bokning.

### 4. En enda promptkomponent för all ankomst
Jag återanvänder och generaliserar promptupplevelsen så den blir identisk oavsett target.

UI ska:
- visa samma språk och samma CTA-struktur
- visa targetnamn oavsett om det är Lager, Projekt X eller Kund Y
- erbjuda samma val:
  - Starta från ankomsttid
  - Starta nu
  - Anpassa tid
  - Inte nu

Jag tar bort den logiska skillnaden mellan:
- `GeofencePrompt` för booking/project/fixed
- `ArrivalPromptDialog` för fixed/location

och gör ett gemensamt ankomstflöde istället för två parallella.

### 5. Start ska gå via samma work-session-engine för alla tre typer
När användaren bekräftar ankomst ska start ske via samma motor:
- samma target-mappning
- samma startSession/startTimer-princip
- samma backdating-regel
- samma optimistic/sync-path

Det betyder att `MobileJobs.tsx`, `MobileGlobalOverlays.tsx` och relaterade call-sites ska sluta ha separata branches för “fixed/project/booking” i ankomstögonblicket.

### 6. Samma semantik för vad ankomst betyder
Jag gör ankomstlogiken konsekvent:

- **Ankomst** = systemet har sett att användaren kommit till en arbetsplats
- **Timerstart** = användaren väljer om arbetstid ska börja från ankomst, nu eller egen tid
- **Dismiss** = prompten markeras som löst för just den ankomsten, inte generellt för platsen

Detta ska gälla likadant för alla targets.

### 7. Hårda regressionstester för likabehandling
Jag bygger om/utökar testerna så de uttryckligen bevisar att plats-typerna beter sig identiskt.

#### Frontend-kontrakt
Nya/uppdaterade tester för att verifiera att:
- booking, project och location producerar samma promptmodell
- samma knappar finns för alla
- samma starttid skickas vidare när man väljer:
  - ankomsttid
  - nu
  - egen tid
- dismiss fungerar lika för alla

#### Backend-kontrakt
Tester för att verifiera att:
- arrival state kan skapas/läsas/resolvas för alla tre target-typer
- prompt-logik inte längre är låst till `location_id`
- samma “already resolved / already covered by report”-regler gäller för alla
- idempotens fungerar per target och arrival timestamp

#### End-to-end scenarier
Testmatris för samma scenario på alla tre typer:

1. Anländ 30 min tidigt
2. Välj “Starta från ankomst”
3. Välj “Starta nu”
4. Välj “Anpassa tid”
5. Välj “Inte nu”
6. Få ny prompt senare
7. Ha redan aktiv timer
8. Ha redan täckande time_report

Målet är att samma scenario ska ge samma beteende, bara med annat targetnamn.

## Berörda filer
Minst dessa delar behöver ändras:

- `src/hooks/useGeofencing.ts`
- `src/components/mobile-app/GeofencePrompt.tsx`
- `src/components/mobile-app/ArrivalPromptDialog.tsx`
- `src/components/mobile-app/MobileGlobalOverlays.tsx`
- `src/pages/mobile/MobileJobs.tsx`
- `src/hooks/useWorkSession.tsx`
- `src/services/mobileApiService.ts`
- `supabase/functions/mobile-app-api/index.ts`
- `supabase/functions/arrival-reminder/index.ts`
- relevanta testfiler i `src/test/`
- relevanta edge-function-tester i `supabase/functions/mobile-app-api/`

## Teknisk design
```text
GPS/geofence hit
  -> create/update unified arrival signal on server
  -> get_arrival_state returns generic target
  -> one prompt UI renders
  -> user picks start strategy
  -> unified work-session start
  -> arrival marked resolved
```

### Viktig implementation-not
Jag kommer inte nöja mig med att “göra projekt mer som lager” eller tvärtom.
Jag kommer istället:
- centralisera arrival-modellen
- ta bort typ-specifika specialfall i prompt/start-flödet
- låsa likabehandlingen med tester

## QA efter implementation
1. Anländ till Lager → exakt samma promptstruktur som för projekt.
2. Anländ till stort projekt → exakt samma promptstruktur som för Lager.
3. Anländ till vanlig bokning → exakt samma promptstruktur som för Lager.
4. Välj “Starta från ankomst” på alla tre → samma backdating-beteende.
5. Välj “Inte nu” på alla tre → samma resolve/dismiss-beteende.
6. Polling + push-reminder ska fungera för alla tre target-typer.
7. Samma kontraktstester ska passera för location/project/booking med identiska förväntningar.

