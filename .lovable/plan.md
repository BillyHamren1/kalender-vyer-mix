# AI-driven tidsgranskning i realtid

## Vad det gör
Varje gång ett tidsblock avslutas (time_report skapas/uppdateras, eller en timer stoppas) startar en AI-pipeline som:

1. Läser hela dagens kontext för personen (time_reports, LTE, travel, GPS-pings, place_visits, planerade bokningar via BSA, projektets geofence, plannedDay).
2. Avgör om blocket är **klart**, **behöver vänta på nästa block** (t.ex. om personen precis lämnat geofence — då pausas analysen), eller **skevt**.
3. Vid skevt block: skapar `time_report_correction_suggestions` med förklaring + förslag (justera start/slut, byt target, splitta, slå ihop, klassa som travel/private).
4. **Hög confidence + säker regel** → auto-applicerar förslaget direkt på `time_reports` (audit-loggat, kan rullas tillbaka). Låg confidence → läggs som förslag.
5. Sparar mönster i en **regelbok** (`staff_time_learning_rules`) — t.ex. "Anna jobbar alltid 22–06 på Projekt X", "Erik kör alltid hem via lagret" — som framtida AI-anrop får som primer.

## Säkerhetsspärrar (från projekt-memory, oförhandelbart)
- AI får ALDRIG dra av tid (mem: ai-only-on-unclear-segments-v1).
- AI rör ALDRIG godkända rapporter (approved-lock).
- AI rör ALDRIG nattliga GPS-only-block utan TR/LTE/manuell workday bakom (night-gps-only-guard).
- Inuti projekt-geofence = tid på projektet (geofence-inside-time-authority).
- Time Data Authority oförändrad: time_report är fortfarande sanningen, AI föreslår/justerar inom sina ramar.
- AI ändrar **inte källkoden** (det jag inte kan/bör bygga). "Självlärande" = växande regelbok i DB som AI:n läser inför varje analys.

## Auto-apply-policy (vad som får ändras utan godkännande)
Endast dessa fall, allt annat blir förslag:
- Trim ≤10 min mot exakt geofence-exit (GPS bevisar att personen lämnade då).
- Slå ihop två konsekutiva block på samma target med <5 min mellanrum.
- Flytta blockets target från "okänt" → projektets ID när blocket helt ligger inuti projektets geofence.
- Allt annat → suggestion + banner i dag-vyn.

## Arkitektur

### Ny edge function: `ai-time-block-reviewer`
- Actions: `review_block` (efter stop), `review_day` (manuell on-demand), `apply_suggestion`, `dismiss_suggestion`.
- Använder Lovable AI Gateway (`google/gemini-3-flash-preview` default, fallback till `gemini-2.5-pro` för svåra dagar).
- Structured output via AI SDK `Output.object` med Zod-schema: `{verdict, confidence, action, reasoning, ruleLearned?}`.
- Prompt får: dagens timeline, BSA-planering, geofence-status, plannedDay, **alla matchande regler från `staff_time_learning_rules`**, samt en lång SYSTEM-prompt med allt vi diskuterat (Time Data Authority, geofence-regeln, night-guard, transport-regeln, single-timer-policy, work-confirmed-bypass, m.fl. — listade ordagrant så AI:n förstår ramverket).

### Ny tabell: `staff_time_learning_rules`
- `staff_id`, `organization_id`, `scope` (staff|project|org), `pattern_type` (night_shift_ok | travel_home_via_warehouse | short_visit_counts | …), `pattern_data` (jsonb), `confidence`, `learned_at`, `verified_count`, `superseded_by`.
- RLS: org-isolerad.
- AI skapar dem; admin kan inaktivera dem från en ny "Lärda regler"-sida.

### Trigger: realtidsanrop efter stop
- DB-trigger på `time_reports` (AFTER INSERT/UPDATE där end_time blev satt och status != 'approved') → `pg_net.http_post` till `ai-time-block-reviewer`.
- Debounce 30s per (staff, date) så att vi inte spammar när 5 block stoppas samtidigt.
- "Vänta på nästa block"-logik: om GPS visar att personen fortfarande är i rörelse / inte stabiliserat sig → pipeline returnerar `wait_for_next`, ingen suggestion skapas än.

### UI: integrerat i dag-vyn (inte egen tabb)
- `StaffTimeReportDetail` (admin) och dag-rader i `StaffWeekPanel`:
  - Liten AI-badge per block: ✅ granskad / 💡 förslag / ⚠️ behöver kolla / ⏳ analyserar.
  - Klick på badge → popover med AI:ns resonemang + Godkänn/Avvisa/Öppna full vy.
  - Auto-applicerade ändringar visas med en "Justerad av AI"-tag + ångra-knapp i 24h.
- Banner högst upp i dag-vyn om dagen har öppna förslag.

### Lärande-loopen
- När admin godkänner ett AI-förslag → `verified_count++` på relaterade regler.
- När admin avvisar → regeln markeras `superseded` om den orsakade förslaget.
- Inför nästa AI-anrop laddas alla aktiva regler för (staff, projekt, org) in i prompten.

## Filer som skapas
- `supabase/migrations/…_ai_time_reviewer.sql` — `staff_time_learning_rules`, ny kolumn `applied_by_ai`/`ai_reasoning` på `time_report_correction_suggestions`, trigger + cron-debouncer.
- `supabase/functions/ai-time-block-reviewer/index.ts`
- `supabase/functions/ai-time-block-reviewer/prompts.ts` — SYSTEM-prompt (lång, ordagrann från projekt-memory).
- `supabase/functions/ai-time-block-reviewer/schema.ts` — Zod-output.
- `supabase/functions/ai-time-block-reviewer/applySuggestion.ts` — auto-apply-policy.
- `supabase/functions/ai-time-block-reviewer/loadRules.ts`.
- `src/hooks/useAiBlockReview.ts` — realtidsprenumeration på suggestions.
- `src/components/staff-time-reports/AiBlockBadge.tsx`
- `src/components/staff-time-reports/AiSuggestionPopover.tsx`
- `src/components/staff-time-reports/AiDayBanner.tsx`
- `src/pages/AiLearnedRules.tsx` + route — admin ser/inaktiverar regler.
- `src/test/aiBlockReviewer.test.tsx` — enhetstest för apply-policy + UI-badge.
- Edge-tester: `supabase/functions/ai-time-block-reviewer/index_test.ts`.

## Filer som ändras
- `src/components/staff-time-reports/StaffWeekPanel.tsx` — visa AI-badge per block.
- `src/components/staff/StaffTimeReportsList.tsx` (eller motsv. dag-detalj) — banner + popover.
- Mem-index: ny constraint `mem://features/admin/ai-time-reviewer-v1`.

## Det jag INTE bygger (och varför)
- **AI som ändrar TS/React-koden själv** — omöjligt i runtime, säkerhetshål, bryter mot deploy-modellen. Ersätts av regelboken som ger samma effekt: systemet blir skarpare för varje granskning utan kodändring.
- **Auto-apply på godkända rapporter** — bryter approved-lock.
- **AI som drar av tid** — bryter ai-only-on-unclear-segments.

## Verifiering
- Vitest: apply-policy (10-min-trim, merge, geofence-target-flytt) + att approved/night-GPS-only ALDRIG modifieras.
- Deno-test: ai-time-block-reviewer returnerar `wait_for_next` när GPS pågår, returnerar suggestion på syntetiskt skevt block.
- E2E i preview efter deploy.
