## Vad AI workday-reviewern faktiskt gör idag

Den körs synkront i `supabase/functions/get-staff-presence-day/index.ts` (rad 415–434) per staff×dag som "Lager 3.7" i Location Truth-pipelinen. Den bygger `aiInput` (`buildAiWorkdayReviewInput`) och kör `reviewWorkdayWithAi(aiInput)` — en CPU-tung pure-funktion (motorn analyserar segment + förslag).

Resultatet sparas i `aiWorkdayReviewSummary` + `aiWorkdayReviewProposals` på responsen och:

- `src/lib/staff/timeEngineTraceExport.ts` — bara passerar vidare i en debug-/trace-export.
- `src/hooks/useDisplayTimelineV2.ts` rad 169 — sätter `aiProposals` på timeline-objektet.

`aiProposals` läses **ingenstans** i UI. Det finns ingen knapp, ingen rendering, ingen skrivning till databasen — bara en separat batch-funktion `workday-ai-auto-stop` som är sin egen cron-funktion och inte beror på det här.

Slutsats: hela 3.7-blocket är död kod som äter CPU/RAM i varje presence-day-anrop. Det stämmer med din "vi kopplade bort den för längesen" — vi tog bort konsumenten, inte producenten.

## Plan

1. **Ta bort 3.7-blocket i `get-staff-presence-day/index.ts`**
   - Radera try/catch på rad 413–434 (`buildAiWorkdayReviewInput` + `reviewWorkdayWithAi`).
   - Ta bort importen på rad 67.
   - Sätt `aiWorkdayReviewSummary = null` och `aiWorkdayReviewProposals = []` så responsens shape inte ändras (trace-export och hook fortsätter fungera oförändrat).

2. **Lämna kvar (rör inte)**
   - `_shared/time-engine/aiWorkdayReviewer.ts` + tester — orörd, ifall vi vill återanvända senare.
   - `workday-ai-auto-stop` edge function — separat cron, inte i hot path.
   - `useDisplayTimelineV2.aiProposals` och fältet i `timeEngineTraceExport` — tomma arrays, ingen UI-effekt.

3. **Verifiera**
   - Bygget passerar.
   - Öppna personalkalendern → rader laddar (ingen WORKER_RESOURCE_LIMIT på `get-staff-presence-day`).
   - Kolla edge-logs för funktionen direkt efter.

## Varför inte hela presence-day-splitten nu

Det löser symptomet (CPU-spike per rad) utan att röra resten av Location Truth-pipelinen. Splitten i 3 funktioner kan vi göra som ett separat steg om kalendern fortfarande är seg efter detta.
