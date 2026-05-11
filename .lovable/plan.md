# Tidrapport AI 1 — Helautomatisk AI-granskning av oklara report-block

## Mål
AI-granskar automatiskt block i `staff_day_report_cache` som hamnar i "Behöver granskas". Vid hög confidence (≥0.75; work utan direct assignment ≥0.85) skriver AI om blocket i cachen + audit. Vid osäkerhet ligger blocket kvar med chip "AI osäker". **Det är användaren (staff i mobilen) som godkänner sina egna tider** — varken AI eller admin attesterar. Inget rör GPS-rådata, time_reports, workdays, LTE, travel_time_logs eller redan godkända/låsta dagar.

## Ansvarsmodell (godkännande)
- **AI**: städar bara förslagen i report-cachen. Får aldrig markera dagen som godkänd.
- **Användaren (staff)**: enda part som attesterar sin egen dag. Det sker i mobilappens befintliga "Granska & godkänn"-flöde.
- **Admin**: ser resultatet, kan korrigera enskilda block, men attesterar inte åt användaren.
- AI-resultat (auto_applied / uncertain) ska vara tydligt synliga för användaren när de attesterar — så de kan acceptera eller justera innan godkännande.

## Räckvidd
- Adminwebb (chips/decision trace) + mobilens granska-vy (chips + tydlig "AI har klassat detta block"-info inför attest).
- AI skriver ENBART till `staff_day_report_cache` (report blocks + summary) och ny audit-tabell.
- Trigger: körs automatiskt direkt när Day Timeline Engine producerat/uppdaterat en cache-rad som innehåller needs_review-block.
- Approved/locked dagar är orörbara av AI.

## Arkitektur

```text
day-timeline-engine (compute)
  └─ skriver staff_day_report_cache
        │
        ▼ DB-trigger (AFTER INSERT/UPDATE när needs_review-block finns
                      OCH dagen INTE är approved/locked)
  pg_net.http_post → ai-review-time-report-blocks
        │
        ▼
  1. Plocka needs_review-block ur cachen
  2. Bygg evidence per block
  3. Lovable AI Gateway (gemini-3-flash) med Output.object
  4. Safety checks
  5. Patcha block + recalc summary i cachen
  6. Skriv audit
        │
        ▼
  Realtime postgres_changes → admin- & mobil-UI hämtar om cachen
  Chips "AI-klassad" / "AI osäker" syns automatiskt
  Användaren ser AI-resultat i sin granska-vy och attesterar själv.
```

## Steg

### 1. DB-migration
- Skapa `time_report_ai_block_audit` (org_id, staff_id, date, engine_version, cache_id, block_id, status, original_block_json, ai_result_json, updated_block_json, confidence_score, suggested_kind, applied_kind, reasoning_summary, evidence_used_json, safety_flags_json, model_version, created_at). RLS: org-isolation; admin-läs + staff får läsa egna rader (för transparens i mobilen). Insert via service role.
- Lägg till `ai_review_pending` + `ai_review_signature` på `staff_day_report_cache` (idempotensskydd).
- DB-trigger på `staff_day_report_cache` AFTER INSERT/UPDATE: enqueue om raden har minst ett needs_review-block, dagen inte är approved/locked, och `ai_review_signature` skiljer sig.
- Aktivera `pg_net` om inte redan aktivt.

### 2. Shared types & policy
`src/lib/staff/aiReview.ts` + Deno-spegling i `supabase/functions/_shared/ai-review/types.ts`:
- `AiReviewMeta` enligt spec.
- `AiSuggestion` (zod).
- Konstanter: `AI_THRESHOLD_DEFAULT = 0.75`, `AI_THRESHOLD_WORK_NO_ASSIGNMENT = 0.85`.
- `ALLOWED_AI_KINDS = ['transport','work','exclude_from_report','unknown','break','private']`.

### 3. Edge function (autonom)
`supabase/functions/ai-review-time-report-blocks/index.ts`:
- Auth: service-role-only (anropas av DB-trigger). Avvisar externa anrop utan service-role-token.
- Body: `{ cacheId }`.
- Avbryt direkt om dagen är `approved` eller `locked` (skydd även här).
- Plockar kandidatblock: `reviewState='needs_review'` / kind in `unknown|needs_review` / `signal_gap` / `missing_transition_evidence` / låg confidence.
- För varje block: bygg evidence → Lovable AI Gateway (`google/gemini-3-flash-preview`) via AI SDK `generateText` + `Output.object` → safety checks → patcha eller markera uncertain → audit.
- Efter loopen: `recalculateSummaryFromReportBlocks(blocks)` → uppdatera summary, sätt `ai_review_signature`.
- Rör ALDRIG: `gps_pings`, `staff_location_history`, `time_reports`, `workdays`, `location_time_entries`, `travel_time_logs`, approved/locked dagar, löneexport, `staff_day_submissions.approved_*`.

### 4. Summary recalc helper
`supabase/functions/_shared/ai-review/recalcSummary.ts` + `src/lib/staff/recalcSummaryFromReportBlocks.ts`. Bygger om `workMinutes / transportMinutes / excludedMinutes / unknownMinutes / needsReviewMinutes` direkt från blocklistan.

### 5. Safety checks (blockerar auto-apply)
- Dagen approved/locked → skip.
- `confidenceScore < 0.75`.
- `suggestedKind = needs_review` eller utanför `ALLOWED_AI_KINDS`.
- `safetyFlags` inte tom.
- Negativ/zero duration efter patch eller överlapp.
- `work` utan target → kräver `>= 0.85` + starka evidence-flaggor.
- Home/private-konflikt blockerar `work` & `transport`.
- Datum-mismatch (target inte på datumet).

### 6. UI (passiv — inga knappar)

**Admin (`/staff-management/time-reports`)**
- Realtime-subscription på `staff_day_report_cache` → React Query invalidering.
- Block-rader: chip `AI-klassad` (tooltip med confidence% + ny klassning) eller `AI osäker`.
- `BlockDetailDialog` / Decision Trace: sektion "AI-granskning" (original kind, AI kind, confidence-bar, evidence_used, concerns, audit-id).
- Inga knappar för att godkänna åt användaren.

**Mobil (granska-vyn — inför staff-attest)**
- Samma chips på blocken.
- Tydlig informationsrad högst upp om AI auto-applicerade något: "AI har städat upp X block åt dig — granska innan du godkänner."
- Användarens befintliga "Godkänn dag"-knapp är oförändrad (det är fortfarande staff som attesterar).

### 7. Verifiering
- Cache-uppdatering → AI körs en gång → audit + cache uppdaterad → realtime invaliderar UI → chip syns i admin OCH mobilens granska-vy.
- Approved dag → trigger gör inget.
- Block utan target → `uncertain`, ligger kvar.
- Idempotens: andra körningen med samma `ai_review_signature` skippar utan AI-anrop.
- Användarflöde: staff öppnar granska-vyn, ser AI-resultat, godkänner själv. Admin gör inte attesten.

## Ej i detta steg
- Mobil-UI utöver chip + info-rad i granska-vyn (ingen ny "AI re-run"-knapp).
- Re-applicering / rollback-UI för auditerade beslut.
- AI-godkännande av hela tidrapporten.
- Cron-baserad batch-körning (DB-trigger räcker).

## Slutleverans
Rapport "AI auto review – rapport" enligt spec §11 efter implementation, inkl. bekräftelse att AI inte attesterar och att staff fortfarande är den som godkänner sin dag.
