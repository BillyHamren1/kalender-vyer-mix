---
name: Staff Day Audit & Rebuild
description: Append-only audit log (staff_day_decision_log) + rebuild-staff-day edge function for all decisions affecting a staff day or time report
type: feature
---

## Tabeller
- `staff_day_decision_log` — append-only audit. Kolumner: organization_id, staff_id, day_date, segment_id, actor, action, before, after, reason, confidence, source_function, created_at. Actor enum: `rule_engine | ai | user | admin | watchdog | system`. RLS: planning-roller läser org, personal läser sina egna, endast service_role skriver. Inga UPDATE/DELETE-policies → append-only.
- `staff_day_rebuild_queue` — idempotent kö för rebuild-anrop. Status: pending/processing/done/failed.

## Helpers (`supabase/functions/_shared/day-decision-audit.ts`)
- `logDayDecision(supabase, input)` — best-effort audit-insert, kastar aldrig.
- `enqueueDayRebuild(supabase, input)` — köar rebuild från valfri trigger.
- `isDayLocked(supabase, {staffId,dayDate})` — kollar `day_attestations` för attested/approved/locked/exported.

## Edge function: `rebuild-staff-day`
POST `{ staffId, date, reason, actor?, segmentId?, details? }` där reason ∈ {late_ping, geofence_changed, admin_edit, user_attestation, ai_analysis, rules_changed, manual}.

Flöde:
1. Resolve org från staff_members.
2. `isDayLocked` → låst dag = skippa snapshot-recompute, logga `rebuild_skipped_locked`.
3. Annars anropa `day-timeline-engine` (compute) internt med service-role.
4. Skriv audit-rad (`rebuild_executed` eller `rebuild_skipped_locked`) med snapshot-resultat/fel.

## Regler
- **Låsta/godkända dagar ändras aldrig automatiskt** — rebuild loggar och returnerar `locked:true`.
- **Admin-overrides respekteras** — rebuild rör aldrig time_reports/location_time_entries direkt; den triggar bara snapshot-omräkning.
- **Audit bevaras alltid** — append-only via RLS, ingen UPDATE/DELETE-policy.

## Var loggas vad
- Regelbeslut (geofencing, watchdog, planning) → actor=`rule_engine`/`watchdog`.
- AI-analys (analyze-unclear-segment) → actor=`ai`, confidence från modellen.
- Användarattest / klassning → actor=`user`.
- Admin-ändring i tidrapport → actor=`admin`.
- Auto workday-start/correction (auto-arrival, watchdog-stäng) → actor=`rule_engine`/`watchdog`.
- trackingPolicy boost (signal-status) → actor=`rule_engine`, action `tracking_policy_boost`.
