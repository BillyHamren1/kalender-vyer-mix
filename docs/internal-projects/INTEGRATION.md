# Internal projects integration checkpoint

Coordinator session 2026-10-12. User authorized per-module long-session implementation, hourly continuation and authenticated end-to-end tests.

## Local reviewed integration

Branch `codex/internal-projects-integration-20261012`, upstream baseline `db15a2b1a305759800847322536c4d8fed836cb6`.

- Warehouse implementation `9f3b3fe3f` integrated as `e8304696a`; checkpoint additions `f7b90a02d`, `5d364234d`.
- Operations `3a0d0de4f` integrated as `61b2bb688`; numeric/tenant/Time producer hardening `cbbdce0b4` integrated as `c86619fc6`.
- Independent rendered follow-up behavior tests committed as `287cab55c`.
- Combined exact Vitest 4.1.11: 35 tests across seven files passed; separate assigned internal project producer five tests passed. This is 40 focused tests on the combined source, not hosted acceptance.
- Combined production build passed in 36.85 seconds. Existing bundle-size warnings remain.
- Initial Warehouse baseline comparison found seven TypeScript diagnostics byte-for-byte identical to baseline. After Operations mutation callback wrappers were integrated, full combined TypeScript passed with an 8 GB heap.

## Independent findings addressed

Read failures and invalid numerical cost evidence cannot appear as complete zero. Internal project cost currency must match known source basis. Database guards reject internal billing, invalid completion, and invisible/foreign-organization medium project references. Independent embedded PostgreSQL tests reported ten passing cases after reproducing and fixing a cross-tenant billing reference. These are synthetic schema/RLS fixtures, not hosted tests or simultaneous-session PostgreSQL proof.

## Separate module work

Time upstream `BillyHamren1/eventflow-time` `6a945ae36bcb9263d877550e4f7eae9e49dbca1d`: local source snapshot has synthetic git ancestry. Apply changed-file patch to a real upstream branch, never push snapshot history. Time removes guessed first assignment when multiple assignments exist; regular unallocated time remains possible. Original 215 tests, typecheck and build passed; actual producer fixture import checks being added.

Finance additive classification/read semantics and dormant canonical-cost event planner under development. Existing broad Finance PR55 is shadow-only receiver. Do not promote shadow receipts or mutable main source rows to official costs.

Booking/Catering compatibility audit says preserve no-booking internal project identity and existing boundaries; nine synthetic tests passed. Cross-module composition against pinned PR26 calculation + Time snapshot + dormant Finance adapter is synthetic only, not current production pipeline.

## Open gates

1. Safe transactional Operations revision/outbox: current main rebuild deletes/reinserts, can fall back to mutable day cache, and resolves current rates. It cannot certify immutable historical costs without an atomic accepted-source publication seam.
2. Finance atomic accepted receipt application and official projection, correction and missing-rate handling.
3. Versioned booking-free work reference across WMS reservation and Scanner outbound/return command receipts; do not substitute a project UUID into booking_id.
4. Full combined types/CI, actual concurrent PostgreSQL guards, deployed version and migration/rollback evidence.
5. Real authenticated public UI full chain. Verifier found no saved browser session and requested secure sign-in. No authenticated acceptance claimed.
6. Git source publication blocked by automatic approval review: warehouse git push rejected for unverified destination / lack of explicit publication authorization. No alternative connector bypass. Prepare concrete reviewed patches before requesting final user approval. No merge, migration, deployment or real financial action performed.

## Continuation

Control plan and six saved hourly automation IDs are in the existing `codex/internal-projects-control-20261012` PROGRAM.md. Each module must check owner/lease before writing. Parent owns integration; module workers own their isolated branches. Keep blocked publication separate from available local implementation/test work.

## Supervisor pass 2026-10-12 15:06 Europe/Stockholm

- All six agents restarted/continued on concrete open work. Verifier was blocked in secure sign-in for roughly 25 minutes; interrupted and restarted. No authenticated session was confirmed and no replacement dialog was started. Verifier now independently reviews Time.
- Integrated runtime corrected-time evidence/audit tests as `54253192a`; 13 focused tests passed in combined tree. Integrated classification downgrade/nonfinite-budget guards as `d6a543023`; 14 synthetic PostgreSQL assertions passed in combined tree.
- Integrated dormant equipment identity contract through `0bfaab821`: opaque Booking/Scanner IDs preserved; no endpoint or stock write enabled.
- Root reproduced workOrderSync two failures on both untouched baseline `db15a2b1a` and integrated tree: expected kind vs phase, and existing phase_invalid gaps. Six other baseline tests pass; five internal-project producer tests pass. Thus these two failures predate this patch; do not report the whole suite green.
- Time feature patch/manifest reports 381 tests in 33 files, types/build, 14 actual embedded import-RPC assertions; independent review underway. Latest-head consumption now excludes superseded worker assignments while preserving legacy imports. Monotonic source delivery remains an open ordering gate.
- Finance reports 1,254 tests in 144 files, types/build, changed-file lint, 11 synthetic SQL assertions. Dashboard internal-budget vs commercial-TB separation under further development; these counts precede that new work.
- Newly reproduced Lager boundary failure: generic completion can emit external commercial close via Booking sync despite DB billing guard. Warehouse owns service/proxy fix and irrelevant booking-free warehouse-inbox trigger correction; Booking/Catering reviews independently.
- Operations owns atomic/idempotent creation so task-insert failure cannot cause duplicate internal projects on retry.
- Source-only candidate publication protocol independently passed ten attacks after frozen-source binding correction, but remains outside runtime/migrations and unintegrated here. It does not establish accepted historical rates or official financial publication.

## Commercial warehouse boundary integrated

Warehouse `2ffc85259` integrated as `5345901dc`. Authenticated proxy validates `profiles.user_id`, actor organization, booking classification and linked project classification before external close/reopen. Client service independently rejects internal booking transitions, internal project completion avoids commercial sync/analytics, and internal creation skips warehouse inbox. Root rerun: 23 tests across four added suites passed; 10 synthetic trigger assertions passed, first reproducing the old unwanted-inbox behavior. Independent reviewer additionally passed mixed resync/reopen regression. Deployment requires classification migration before updated proxy; retain additive schema during frontend/proxy rollback. No hosted mutation or publication occurred.

## Combined gate 2026-10-12 15:25 Europe/Stockholm

Runtime source head `ba9d49060` includes atomic creation, durable actor/organization-scoped request recovery, calendar warning parity, empty cost coverage unknown, and commercial warehouse protections. Rendered unknown-vs-explicit-zero regression commit `655a496c4` precedes it.

- Root combined exact Vitest4.1.11: **113 tests / 16 files passed**. Includes actual rendered follow-up, recoverable creation service, Time producer, warehouse identity/presence, equipment contract and actual proxy handler with mocked external transport.
- Root full TypeScript app check with 8GB heap: **exit0**.
- Root production build: **passed34.09seconds**, existing chunk-size warnings.
- Root atomic-create actual migration harness: creation/retry/rollback/tenant/restricted/anonymous assertions passed in synthetic embedded PostgreSQL. Separate classification14 and warehouse-inbox10 assertions passed earlier on unchanged migrations.
- Independent Time review by Warehouse: **160 tests /12files +14 embedded actual import-RPC assertions passed**, patch+14manifest hashes verified. Author's381suite/type/build evidence remains distinct. Monotonic delivery ordering gap is still open.
- Finance author:144files/1257tests, types/build/changed lint passed before dormant receiver addition. Receiver reuses exact canonical writer; author16SQL scenarios and reviewer5additional scenarios passed. Dormant code has no runtime grants/callers; accepted receipt source and trusted coverage close/read gating remain open. Legacy pure TS plan explicitly deprecated/executionReady:false.
- Verifier runtime repeatedly locked even on pwd; stopped after three supervision restarts. No authenticated session was established. Actual Time review was successfully reassigned to Warehouse, not falsely attributed to failed verifier.

### Reviewable source publication targets (authorization still pending)

1. `BillyHamren1/kalender-vyer-mix`: real integration branch `codex/internal-projects-integration-20261012`, base `db15a2b1a305759800847322536c4d8fed836cb6`.
2. `BillyHamren1/eventflow-time`: feature-only14-file patch, base `6a945ae36bcb9263d877550e4f7eae9e49dbca1d`; local synthetic ancestry must not be pushed.
3. `BillyHamren1/eventflow-finance`: feature-only patch SHA256 `11a016b1757ea0321c88efd9625cee616365a7df7142ea999e6f012458408a00`, base `858995ff7885df1c957118ad25a9a93d656f596f`; local synthetic ancestry must not be pushed.

These are draft review candidates, not finished deployments. The automatic Git publication rejection remains in force until explicit user authorization. Real authenticated acceptance, hosted RLS and simultaneous PostgreSQL transactions, accepted historical-rate lineage and Finance publication, and booking-free equipment outbound/return remain open. Operations continues bounded immutable-source capture work separately; it is not evidence of accepted monetary rates.

## Continuation 2026-10-12 15:57 Europe/Stockholm

Fresh upstream reconciliation: Operations main advanced ten commits to `8c0ce0b482832127483c8008f1e40820181fc760` (Brain/Time messaging). Fetched real Git history and merged locally as `373cdf2a653a72de88bfa672d6e8f30f9293122c`; no conflicts in product code. Finance main remains `858995ff7885df1c957118ad25a9a93d656f596f`, Time main remains `6a945ae36bcb9263d877550e4f7eae9e49dbca1d`, verified via fresh compare reads. These checks do not imply publication or deployment of this branch.

- Operations wizard recovery `0ec8d3d94865827687cc613e7cc691df664f4920` integrated as `95936be80`. Real pending-request retry now skips obsolete draft browser validation while server tenant/actor/payload validation remains mandatory. Root and independent reviewer both passed nine renderer/service tests.
- Operations dirty follow-up close fix `1691fad762e3aaaeeb7e2d545830d2e5ab000313` integrated as `a594f505d`. Three failing renderer scenarios were reproduced before correction: unsaved remaining work, failed save, and edits during save. Close now requires saved visible follow-up; inputs/actions cannot compete while saving/closing. The database remains authoritative for saved remaining work and tasks. Independent review accepted this bounded fix; it is not a claim of optimistic concurrency or atomic save-plus-close.
- Exact combined source `a594f505d`: root follow-up suites **22 tests/3 files PASS**, wizard/service **9/2 PASS**, updated main messaging **19 PASS**, full application TypeScript with8GB heap **PASS**, production build **PASS34.65s** (existing chunk warnings). Earlier113-test evidence remains historical; it was not rerun wholesale or relabelled as this head.
- Warehouse canonical handoff corrected in local `4541fedc4`, `warehouse/docs/internal-projects/WAREHOUSE.md`. Scanner owner conformance remains explicitly false. Booking-free reservation/source authorization and outbound/return are absent owner capabilities. WMS/Scanner owner checkouts are not present locally; do not invent a replacement or claim parser tests implement the chain. Warehouse continuation paused with these gates open.
- Separate Operations source prototype remains on its module branch, outside active migrations/runtime. Independent six-case review is recorded there; its immutable source hash is not accepted historical-rate proof. PR48 is still draft, exact `5f0c934ab99795f1185cfa165f1f21131d81cd61`, non-mergeable at fresh read. Operations continuation paused after the local fix because canonical accepted-source publication, authorized release, hosted concurrent checks and authenticated acceptance remain external gates.

Root acquired an atomic expiring integration lease for this local reconciliation and released it after the recorded checks. Automatic source-publication rejection remains unresolved; no source push, connector publication, deployment, migration, invoice or production test write occurred. In-app authenticated acceptance is still NOT EXECUTED.

### Finance source-coverage guard completed locally

Finance product commit `fec4a895756eb5af03cd099ca9425ebd4ab36f0b`, checkpoint `cda864d8da0894fe51ad1db9e016474b59cb3821`. Feature-only patch `/tmp/finance-internal-projects.patch`, SHA256 `a1ed653c8fd50f5610a61d91820a2d3e60eebf0a59405c23b6fd0dd9d193ecb6`, supersedes the earlier hash above. Apply only the diff against verified real upstream858995ff; never publish synthetic ancestry.

Independent review reproduced internal financial close with cost0 and no Operations receipt. Additive migration now denies new internal final snapshots and closed-status transitions, adds structured close-preview blocker, withholds source-unverified costs/variance/trusted totals in dashboard and every generic detail/portfolio/close helper. Registered currency-valid budget remains visible separately. Existing immutable finals are preserved, and customer/null behavior remains unchanged. This is a safety boundary until actual accepted source coverage exists, not completion of the financial publication chain.

Author final evidence: **144files/1259tests PASS**, TypeScript/build/changed-file lint PASS. Root independently reran exact close/rollback harness and final dashboard9checks; another reviewer independently accepted guard/customer/legacy/rollback behavior. Fixtures are embedded synthetic PostgreSQL, not signed-in or simultaneous hosted proof. Finance continuation paused with accepted historical-rate/project-coverage port, metadata/frozen-budget provenance, native concurrency, authenticated integration and authorized publication/release still open. All three invoked module continuations are paused for concrete external gates; unrelated saved tasks were left unchanged. No program completion is claimed.

## Time ordered-ingress and assignment revocation handoff

Time local synthetic head `f3a91f7dc4f0f6fcfd604761b94f785bc483a71d` now contains a dormant ordered Planning receiver and a current-assignment authorization boundary for job communication. Product commits are `20585167e743e172193ef1994e8fc0c63ef960a3` and `7e093deb48a9dd518b3c0f6782c0b2a846a31856`. Never publish this synthetic ancestry; integrate only the verified feature patch onto genuine `BillyHamren1/eventflow-time` upstream `6a945ae36bcb9263d877550e4f7eae9e49dbca1d`.

The receiver serializes enrollment/v1/v2 for each organization and worker, rejects unordered v1 after controlled enrollment, accepts only increasing generations, records the accepted import, receipt and pending notification intent in one transaction, and makes stale generations no-ops. The client, day proposal and Day Agent select the exact current worker head. A service-only resolver now requires assignment ID, organization, worker and current import before job messages or media can use a retained assignment ID; resolver failure returns 503. Migration must precede Edge deployment.

Independent evidence: **55 embedded SQL/RPC assertions**, **71 affected Vitest tests in eight files**, TypeScript and production build passed. Independent review specifically accepted generation replay/conflict/stale/restoration, owner-only enrollment, service-role execution, identity-remap rollback, stale/wrong-worker/wrong-tenant communication denial and legacy null-projection compatibility. The incomplete materialized snapshot produced 1,734 passes, seven date-sensitive Catering failures and eight suites missing baseline files; it is not recorded as a whole-suite-green result.

Feature patch `/workspace/scratch/3f646f03b350/time-internal-projects.patch` SHA256 `77d4b5866bdc57ddf862f4115407113119ef4f8e03278f6698a7b65ab75dd9a4`; manifest `/workspace/scratch/3f646f03b350/time-internal-projects-manifest.json` SHA256 `d92ce40ed280898e0050baa0a0cc3c0da4665d86f7c2a1d2f514b7d1b5d1dc22`. Root rechecked the manifest patch hash, all 19 final file hashes and that all nine existing upstream blobs are modification hunks. The patch was independently apply-checked against a baseline materialization restored from the exact upstream blobs.

Activation remains open on the Operations-owned causal generation and immutable source snapshot, one signed canonical envelope/digest, v2 adapter wiring, durable outbox dispatcher/claim, real PostgreSQL multi-session and injected-fault evidence, controlled enrollment, authorized publication/migration and logged-in end-to-end acceptance. The receiver is unwired and no migration, deployment or production write occurred.

## Booking and Catering boundary handoff

Booking current `main` was freshly verified at `26d29842623dea970ef413da077d1f66c7ae1af5`. No canonical internal-project branch or PR exists; the only open Booking PRs are unrelated drafts 233 and 234. Booking billing remains structurally attached to a real Booking row: `project_billing.booking_id` is a required foreign key, the invoice queue resolves confirmed bookings, and `planning-api.close_project` returns 404 when that Booking row is absent. Booking's local `projects`/`booking_projects` domain is not the Operations project identity. No Booking source change or artificial booking was created. A producer change remains necessary only after the shared Operations identity contract is stable: authenticated Catering payloads must carry canonical `project_kind` and must exclude both internal kinds.

Catering current `main` was freshly verified at `b1cc307850e66a05a9197553e3d4eabd64a2d7a5`. The existing draft PR26 is unchanged at head `a19ba24ed18f5f0ffba4198bcdbdf0a22b3bb3b8`, old base `0b1b0b986c25bc394b28b2220d2a32a09dbd99ec`, 472 changed files and `mergeable=false`; it was reviewed but not reused for this bounded boundary fix.

Root reproduced a defense-in-depth failure on current Catering source: a payload with a fabricated valid `booking_id` and explicit `project_kind: internal_project` passed the parser and invoked the booking-projection RPC. The original migration also granted `service_role` direct table `INSERT` and `UPDATE`, which could bypass an RPC-only guard. The reviewed local candidate now rejects explicit `internal_project` and `internal_activity` before RPC and inside the database function, fails closed for malformed explicit kinds, and temporarily preserves missing-kind legacy customer payloads plus explicit `customer`. The additive migration removes generic direct table writes from `service_role`, retains `SELECT` and only `UPDATE(acknowledged_source_updated_at)` for the sole legitimate current-main acknowledgement path, and keeps the `SECURITY DEFINER` RPC service-role-only.

The Catering checkout `/workspace/scratch/3f646f03b350/catering` has synthetic ancestry and must never be pushed. Exact upstream blobs were materialized in synthetic baseline `d874ed8163e9b2fee3ac7c28edc0e7eca5614c34`; product/test commit `5e98f469649ff5f40b8de8909ff1f7f72045ec76`, checkpoint `5f49999ab2b3d565edc7be41b087bdb7c441a917`. Feature patch `/workspace/scratch/3f646f03b350/catering-internal-projects.patch` SHA-256 `8da42997b2a890d134a17ffee576b6b5a83ed0defd03086a800383aa1e8b8b01`; manifest SHA-256 `5c808a46a6f4e4aa4aada101bf01f664d65cd2c9241edd486d915193ad198c2a`. Root and independent reviewer passed **9 parser/RPC tests** and **11 embedded PostgreSQL role/function tests**. The patch applies to the exact materialized upstream blobs; all four result hashes match the manifest. Independent normalized comparison found no unintended function-body drift after removing the intended classification guard.

This is local synthetic evidence, not publication or runtime acceptance. Missing `project_kind` remains a deliberate compatibility window, so a malicious or erroneous producer that omits classification while fabricating a Booking identity cannot yet be detected by Catering alone. Remaining gates are genuine-upstream patch application and full Catering CI, Booking producer classification/filtering, authorized source publication, hosted migration/role/rollback checks and logged-in end-to-end acceptance. No push, PR write, migration, deployment, invoice or live mutation occurred.

## Completion continuation 2026-10-12 after user's 17:06 request

Local sources and prior patch hashes remain intact. Fresh normal Git fetch of public Operations main found `ef794699f529520f3e96370174822aa2ce0b363c`; integrated as `e4cad447c1f54f09f4a2fa382671e0731401ccd3`. The upstream change fixes the returned warehouse article instance identity. Root ran its nine contract tests and the full application TypeScript check successfully on the combined tree.

Four assigned agents investigated cost/metadata completion, WMS ownership, genuine upstream staging and native PostgreSQL verification. Current GitHub connector identity is BillyHamren1, with admin/push permission on the verified Operations repository. This does not itself remove the prior automatic source-publication rejection; no push or connector source write was attempted.

Operations metadata producer `caf3193b2f916d520341f0cf8eb3b6a32f60d0f9` integrated as `97cc17d0b`. The additive source trigger writes immutable project classification/budget revisions and deletion tombstones atomically with source changes; identical replay is deduplicated, tenant/identity reassignment rejected, and receipt failure rolls source changes back. Root reran all 12 scenarios on the combined tree successfully. Independent review added three passing fingerprint/legacy-declaration/revision-overflow scenarios; the author also passed the 14 classification assertions and atomic-create regression fixture. SQL SHA-256 is `31dede4f10e4f35d693db3cfeef37c89b7255a4b5492fd07c862b11cf74fcd79`. Contract is `docs/internal-projects/PROJECT_METADATA_CONTRACT.md`. No cost calculation or Finance fact is introduced. This closes the prospective metadata producer implementation only: no existing-row backfill, dispatcher, Finance enrollment or accepted cost coverage is supplied. PostgreSQL jsonb fingerprint is not a cross-runtime signed transport digest. Publication, historical rate acceptance, signed delivery, genuine concurrency and authenticated acceptance remain open.

Normal Git reads for private Time, Finance, Catering and WMS failed because no Git username/authentication was available with terminal prompts disabled. No credentials were extracted and no new synthetic history was substituted. Therefore those genuine-upstream application and full-repository CI gates remain open. Existing Time, Finance and Catering feature patch hashes still match their recorded handoffs.

Native PostgreSQL verification is also concretely blocked: no postgres/initdb/pg_ctl/psql/Docker or cached PostgreSQL installation was available; normal apt-get update failed with exit 100 because setgroups/setegid/seteuid were not permitted. No OS permission workaround was attempted. Actual two-connection creation/import ordering, deadlock/retry and injected-fault evidence is still required; PGlite cannot replace it.

Fresh WMS owner review pins main `4f97b6de4afdfa30b679e7e44a49c1ef8e729d6d` and lifecycle PR7 `f8d28f05f5653253cebba7f72c52973ef5496fcb`. Scanner main advanced to `85ce28fcbd458427865276fb67417401f8356164`, while its conformance guard blob `12a2cf728a43ce4ebdb3c7620b2c4124f73885be` remains unchanged and false. No booking-free owner branch/PR exists. The concrete implementation path is to extend the existing WMS reservation transaction with tenant-bound Operations work-reference, source authorization, generation, digest and idempotent receipt in the same transaction. Preserve null Booking identity; extend PR7 checkout/return receipts instead of writing project IDs into booking-number fields. PR6 is an older competing lifecycle proposal and PR47 is a non-mutating order shadow, neither is a substitute stock writer. No new WMS implementation was invented without a genuine checkout.
