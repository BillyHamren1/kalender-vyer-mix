## AI-granskning för osäkra tidrapportblock

Bygger en ren förslags-pipeline: admin klickar "AI-granska" på osäkra block, AI returnerar strukturerat förslag, allt sparas i en separat tabell. Inga befintliga rapport-/workday-/GPS-data rörs.

### 1. Databas (migration)

Ny tabell `time_report_ai_reviews`:
- `id`, `organization_id`, `staff_id`, `date`, `block_id`
- `engine_version`
- `review_status` (`suggested` | `accepted` | `rejected` | `superseded`, default `suggested`)
- `current_classification`, `suggested_classification`, `suggested_kind`, `suggested_label`, `suggested_minutes`
- `confidence` (text), `confidence_score` (numeric)
- `reasoning_summary` (text), `evidence_json` (jsonb), `suggested_action_json` (jsonb)
- `concerns_json` (jsonb)
- `admin_feedback` (text), `reviewed_by` (uuid), `reviewed_at` (timestamptz)
- `created_at`, `updated_at`
- Index på `(organization_id, staff_id, date)` och `(block_id)`
- RLS RESTRICTIVE på `organization_id` (admin/manager kan select/update; insert endast via service role från edge function).
- När en ny review skapas för samma `block_id` → tidigare `suggested` blir `superseded` (trigger).

### 2. Edge function `analyze-time-report-block`

Input: `{ organizationId, staffId, date, blockId, engineVersion, dryRun? }`.

Steg:
1. Auth + org-check (admin/manager).
2. Hämta dagens snapshot via befintliga byggare:
   - `buildActualStaffDayModel` → `reportCandidateBlocks`, `presenceDayBlocks`, `dayBlockTimeline`
   - `buildGpsDayTimeline` runt blocket (±60 min)
   - `resolveWorkTargets` för dagens targets
   - Hämta `previousBlock`/`nextBlock`, geofence enter/exit, companion route om tillgängligt
3. Plocka ut blocket via `blockId`. Returnera 404 om saknas.
4. Bygg strukturerad prompt (system + user) med kompakt evidence-snapshot.
5. Kalla Lovable AI Gateway (`google/gemini-3-flash-preview`) med `Output.object` + zod-schema → garanterad JSON.
6. Tvinga `shouldAutoApply: false`.
7. Om `dryRun !== true`: markera tidigare reviews för blocket som `superseded`, INSERT ny rad.
8. Returnera review-objektet.

Strikt validering: AI får endast föreslå, aldrig skriva till `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, `gps_pings`, `active_time_registrations`. Edge function har bara INSERT/UPDATE-rättigheter på `time_report_ai_reviews`.

### 3. Edge function `resolve-time-report-ai-review`

Input: `{ reviewId, decision: 'accepted' | 'rejected' | 'needs_human_review', adminFeedback? }`.

Endast UPDATE på `time_report_ai_reviews` (status, `reviewed_by`, `reviewed_at`, `admin_feedback`). Rör inget annat.

### 4. Frontend (admin `/staff-management/time-reports`)

- `src/services/timeReportAiReviewApi.ts` — `requestAiReview`, `resolveAiReview`, `useAiReviewForBlock(blockId)` (React Query).
- Identifiera "osäkra" block via befintliga flaggor: `reviewState === 'needs_review'`, `kind` i (`unknown`, `signal_gap`, `missing_transition_evidence`), eller `confidence === 'low'`/`'medium'` på transport/work.
- Ny komponent `BlockAiReviewPanel.tsx` som visas under blocket i ReportCandidateTimeline:
  - Om ingen review: knapp **AI-granska**.
  - Om review finns: kort med Föreslagen tolkning, Confidence-badge, Motivering, Evidence-lista, Risker/oklarheter.
  - Knappar: **Acceptera**, **Avvisa** (öppnar feedback-fält), **Behöver manuell kontroll**.
- Decision Trace-vyn: ny sektion "AI-granskning" som visar latest review + historik.

### 5. Tekniska detaljer

- Ny shared modul `supabase/functions/_shared/ai-review/` med zod-schema och prompt-builder (deno).
- Prompt instruerar modellen explicit att den endast föreslår, inte ändrar.
- Engine-version läses från `BUILD_*` constants som redan finns i time-engine.
- `evidence_json` lagrar trimmad snapshot (max ~10kB) för senare analys.

### 6. Ej i scope

- Ingen auto-apply av förslag.
- Ingen mobil-UI.
- Ingen ändring av reportCandidate/timeline-motorn.
- Inga lärdataexport-vyer (datan finns i tabellen, kan analyseras separat).
