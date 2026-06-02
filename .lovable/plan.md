# Plan — Restid får projekttillhörighet (utan att restid göms)

Mål: varje `travel`-segment ska veta vilket projekt/jobb kostnaden tillhör, visas tydligt i tidslinjen, och summeras separat per projekt. Inga GPS-, geofence-, klassnings- eller pipelineändringar.

## 1. Datamodell — utöka `StaffDaySegment`

Fil: `src/lib/staff/staffDayTimeline.ts`

Lägg till valfria fält på `StaffDaySegment` (bara meningsfulla när `kind==='travel'`):

```ts
travelBelongsToProjectId?: string | null;
travelBelongsToProjectName?: string | null;
travelBelongsToTargetId?: string | null;   // booking/large_project/location id
travelBelongsToTargetName?: string | null;
travelAllocationReason?:
  | 'travel_to_first_job'
  | 'travel_between_jobs_allocated_to_destination'
  | 'travel_after_last_job_allocated_to_last_job'
  | 'travel_to_private_not_allocated'
  | 'unresolved_travel_allocation';
```

Ingen migration. Endast TS-typer.

## 2. Allokeringsmotor (pure helper)

Ny fil: `src/lib/staff/allocateTravelToProjects.ts`

```ts
allocateTravelToProjects(timeline: StaffDayTimeline): StaffDayTimeline
```

Regler (kör efter `buildStaffDayTimeline`, muterar inte segmenten utöver de nya fälten):
- Iterera segments i tidsordning.
- För varje `kind==='travel'`-segment, hitta:
  - **nextWork** = nästa segment där `kind in {project, warehouse}`
  - **prevWork** = föregående segment där `kind in {project, warehouse}`
- Allokering:
  - Travel före första arbete + nextWork finns → `travel_to_first_job`, ärver project/target från nextWork.
  - Travel mellan två arbetsblock → `travel_between_jobs_allocated_to_destination`, ärver från nextWork.
  - Travel efter sista arbete (ingen nextWork) + prevWork finns → `travel_after_last_job_allocated_to_last_job`, ärver från prevWork.
  - Om endpoint i JourneyBlock pekar på `private`/`home` (kolla `toPlace.kind`/`fromPlace.kind` när tillgängligt) och ingen nextWork inom dagen → `travel_to_private_not_allocated`, lämna projektfält null.
  - Annars → `unresolved_travel_allocation`.
- Source för project/target-ID: läs från segmentets `sourceBlockId` → motsvarande presence-block i `model.blocks` (har `resolvedPlace.projectId` / `targetId`). Hämta via en helper som tar `blocks: DayBlock[]` som andra argument: `allocateTravelToProjects(timeline, blocks)`.

Anrops-punkt: i slutet av `buildStaffDayTimeline` innan return.

## 3. UI — visa allokering i tidslinjen

Fil: `src/lib/staff/staffDayTimeline.ts` `journeyToSegment` — uppdatera subtitle/label är OK men behåll `kind='travel'`.

Visning i `StaffTimeReportDetail.tsx`, `DayJournalRow.tsx`, `StaffGanttView.tsx`, `MyDayTimeline.tsx`:
- Label per reason:
  - `travel_to_first_job` / `travel_between_jobs_allocated_to_destination` → "Resa till {projectName}"
  - `travel_after_last_job_allocated_to_last_job` → "Resa från {projectName}"
  - `travel_to_private_not_allocated` → "Resa hem"
  - `unresolved_travel_allocation` → "Resa"
- Undertext:
  - allokerad → "Registreras på {projectName}"
  - unresolved → "Behöver kontroll – inget projekt kunde kopplas" + `reviewRequired=true`
  - private → "Privat resa – ej registrerad på projekt"

Sätt `reviewRequired=true` på `unresolved_travel_allocation`.

Behåll alla travel-rader som egna rader. Slå aldrig ihop med arbetsblock.

## 4. Projekttid — separat travel-summering

Fil: `src/lib/projects/projectHoursFromTimeEngine.ts`

Lägg till per projekt:
- `workMinutes` (oförändrat — befintlig logik)
- `travelMinutes` (nytt) = summa av segmentens minuter där `kind==='travel'` och `travelBelongsToProjectId === projectId`
- `totalMinutes = workMinutes + travelMinutes`

Returnera båda så projektvyn kan rendera:
```
Arbete: 8h 30m
Restid: 44m
Totalt:  9h 14m
```

Uppdatera `ProjectAutoTimeSection.tsx` (+ ev. `useGetProjectTimeSummary`) att visa restid på egen rad under arbete.

## 5. Personens dagstotal

Personens total är oförändrad (`payable_minutes` summerar redan project+warehouse+travel). Säkerställ bara att UI inte dubbelräknar travel när det visar projekttotaler.

## 6. Tester

Nya filer:
- `src/lib/staff/__tests__/allocateTravelToProjects.test.ts` — täcker alla 5 reasons + edge cases (endast travel, travel→travel utan arbete, travel mellan samma projekt, sista travel utan nextWork).
- `src/lib/projects/__tests__/projectHoursTravelAllocation.test.ts` — projekt får `travelMinutes` från resa som pekar på projektet, inte från resa till annat projekt.

Befintliga tester körs: `bunx vitest run` efter ändringarna.

## Tekniska detaljer

- Pure helper, inga DB-anrop, ingen edge function.
- `kind` förblir `'travel'` — bara metadata läggs till.
- Travel som idag har `reviewRequired=true` (uncertain journey) behåller det; allokeringen kan ytterligare sätta `reviewRequired` vid `unresolved_travel_allocation`.
- Hem/privat detekteras via `JourneyBlock.toPlace.kind === 'home' | 'private'` om fältet finns, annars heuristiskt: om sista travel på dagen och `toPlace` inte är ett känt projekt/warehouse → privat.

## Förbjudet (bekräftat följt)

Ingen ändring av: GPS-pings, geofence, råhämtning, Time Engine-pipeline, klassning av travel vs work, ihopslagning av travel+work, dölj/gömning av travel.

## Filer som ändras

- `src/lib/staff/staffDayTimeline.ts` (typer + journeyToSegment subtitle)
- `src/lib/staff/allocateTravelToProjects.ts` (ny)
- `src/lib/projects/projectHoursFromTimeEngine.ts` (separat travelMinutes)
- `src/components/project/ProjectAutoTimeSection.tsx` (visa restid)
- `src/components/staff/StaffTimeReportDetail.tsx` (subtitle/label)
- `src/components/staff/DayJournalRow.tsx` (subtitle/label)
- `src/components/staff/StaffGanttView.tsx` (tooltip/label)
- `src/components/mobile-app/MyDayTimeline.tsx` (label)
- Tester (2 nya filer)
