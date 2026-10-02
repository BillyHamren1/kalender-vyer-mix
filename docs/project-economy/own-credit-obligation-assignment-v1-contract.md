# Local own-credit source assignment contract

This contract appends authenticated source ownership evidence. It does not enable
credit eligibility, change invoice economics, restore commitments, calculate
remaining costs, or complete whole-project EAC. The local manual obligation
basis stays `local_project_only`; source currentness means saved receiver heads,
not a verified upstream Fortnox version.

The current positive-original prerequisite is the saved v1 binding created by
`bind_operations_invoice_obligation_v1`. A v2-only original cannot silently become
authoritative through this contract. The immutable v2 credit envelope is supplied
by the independently owned source-only receiver migration
`20261002024700_operations_finance_credit_v2_receiver.sql`.

## Authenticated command

Exact twelve keys, schema `operations-obligation-credit-assign.v1`:

| Field | Rule |
| --- | --- |
| schema_version | Exact schema string |
| project_id | Real local Operations project UUID |
| obligation_id | Existing invoice-based local obligation UUID |
| expected_baseline_revision | Positive safe integer |
| credit_snapshot_id | Actual immutable saved v2 snapshot UUID |
| credit_allocation_id | Actual allocation UUID in that saved envelope |
| expected_credit_economic_revision | Positive safe integer |
| expected_credit_economic_fingerprint | Lowercase SHA256 hex |
| expected_original_binding_event_id | Actual immutable positive original binding UUID |
| expected_assignment_revision | Safe integer from zero through MAX_SAFE_INTEGER minus one |
| idempotency_key | Bounded trimmed string, exact retry identity |
| reason | Bounded trimmed explicit administrator explanation |

The caller supplies no actor, organization, source invoice UUID, original anchor,
amount, currency, status, credit eligibility, or replacement/consumption decision.
UUIDs normalize only after strict string validation. Authentication, organization,
current administrator rights and real nondeleted project are database-derived.

## Transaction and source proof

1. Validate the exact command and live administrator/project authorization using
   the established private helpers. Take the organization obligation advisory
   barrier before inspecting mutable obligation state.
2. Select the actual immutable recipient-scoped v2 credit snapshot and allocation,
   and the actual immutable original binding within that same local obligation.
   These records supply the source Finance organization and both invoice UUIDs.
   An unrelated tenant/project snapshot is unavailable; caller input cannot infer
   the original from a fingerprint or destination project.
3. Acquire both canonical invoice barriers in global normalized order through
   `lock_invoice_economic_sources_v1`, before any protocol-head or obligation-head
   row lock. The receiver entry wrappers take that same barrier before first-head
   insertion, including when the other protocol head does not exist.
4. Lock the current obligation head and both invoices' existing v1/v2 protocol
   heads. Re-read `operations_finance_invoice_economic_current_v2` after those
   barriers. Reject conflict/withheld evidence, stale selected credit economics,
   or a newer protocol publication. A saved snapshot is provenance, not proof
   that its economics are still current.
5. Call `read_obligation_original_v1` inside this transaction. Require
   `bound_original`, the requested binding event, current baseline revision, exact
   original economic revision/fingerprint also matching the unified current
   original, and the same local project/obligation/currency/Finance organization.
   Coequal v2 relationship enrichment is usable only when the unified view's
   actual common allocation semantics also agree with that bound positive source.
6. Validate the actual credit envelope and its saved raw SHA/provenance. Require
   a negative, nonrejected allocation from a credit document, a valid own source
   anchor, and its explicit `credited_source_anchor` equal to the actual bound
   original anchor. Copy its saved amount/currency/status; never calculate them
   from commercial rows. Own and original anchors must differ. An anchor already
   bound as a positive original cannot be reinterpreted as a credit assignment.
7. Reserve the own credit anchor permanently for the same local obligation and
   project using existing source ownership. Check assignment CAS, then append an
   immutable actor/reason event plus head atomically. Changed idempotent bodies
   conflict; an exact retry returns the saved receipt only after live authorization.

Receivers never acquire the organization obligation or baseline locks. Existing
v1 binders are not upgraded to claim unified-current authority by this contract.
Direct service writes to protocol heads and private-core execution must remain
revoked by the reviewed entry-barrier migration.

## Saved result and invalidation

Each event captures the exact actual V2 publication revision, relationship fingerprint/coverage, selected own/credited anchors and raw snapshot proof, in addition to the actual baseline event/revision/fingerprint, original
binding event, both source invoice identities/economic revisions/fingerprints,
actual credit snapshot/allocation/raw SHA, both anchors, copied negative amount,
currency, status, authenticated actor, reason and command/CAS revision. Immutable
history is retained when a later source or baseline changes.

A service read returns `assigned` only when that exact baseline, permanent
ownership, original binding and both current economic proofs still agree. A
changed source fingerprint, new baseline, rejection, conflict or missing current
source returns `unresolved`; it never reinterprets a saved assignment. All reads
retain `credit_eligible:false`, `remaining_coverage:'unavailable'`, `eac_minor:null`
and `shadow_only:true`. Assignment alone does not reserve an economic cap or make
negative money eligible for an aggregate. Cumulative original-credit capacity,
explicit source-bound consumption policy, frozen-kernel mapping, canonical-scope
deduplication and complete category/source coverage need separate contracts.

## Verification required before authority use

The implementation must prove real authenticated admin/project access,
no caller monetary fields, CAS/replay/conflict and atomic rollback, permanent
cross-obligation ownership, positive-original and negative-own-credit checks,
changed baseline/current source invalidation, and immutable update/delete/truncate
protection. Real PostgreSQL two-session tests must include first v1/v2 insertion
when a counterpart head is absent, reversed original/credit input order, source
correction and simultaneous assignment/ownership attempts. The existing v1 HTTP
journey must remain green after the entry privilege change. PGlite and source
review cannot replace those native gates.

Implementation files are `project-obligation-credit-assignment.ts` and its test,
migration `20261002035459_operations_obligation_credit_assignment.sql`, and
`operations-own-credit-assignment-postgres-test.sql`. The native SQL fixture uses
the unchanged real authority fixture generator `operations-obligation-fixture.ts`.
It requires actual v1 authority, source-only v2 receiver and the invoice entry-barrier
migrations; source review and twelve-prerequisite PGlite rehearsal are separate
from native PostgreSQL/JWT/concurrency/release gates. No receiver, eligibility or
EAC activation is introduced by these files.

The additional disposable native setup/concurrency files are
`operations-own-credit-native-setup.sql` and
`operations-own-credit-native-concurrency.sh`. Setup requires the fresh dedicated
`eventflow_own_credit_*` database, postgres superuser, exact synthetic prerequisites,
empty source/obligation ledgers and explicit setup GUC
`eventflow.own_credit_isolated=synthetic-disposable`. It accepts the same generated
`fixture` psql variable as the direct-RPC fixture. The runner requires `CI=true`,
`EVENTFLOW_OWN_CREDIT_ISOLATED_DB=true`, loopback, explicit postgres/5432, and rejects
libpq address/service/options overrides before its read-only exact-state check.
Unset setup PGOPTIONS before running it. Private logs and owned-child kill/wait
cleanup use the same reviewed pattern as invoice entry-barrier native tests.

Native cases exercise the actual authenticated assignment transaction while an
actual service first V1 credit or first V2 original counterpart waits before
absent-head insertion. The V2 original enrichment invalidates captured original
snapshot proof, requiring an explicit next assignment. Two actual authenticated
CAS contenders then serialize to one accepted event and one stale receipt.
Neither in-memory seed rehearsal nor shell syntax checks claim these concurrent
native cases passed; only the exact PostgreSQL CI can close that gate.
