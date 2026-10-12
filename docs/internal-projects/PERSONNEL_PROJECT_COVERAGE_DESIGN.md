# Personnel project coverage — conservative contract proposal

Design only; no product code, source approval, financial event or hosted read.
Read alongside Finance FINANCE_ACCEPTED_APPLICATION_DESIGN.md (genuine Finance
PR56 9442108d98678a0d403e30049c37de5aa4f3a716). Exact inspected Operations/Time
file hashes are in PERSONNEL_PROJECT_COVERAGE_SOURCE_MANIFEST.json. Operations files are pinned to the local
author commit recorded there; this document does not claim that commit deployed.

## Actual evidence and its limits

| Source | What it establishes | What it does not establish |
|---|---|---|
| Operations workerProjection.ts | staff_assignments staff/team/date joined to calendar_events by team/date, then project/Booking identity; standalone internal_project via project-UUID calendar references, no fake Booking | Historical complete project worker/day roster; internal_activity coverage; deleted/unplanned assignments; work outside its default -14/+60-day window |
| workerAssignmentPush.ts | Affected worker hints from explicit staff IDs and Booking calendar team/date; complete projection for each selected worker | Complete fanout: resolveAffectedWorkerIds slices to 40 workers. Delivery helper success cannot be census proof |
| Time ordered assignment ingress 20261012140353 | Immutable worker epoch/generation receipts, declared date coverage, current import head, explicit ordered replacement | Complete project roster or source-side generation fence. An empty assignment snapshot is not an attested empty workday |
| Time submission.ts and submission-outbox.ts | Worker-confirmed immutable day snapshot; hash/ID binds complete proposal/version; corrections new immutable version; offline queue | Absence of offline drafts/submissions; project-wide expected work; proof missing submission means zero |
| Time scoped read 20261001230015, blob 915b2e4a565da3fdcdf4c270041103366c43d519 | Authenticated scope, exact immutable submitted document; latest worker/day ID/version and decision sequences | Enumeration of unknown worker/day streams or durable project cutoff/watermark |
| Operations ingestion store/calculator | Reads one explicit source binding/known stream; resolves every positive work/travel block target; missing rate remains unknown | Expected worker set independent of receipts. coverage=complete means rate coverage of those lines only |
| Accepted v2 issuer | Full single worker/day snapshot with exact current-project metadata refs and immutable issued revision | All workers/days for a project, source census, absence of additional streams |

The missing unit is an authoritative **obligation/census generation**, not another
cost ledger. Existing project personnel review and payroll decisions have distinct
purposes and must not be combined into a fabricated project completeness flag.

## Minimum authoritative statement

Operations owns a project personnel expectation statement jointly backed by Time
source evidence. Proposed statement keys: schema/purpose=personnel_coverage,
issuer/epoch, source and destination tenant/project IDs, project kind and metadata
revision/fingerprint, statement ID/revision/predecessor, exact work-date interval
with timezone, source fence generation, roster digest, stream-set digest, issued-at
and validity policy. Timestamps are informational, not causal ordering substitutes.

Its roster must originate from owner-controlled assignment/engagement obligations,
including unplanned authorized work and historical removals, independently of
received cost streams. Required input sources and their owners must be explicitly
approved: staff/team/date calendar placement alone is only one candidate source.
Worker departure, project tombstone, assignment deletion or new target mapping must
not erase historical obligations. If the owner cannot prove a complete roster,
the statement is unknown; even an empty roster cannot be called complete.

Each obligation binds immutable worker identity mapping, work date/timezone,
source stream identity, relevant assignment/engagement IDs and revisions, plus a
disposition. Multiple assignments in one worker/day deduplicate to one full stream,
while preserving their obligation references. Mixed project streams remain whole.
Allowed dispositions are proposed, not existing executable APIs:

- required_stream: exact required Time submission ID/version/hash, global/project
  decision sequences, Operations accepted revision and raw-envelope fingerprint,
  issuer epoch and required project metadata refs.
- owner_confirmed_no_work: a separate immutable, authorized source resolution of
  an actual obligation, with reason/revision; not an invented empty submission or
  auto-zero from a missing record. This disposition needs an owner policy/command.
- unresolved: missing assignment history, identity, unsynced day, rate, decision,
  source revision or mapping. It blocks completeness and remains visible.

The statement must include the independently derived roster and all relevant
historical stream membership that can still affect this project. Received receipts
may expose unexpected extra work requiring roster supersession; they cannot define
the expected universe. No manually supplied expected count is authoritative.

## Corrections, withdrawals and causal closure

Exact current stream revisions must be pinned, not merely revision >= required.
A newer known revision invalidates readiness until a superseding statement names
it. New correction block IDs use new canonical bindings; omitted historical IDs
withdraw through existing whole-stream application. Empty authentic latest day
has current project refs=[], yet its previous immutable destinations still belong
to withdrawal coverage. Project membership cannot be reconstructed solely from
the latest line set. Changing review or rate evidence can supersede costs without
changing the Time snapshot; pin both Time and Operations revisions.

The expected roster and relevant Time heads must be sealed behind an actual owner
fence or checkpoint protocol. Needed capabilities, currently not proved: durable
source-side roster generation covering all assignment writers, Time worker/day
head/decision generation, known pending deliveries and an explicit treatment of
offline submissions. Planning generation receipts are not a global Time watermark.
Database now(), max received timestamp, max local revision or an empty outbox are
not substitutes. A submission can still be offline on a disconnected device.

Two honest policies are possible and require owner agreement:

1. As-of coverage: source certifies a fixed obligation/stream generation at a
   declared business cutoff. Late work/corrections supersede it and require current
   period adjustment. UI clearly shows bounded as-of completeness, never absolute
   absence of all future/backdated work.
2. Strict close: a source close-intent/fence handshake durably prevents changes to
   the sealed domain until Finance accepts or aborts, with crash/timeout/release
   semantics. Offline late work is quarantined for later adjustment, not dropped.
   This is not provided by the existing asynchronous transport.

Do not implement strict close by holding an unbounded database transaction across
services or trusting a signed token to provide instantaneous revocation.

## Finance verification without new money totals

Finance verifies source authority, exact statement predecessor and immutable
roster/stream references, current identity/metadata and every required receipt.
It separately verifies explicit actor-applied command checkpoints and canonical
binding/line ownership for all current and omitted destinations. A signed receipt
ACK with financially_applied=false never satisfies application coverage.

Computed personnel state should distinguish unknown census, missing source,
missing receipt/dependency, stale statement, missing rate/review, unapplied command,
and personnel_complete_as_of. Display partial known money separately from unknown
coverage; don't turn unknown lines into zero. Trusted money still reads the single
canonical Finance projection; receipt sums are not added again.

Personnel readiness is one domain only. WMS/equipment, materials, suppliers,
catering and other applicable domains require their own owner-issued proof or
authoritative not-applicable policy. Personnel evidence must not remove current
internal project total/close guards by itself. Customer invoice/budget/status
rules remain outside this contract.

## Irreducible implementation gates and tests

First obtain reviewed roster authority/history including internal_activity and
unplanned/manual work; source generation/fence/late-work policy; Time authoritative
no-work resolution; transport and supersession semantics; exact role/actor policy.
Until then implementable output is unknown/gap reporting only, not completeness.

Future actual-code acceptance must cover two workers with one missing, unplanned
third worker, >40-worker source fanout, historical dates outside projection window,
assignment removal and worker deactivation, no-report vs genuine empty withdrawal,
rejected/missing-rate lines, mixed customer/internal day, changed project/rate review,
out-of-order roster/receipt delivery, unexpected stream, new correction between
preview and apply/close, source fence failure, offline late arrival, tombstone and
cross-tenant attempts. Every negative must preserve canonical money and customer
invoice state. Personnel-complete plus absent equipment proof must still block
whole-project close. No such new runtime tests are claimed by this design review.
