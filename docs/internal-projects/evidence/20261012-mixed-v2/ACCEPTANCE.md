# Mixed-day actual-code acceptance composition

**PASS locally:** 53 owner regression checks, 3 genuine mixed-source issuance
checks and 6 chain checks; exit0. `ACCEPTANCE_SOURCE_MANIFEST.json` pins50 dependency
files checked before/after execution. See `acceptance.log`. Earlier rejection
baseline remains in `README.md`/`result.log`.

## Verified chain

A fresh disposable2026-10-02 day stream is explicitly enrolled at floor0. Actual
TEXT-capable calculator and actual private issuer produce v2 revisions1/2/3. No
source acceptance marker or delivered predecessor is fabricated.

Initial customer4h/internal3h/activity1h yields3lines and240000minor units.
Customer Booking ID is opaque non-UUID Unicode text. Actual Operations metadata
producer/outbox/claim/TSsender → actual Finance Edge/parser/SQL → signedACK → actual
finish succeeds. Actual accepted-cost claim/TSsender → Finance Edge/SQL → signedACK
→ actual finish also succeeds. Missing required metadata returns503/retry with zero
events. Lost committed response retries the same v2 receipt with no money event.

Only an explicit synthetic authenticated Finance actor command invokes the actual
canonical writer. Exact replay does not add events. Project totals120000/90000/30000
become120000/60000/0 after correction, then0/0/0 after empty full-stream withdrawal.
The customer project row (budget/status/commercial fields included) and all8 genuine
customer invoice tables remain unchanged across metadata, apply, replay and withdrawal.

Invoice DDL is genuine Finance blob457a7fcbb90bd0c940154404f5e2a6f6c237f8f8,
verified by Git blob hash; see `invoice-sources/MANIFEST.json`. Disposable invoice
state is `created`, never issued/sent. No second ledger is introduced.

## Reproduce

From `/workspace/scratch/3f646f03b350/recovery-customer-metadata`:

```sh
NODE_PATH=/tmp/operations-recovery-deps/node_modules node ../recovery-mixed-cost/acceptance-runtime.mjs
```

PGlite0.5.9, pgcrypto and Operations TypeScript are required. Finance defaults to
`../recovery-finance-customer`; TEXT source to`../recovery-text-booking`. Override
with absolute `FINANCE_SOURCE_ROOT`/`TEXT_BOOKING_SOURCE_ROOT`. Operations source
is cwd. Leave native DB environment variables unset. Copy the evidence directory
for independent reruns so generated logs/manifests do not compete.

Runtime files: acceptance-runtime, source-pins, source-oracle-runtime,
owner-fixture-bridge, source-mixed-fixture, mixed-finance-oracle, metadata-oracle,
writer-oracle and invoice-oracle (all.mjs), plus pinned invoice-source SQL.

## Limits

Two isolated PGlite databases, synthetic tenants/enrollments/direct bindings and
in-memory HTTP. Owner schema prerequisites are synthetic; tested functions are
actual candidates. Source callback runs inside an outer test transaction rolled
back afterward. Only retry `next_attempt_at` is advanced; no receipt/delivered
state is forged. Not native concurrency, hosted authentication, activation, real
signed-in UI, production dispatch or full production schema conformance.
Customer identity proves Operations' project/Booking relationship, not independent
Booking-origin signed evidence. No product edits or publication by this verifier.

Do not publish the duplicate Finance invoice SQL into Operations. Persist tests
with a dependency on that exact genuine Finance source/check-out instead.
