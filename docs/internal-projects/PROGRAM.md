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

## Published draft checkpoint — 2026-10-12

The user's explicit **Ja** authorized these reviewed draft PR publications. Earlier source-publication restrictions are superseded for this scope only; no merge, deploy or hosted migration has occurred.

| Track | Draft PR | Exact head | Evidence |
| --- | --- | --- | --- |
| Operations + Warehouse | https://github.com/BillyHamren1/kalender-vyer-mix/pull/55 | 7663a8911c4a38ca372aec03a08d8ab2f1722bb9 | Tree 31264d90d7b130dc414c8678ec30189fdd1a221c equals reviewed local dd230900d; no matching PR workflow run found. Existing economy PR48 untouched. |
| Time | https://github.com/BillyHamren1/eventflow-time/pull/40 | 78f6a10f73ec70d3e9e36d34386ce658da3fb564 | Genuine upstream ancestry; 19 files. Own prefer-const CI error fixed. Run38271765793 database/native PASS; verify FAIL on unchanged ArticleLocationDialog.tsx missing react-hooks rule; browser pending. |
| Finance | https://github.com/BillyHamren1/eventflow-finance/pull/56 | ef9c14e068f4af7582bd752051bad3eab0643ccd | 27 files; 26 reviewed product/test blobs verified. 1259 tests PASS; invoice runtime runs38271561758/759 PASS. Main CI38271562114 lint FAIL; build skipped. Browser38271561816:11 PASS/9 FAIL. Existing economy PR55 untouched. |
| Catering | https://github.com/BillyHamren1/eventflow-catering/pull/30 | 4c2353c8299fceb419aa8f1a9feb69ab2c550812 | All5 reviewed files verified; CI38271411742 PASS. Existing PR26 untouched. |

Only genuine upstream parents were published: Operations ef794699f529520f3e96370174822aa2ce0b363c; Time 6a945ae36bcb9263d877550e4f7eae9e49dbca1d; Finance 858995ff7885df1c957118ad25a9a93d656f596f; Catering b1cc307850e66a05a9197553e3d4eabd64a2d7a5. Synthetic local histories were not published. EOF-only old-baseline differences were proven against real upstream bytes before publication.

Time database job114887481617 completed local Supabase migration replay including20261012140353,741 pgTAP assertions across27 files, schema lint and16 local Auth/Edge gates. This is actual CI database/Auth evidence, not hosted signed-in UI acceptance or simultaneous-session concurrency proof. Current verify job114887481511 confirms introduced prefer-const is gone; remaining lint error is upstream-identical.

Finance lint diagnostics refer to23 files whose blobs match upstream, none in feature diff;16 changed TS/TSX files pass targeted ESLint. All9 browser failures traced to unchanged fixtures/routes:2 obsolete tab counts,2 read-only authority POSTs misclassified as writes,2 mocks aborting authority POST,1 empty authority mock,1 fixed September versus current October expectation,1 nonterminating pagination mock. The last cause was reproduced through actual collectFinancePages:100 calls then safety-limit error. No test oracle or safety guard weakened. These remain failed CI gates, not accepted browser tests.

Module continuations remain paused; supervisor continues concrete exact-head CI/integration review. Do not restart empty module loops or duplicate owners. Next review: terminal Time browser result, PR reviews/new heads and safe CI remediation. Root checkpoint: integration/docs/internal-projects/INTEGRATION.md. Local sources remain resumable. Check lease/current head before writes.

Open acceptance: authoritative historical Operations cost source, official Finance receipt/transport/enrollment and budget reconciliation, booking-free WMS/Scanner owner chain, true concurrency/fault tests, hosted migration/rollback and real authenticated deployed UI. Existing secure-login dialog was interrupted after blocking; do not automatically repeat it. No customer sends, invoices, payments, approvals, destructive tests, merge or deployment performed. Overall program is **not complete**.
