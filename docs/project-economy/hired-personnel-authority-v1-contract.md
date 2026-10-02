# Hired personnel source authority v1 — first implementation

Default-off, metadata-only prerequisite. No kernel/read-wire replacement,
financial posting, time/invoice suppression, complete coverage or EAC activation.
The first executable slice admits invoice-basis operational-only personnel;
time-basis classification can be recorded but its source charging and invoice
disposition remain unsupported. The first metadata-only contract is locked;
source review and exact native execution remain required.

## Actual baseline compatibility

Basis events must select the actual current `operations_project_obligation_heads`
and matching immutable `operations_project_obligation_baselines` event. Require
category `personnel`, matching project and currency, and basis equal to the
baseline's invoice/time basis. Actor/org are derived from the current scoped
authenticated administrator. A caller cannot supply organization, actor,
worker, money, status or historical authority.

Existing 023731 baseline guards forbid changes to cost_basis. Therefore this
slice rejects a basis change, even at the next classification sequence. A future
reviewed baseline successor/replacement contract is required; it must invalidate
old assignments/policies. Creating an independent basis event cannot bypass
the actual baseline. No existing head trigger or baseline writer is changed.

## Proposed commands and storage

All names below are NEW additive APIs/tables introduced by this slice.

`append_operations_hired_basis_v1(p_command)` accepts exactly:

| Key | Meaning |
| --- | --- |
| schema_version | `operations-hired-basis.v1` |
| project_id, obligation_id | Actual scoped UUID selectors |
| baseline_event_id | Actual current immutable manual baseline UUID |
| expected_obligation_revision | Current baseline revision |
| expected_basis_revision | Zero first; monotonic CAS thereafter |
| cost_basis | `invoice` or `time`, must equal saved baseline |
| evidence_sha256 | Immutable operator evidence digest, lower64hex |
| idempotency_key, reason | Bounded immutable audit strings |

The event records actual actor/time, baseline revision/fingerprint, currency,
explicit hired classification and operator evidence. It grants no source charge.

`assign_operations_hired_operational_source_v1(p_command)` accepts exactly:
schema_version=`operations-hired-operational-source-assign.v1`, project_id,
obligation_id, basis_event_id, expected_assignment_revision, source_kind
(`time` or `catering`), source_stream_id, source_revision, source_line_id,
expected_source_fingerprint, invoice_binding_event_id,
replaces_estimate_minor=0, consumes_commitment_minor=0,
idempotency_key, reason. Both monetary fields are explicit integer zero, not
defaults. Reject null, truthy coercions and additional fields.

For Time, line selector is the actual saved `cost_snapshot.lines[*].source_time_line_id`.
For Catering, it is the actual saved native `source_time_entry_id` UUID. The
database derives all personnel, project, monetary and version evidence from
the selected current publication; no caller field is a trusted amount or status.
Time publication selectors are actual `(organization_id,source_time_stream_id,
source_revision)` in `operations_personnel_cost_publications`; Catering uses
`operations_catering_cost_publications` and its actual observation/mapping FK.
Fingerprint is the purpose-bound canonical SHA256 defined below, checked against
the exact selected full saved publication. It is integrity/current-version
evidence, not authentication; the raw Time snapshot hash alone is insufficient.

Proposed private ledger has a default-false organization gate; append-only basis
events; permanent source ownership; immutable assignment events; monotonic heads.
Stable source identity is SHA256 of UTF8 canonical JSON array:
`["operations-hired-personnel-source-identity-v1",lowerOrgUuid,sourceKind,exactStream,exactLineId]`.
Publication fingerprint is SHA256 of UTF8 canonical JSON array:
`["operations-hired-personnel-publication-fingerprint-v1",sourceKind,fullSavedPublication]`,
where fullSavedPublication is the entire Time `cost_snapshot` or Catering
`snapshot`, not a selected line or raw upstream snapshot.
Use the existing approved `operations_economy_private.canonical_json_v1` and
its matching TS canonical implementation: compact JSON, recursively sorted
object keys by UTF8 bytes, original Unicode strings, standard JSON escaping,
no BOM or trailing newline. Never substitute PostgreSQL `jsonb::text` or plain
unsorted object `JSON.stringify` for this canonical contract. Preserve stream
and Time line strings exactly; organization UUID and Catering line UUID use
lowercase canonical dashed form before hashing. Shared vectors
must include quote/backslash/newline, non-ASCII BMP/supplementary Unicode and
object key reordering, and prove full publication fingerprint changes when
any saved source amount/status/version changes. Source revision/hash is captured
per assignment, not part of permanent ownership. Unique organization/source
identity belongs permanently to one obligation; this first slice rejects moving
it to another obligation/project. Reassignment requires a separate future
withdrawal/successor contract, not delete/update ownership.

Public wrappers are authenticated-only private-definer delegates. Service role
cannot register actor-surrogate authority or write ledger tables directly.
Operator may only toggle the default-off gate. Service gets a narrow read plus
SELECT; revoke inherited privileges explicitly. Owner-level mutation, head
rewind/identity rewrite/delete/truncate guards mirror existing authority paths.

## Atomic currentness and disposition

Invoice basis assignment requires the latest matching basis event/current
baseline and an actual current positive nonrejected invoice binding to the same
obligation/currency. Recheck the actual original reader and unified V1/V2
economic head in this transaction; a historical standalone read is not proof.
Any contradictory/newer head makes the invoice relation unavailable. No policy
replacement/consumption is derived from Finance's legacy boolean.

Lock current auth/project and default-off gate, then the existing obligation-org
barrier, sorted involved invoice writer barriers and actual selected personnel
source head in deterministic order agreed with existing writers. Re-read every
selected identity/current head after locks. Source head must already exist:
no fake zero stream or guessed absent-head proof. Source publishers lock these
same Time/Catering heads before replacing the current publication; FOR SHARE
must last through the assignment commit. Audit mirror/ingress lock order before
implementation, including invoice reader's baseline/project locks.

Time line must resolve to the selected actual Operations project and saved
worker/currency. `operations_personnel_target_bindings.source_project_id` has
no project FK: verify exact raw target/immutable binding provenance and require
its resulting line project equals the live same-org authorized obligation
project, not merely a syntactically valid UUID. Catering saved project and
obligation must match exactly; mutable mapping changes cannot retarget the saved
source. Rejected project-cost status cannot establish a current assignment;
Catering globally rejected payroll/source status is rejected independently
even when project-cost status looks preliminary. Missing-rate source is allowed only as
explicit operational-only evidence, preserving amount=null and missing-rate
coverage. This does not prove complete personnel or remaining-cost coverage.

Assignment records `operational_only`, economic replacement=0/consumption=0,
actual source amount/minutes/status and basis/invoice lineage. It never changes
or hides the existing source publication, receiver, Finance cost or official
total. A future separately reviewed mapper may use this authority to avoid
double charging. Until then no sum of time+invoice becomes an approved total.

Reader derives currentness from latest basis, baseline, assignment sequence,
selected source head and unified invoice relation in one transaction. Source
correction/empty stream/project move, baseline revision, changed invoice
economic evidence or revoked gate returns unresolved with diagnostic and null
current monetary projection; historical evidence remains visible separately.
Replay returns historical event/receipt only, never reauthorizes stale source.
Historical actor revocation does not erase evidence; new commands reauthorize
the actual live actor. Permanent ownership remains reserved when stale.

No Time/Catering equivalence is guessed. If two protocols describe the same work,
the first slice exposes unresolved equivalence; it cannot authoritatively exclude
both or charge both. Time-basis cases must preserve competing invoice evidence
and require explicit invoice-side disposition before any charging projection.

## Verification and owned files

Proposed new helper `_shared/hired-personnel-authority.ts` and focused tests;
new CLI migration under `operations_hired_personnel_authority` prefix; new scoped
SQL fixture; this contract. Do not edit kernel, source publishers/receivers,
scope capture, drilldown, UI mounts, workflows, Git or release configuration.

Pure tests: exact command keys/types, enum/UUID/hash bounds, explicit 0/0,
normalization, hostile actor/org/money fields, permanent identity vectors.
SQL fixture must invoke actual personnel/native Catering publishers, actual
manual baseline/invoice receiver/binding and authenticated authority wrappers.
Cover default-off, revoked/foreign/non-admin/deleted project, real source current
selection, missing rate, conflicting currency/project, basis mismatch, no invoice
binding, duplicate source ownership, PT409 deliberate CAS, exact replay vs
changed idempotency, actual correction/withdrawal staleness, immutable controls
and service-role direct-write denial. Existing invoice/time facts remain byte-
identical; all category/source coverage and EAC/remaining are unavailable/null.

PGlite rehearsals and pure tests do not prove native concurrent source/assignment,
gate/actor revocation, same-source ownership races, protected source HTTP, UI or
release. Root owns new exact-source native routing only after independent review.
