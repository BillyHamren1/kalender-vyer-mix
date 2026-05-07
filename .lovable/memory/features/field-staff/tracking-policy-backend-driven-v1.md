---
name: Tracking Policy Backend-Driven
description: Server-authoritative GPS tracking policy in get-staff-day-status with short-lived boosts (max 5 min) — app must follow, never invent
type: feature
---

## Authority
`get-staff-day-status` returns `trackingPolicy` med `{ mode, heartbeatMs, distanceFilter, expiresAt?, reason?, targetId?, targetType? }` byggd av `supabase/functions/_shared/trackingPolicy.ts` (`buildTrackingPolicy`). Mobilen får ENDAST följa svaret — den får inte själv bestämma boost eller AI-baserad tracking.

## Modes
- `battery_saver` — default off-site (15 min heartbeat, 500 m filter)
- `normal` — workday open, ingen aktiv timer (5 min, 200 m)
- `approaching_target` — kort boost (60 s, 60 m)
- `near_target` — kort boost (20 s, 20 m)
- `clarification_boost` — AI/regelmotor begär kort tät vy (15 s, 10 m)
- `active_work` — aktiv timer (60 s, 50 m)

Active timer slår alltid alla boosts (`active_work`).

## Boost-tabell `tracking_policy_boosts`
- mode (clarification_boost|near_target|approaching_target), reason, target_id/type, requested_by (rule_engine|ai|admin|system), expires_at, consumed
- DB-trigger `clamp_tracking_boost_expiry` klampar `expires_at` till MAX 5 min — ingen permanent 10 m-tracking möjlig
- Edge function `request-tracking-boost` POST `{ staffId, mode, reason, requestedBy, durationSeconds? (60–300) }` skapar boost och loggar i `staff_day_decision_log` (action=`tracking_policy_boost`)

## Suppression
`get-staff-day-status` accepterar valfria klienthints i body: `batteryPct` (0–1) och `dismissedCooldownActive`. Båda blockerar boosts (men inte `active_work`); reason sätts till `low_battery` / `dismissed_cooldown_active` så appen kan visa varför den inte boostas.

## Klient
- `StaffDayTrackingPolicy` i `src/hooks/useStaffDaySnapshot.ts` matchar serverns shape.
- `TodayTab` visar debug-chip: `GPS: <mode> · <heartbeat>s · <filter>m · t/m HH:MM · <reason>`.
- Adaptive location mode i appen ska spegla `mode` direkt; inga lokala AI-regler.
