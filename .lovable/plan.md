## Mål

Gör så `useOpsControl` bara hämtar data som faktiskt visas. `OpsControlCenter` aktiverar `messages`/`activity` först när Kommunikation-panelen öppnas. `metrics` defaultar till `false`.

## Filer

- `src/hooks/useOpsControl.ts`
- `src/pages/OpsControlCenter.tsx`

## Ändringar

### `src/hooks/useOpsControl.ts`

1. Lägg till options-typ och parameter:
   ```ts
   export type UseOpsControlOptions = {
     enableMetrics?: boolean;
     enableTimeline?: boolean;
     enableJobQueue?: boolean;
     enableLocations?: boolean;
     enableMapJobs?: boolean;
     enableMessages?: boolean;
     enableActivity?: boolean;
   };
   export const useOpsControl = (options: UseOpsControlOptions = {}) => { ... }
   ```
2. Lös defaults internt:
   - `enableTimeline`, `enableJobQueue`, `enableLocations`, `enableMapJobs` → `true`
   - `enableMetrics`, `enableMessages`, `enableActivity` → `false`
3. Sätt `enabled: <flag>` på respektive `useQuery` (metrics, timeline, jobQueue, locations, mapJobs, messages, activity).
4. Behåll realtime-invalidations som de är (de skadar inte när queries är disabled — de invaliderar bara cache-nyckeln).
5. Return-objektet är oförändrat — `messagesQuery.data || []` och `activityQuery.data || []` ger tomma arrays när disabled.

### `src/pages/OpsControlCenter.tsx`

1. Anropa `useOpsControl({ enableMessages: commsOpen, enableActivity: commsOpen })`.
   - `enableMetrics` lämnas till default `false`.
   - Övriga (timeline/jobQueue/locations/mapJobs) använder default `true`.
2. `commsOpen` är redan deklarerat tidigare — eftersom `useOpsControl`-anropet ligger före state-deklarationerna måste state-blocken flyttas upp så `commsOpen` finns innan hook-anropet. Konkret: flytta `useState`-raderna för `liveProjectsOpen`/`locationsOpen`/`commsOpen`/`staffCalendarOpen` (samt övriga useState) ovanför `useOpsControl`-anropet.
3. Inga UI-ändringar.

## Verifiering

- Initial load: nätverksloggen visar inga anrop till `fetchOpsMetrics`, `fetchStaffMessages`, `fetchJobActivity`.
- Öppna Kommunikation-panelen: `fetchStaffMessages` + `fetchJobActivity` körs då.
- Karta, Dagens jobb, KPI-chips fortsätter fungera (timeline/jobQueue/locations/mapJobs aktiva som default).