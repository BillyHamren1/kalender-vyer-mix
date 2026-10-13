# Readiness: EventFlow mobil Operations (PR56) — läsande kontroll

## Resultat (verifierat 2026-10-13, inget ändrat)

- Projekt: Lovable `d42a96b9`, HEAD `ef794699…` ("Gömd mobiltoken-mockning"). Supabase `pihrhltinhewhoxefjxv`.
- Branch `codex/brain-operations-mobile-read` / commit `4fca53ee…`: **inte åtkomlig**. Commit-objektet finns inte i projektets repo och ingen `codex/*`-gren är synkad hit. Branchfilerna kunde därför inte läsas.
- `supabase/functions/planning-mobile-read` och `planning-mobile-staff`: **saknas** i projektkoden och i `config.toml`.
- Driftsatta funktioner: OPTIONS mot båda ger **404** → inte driftsatta.
- Migration `20261012205117_mobile_staff_command.sql`: **saknas** i repo.
- RPC `planning_mobile_staff_context_v1` / `planning_mobile_staff_command_v1`: **finns inte** i `public` (pg_proc-sökning tom) → migrationen ej applicerad.
- Inga signeringssecrets lästes.

## Förberedd ownerdeploylista (körs först efter att PR56 är mergad/synkad och uttryckligt godkännande)

1. Bekräfta att projektets HEAD innehåller `4fca53ee…` (merge-SHA rapporteras).
2. Läs och granska de tre filerna; bekräfta att staffing-kommandot skriver `staff_assignments` (team/dag) och kör `recompute_booking_staff_for_day_v2` med organisation — inga direkta BSA-skrivningar.
3. Applicera migrationen `20261012205117_mobile_staff_command.sql` oförändrad; verifiera att RPC:erna finns, SECURITY-läge, grants (ingen anon execute).
4. Lägg till `[functions.planning-mobile-read]` / `[functions.planning-mobile-staff]` i config enligt PR:ns värden (om de saknas där).
5. Deploya endast `planning-mobile-read` och `planning-mobile-staff`.
6. Syntetisk verifiering: OPTIONS 204, osignerat/otillåtet anrop nekas (401/403). Ingen riktig data, impersonation eller flagändring.

Befintliga gröna läs/staffing/SQL-tester i PR:n byggs inte om.

## Blockerare
PR56 måste mergas till `main` (eller grenen synkas till Lovable) innan något av ovanstående kan göras härifrån.
