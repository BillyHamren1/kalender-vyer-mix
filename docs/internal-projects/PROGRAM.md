# Internal projects program
User authorized 2026-10-12: implement reviewed internal-project plan per module with long-session workers, recurring continuation, thorough tests including authenticated use. No claim of done without deployed-version and logged-in E2E evidence.

## Scope and authority
Operations owns project identity, budgets, project allocation review and labor cost calculations. Time owns time evidence. Finance consumes Operations costs and owns financial reconciliation. WMS owns reservations/returns. Booking owns commercial orders. No customer communication, payments, financial approvals or destructive real-data tests.
Use drive-long-build-sessions and advance-eventflow-project-economy skills. Read actual repo instructions/current PRs.
Additive contract proposed and accepted: projects.project_kind = customer | internal_project | internal_activity. Legacy is_internal retains Lager meaning; new finite internal projects use is_internal=false. Missing project_kind falls back to internal_activity only when legacy is_internal=true, else customer. No booking does not imply internal. Operations is single owner of shared schema/migrations. Confirm exact type with all consumers before integration.

## Ownership and checkpoints
- Operations: kalender-vyer-mix branch codex/internal-projects-operations-20261012, docs/internal-projects/OPERATIONS.md.
- Warehouse/Scanner compatibility: kalender-vyer-mix branch codex/internal-projects-warehouse, docs/internal-projects/WAREHOUSE.md. Own warehouseProjectService, useInternalLagerCalendarEvents, useWarehouseOpsRange. Canonical legacy warehouse booking uses internal_type='warehouse'.
- Time: verified eventflow-time main 6a945ae36bcb9263d877550e4f7eae9e49dbca1d; worker will publish branch and docs/internal-projects/TIME.md.
- Finance: eventflow-finance main 858995ff; docs/internal-projects/FINANCE.md; coordinate existing draft #55.
- Booking/Catering: booking-vista-prime and eventflow-catering; separate branches; docs/internal-projects checkpoints.
- Independent verifier: authenticated runtime and combined-diff review. No application source ownership.
- Parent control: this branch only docs/internal-projects/PROGRAM.md and program scheduling/integration.
Operations existing PR #48 and Finance #55 own broader project-economy work. Do not overwrite or create competing ledgers.

## Acceptance gates (all open)
1. Multiple internal finite projects and ongoing activities coexist with existing Lager and customer jobs.
2. Create without customer/booking; accountable owner, dates, goal, tasks, hours/cost budget.
3. Real assigned staff see internal project and submit time. Same-place 3+4+1 split totals 8 hours once; GPS only suggests location.
4. Offline/retry/corrections preserve one current source identity/version.
5. Operations computes rates and preliminary/confirmed costs; missing rate visible.
6. Finance shows same identity/version/amount, internal budget variance and organization totals once; no false commercial TB.
7. Supplier invoice preliminary -> approved and estimate replacement do not double count. No real financial approval in tests.
8. Internal close/reopen cannot create billing; historical Lager and customer closure regressions pass.
9. WMS equipment reservation/return uses canonical owner; availability accurate.
10. Period totals complete, no 500-row truncation; weekly project progress and monthly activity reporting.
11. Tenant/role isolation, active PR integration, relevant CI exact heads.
12. Authenticated published UI full chain and runtime/source match. Native physical gates explicitly marked if unavailable.

## Continuation protocol
Each worker uses its canonical branch/checkpoint, checks current heads and active ownership before mutation, acquires expiring per-track lease in its checkpoint using compare-and-swap Git update. Never overwrite an active writer. During active parent session continue useful batches, not sleep between runs. Scheduled run resumes expired/inactive work only; dependency blockers allow read-only independent checks. Only parent coordinates release/migration after combined verification. Pause track when accepted; if every remaining safe action requires external access, report precise blocker and pause rather than empty repeated notifications. Do not revive unrelated automations.

## Saved recurring continuations
Confirmed enabled 2026-10-12, every hour, Europe/Stockholm:
- Operations: 6accd51d42c88191b2bd73cb3c0cc609
- Time: 6accd52009748191b34e56b1505c8c35
- Finance: 6accd52295608191bced6bbe4d9fb7e0
- Warehouse: 6accd524e11081918b387be83bd7585b
- Booking/Catering: 6accd5274f688191b5795440665178f1
- Independent verification/integration: 6accd529cc388191bc7e5470b80bee0c
No unrelated automation changed. All six initial agents running at latest status check.
Verifier owns codex/internal-projects-verification-20261012 docs/internal-projects/VERIFICATION.md.
Booking/Catering audit owns codex/internal-projects-booking-catering-20261012 docs/internal-projects/BOOKING-CATERING.md in Operations repository; separate app branches only when needed.
Authenticated browser initially empty. Verified e-flow.se login wall; secure login handoff in progress, code work continues.
