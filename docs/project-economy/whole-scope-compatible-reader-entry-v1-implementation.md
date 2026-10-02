# Restricted compatibility entry: implementation and open proofs

Status: candidate source, not activated or independently accepted for product runtime.
The implementation follows the separately frozen entry contract
`whole-scope-compatible-reader-entry-v1-contract.md` (SHA256
`a593bf2c70388182004223d8818c7cc7c6343b83dc278d0454bb19185bef717c`).
No product publication, source admission, Finance delivery or coverage authority is
introduced. Existing gates retain their values. The untouched leaf kernel computes
Operations amounts; the entry returns its existing captured evidence.

## Public compatibility

| Public entry | Role | Request | Reply |
| --- | --- | --- | --- |
| `read_operations_scope_invoice_kernel_evidence_v1(p_request jsonb)` | service_role | frozen exact seven-field request | unchanged frozen 28-field captured evidence |
| `read_operations_scope_invoice_capture_admin_v1(p_request jsonb)` | authenticated | frozen exact four-field root/displayed-composition request | unchanged exact three-field wrapper containing the same frozen evidence |

`20261002130228_operations_scope_invoice_compatible_read_entry.sql` changes these
two existing SQL-invoker entry bodies to restricted new private definers. Their
names, argument names, grants and reply shapes remain unchanged. Old private core
EXECUTE is revoked from its former caller role. Owner calls from the new definer
and the old admin definer remain possible; application roles cannot invoke the old
core to bypass the nonwaiting preparation. The other six audited public reader
families are not rerouted and remain separate compatibility gates.

## Installed caller and owner closure

The migration first inspects installed `pg_proc`, ownership, search_path and
security mode. Frozen cores must be definers owned by the applying owner; existing
public entries must be invokers with that same owner and empty search_path. Actual
profile uniqueness, role tuple uniqueness and validated auth-user cascade FK are
required. Unknown installed static references to either old private scope core
abort before replacing any entry or revoking any permission.

The allowed pre-migration static graph is precisely:

| Caller | Target |
| --- | --- |
| public service entry | private `read_scope_invoice_kernel_v1(jsonb)` |
| private `read_scope_invoice_capture_admin_v1(jsonb)` | private `read_scope_invoice_kernel_v1(jsonb)` |
| public admin entry | private `read_scope_invoice_capture_admin_v1(jsonb)` |

The guarded native setup removes its TEST-only pg_temp publisher functions before
applying the product migration. Production pg_temp callers are not whitelisted.
Named-source matching is not a proof about generic/dynamic SQL dispatch. The
complete installed candidate caller/ACL catalog and privileged dynamic dispatch
audit are mandatory release evidence. A partial scratch mirror, selected source
files or a hosted f056 baseline catalog cannot substitute for this evidence.

## Mutable lock closure

| Dependency | Preparation | Frozen reentry |
| --- | --- | --- |
| admin auth user, unique profile, same-tenant admin role | exact existing rows SHARE NOWAIT | old admin and child authorizers SHARE |
| existing scope and child read gates | enabled row SHARE NOWAIT | identical existing gate SHARE |
| organization obligation barrier | exact `obligation-org:<org>` TRY advisory | unchanged blocking advisory is reentrant |
| canonical membership barrier | exact `operations-economic-scope:<org>` TRY advisory | enrollment cannot race held identity |
| current root and current admitted packing policy | SHARE NOWAIT, with actual current status | unchanged membership helper reenters held rows |
| canonical scope and composition heads | SHARE NOWAIT | unchanged core reenters held heads |
| selected current local baseline heads and live projects | exact saved project/obligation/revision SHARE NOWAIT | whole, leaf, original and admin member checks reenter |
| all globally distinct latest-binding invoice identities | sorted exact `invoice-economic-source-v1:<Opsorg>:<Financeorg>:<invoice>` TRY advisory | unchanged source barrier is reentrant; absent protocol counterpart protected |
| both existing v1 and v2 protocol heads for each identity | SHARE NOWAIT | unchanged leaf/original readers reenter |
| scoped source-policy heads | SHARE NOWAIT | unchanged resolved-policy reader reenters |

Immutable baseline, binding, policy, membership, composition and invoice snapshot
rows are read after their mutable heads/barriers are protected. The entry captures
all latest permanent binding selectors before any protocol head and verifies that
the selector inventory is unchanged before delegating. Limits remain 1000 selected
baselines, 10000 anchors and 100 globally distinct invoice selectors. Limit
violations fail rather than truncate. Legacy graph joins remain coherent as-of
evidence, not phantom-serialized upstream currentness.

## Error and authorization priority

Both APIs reject malformed exact schemas before sensitive hints. Admin derives
actor and organization from live auth/profile/admin rows; request fields cannot
supply either. Both existing gates and requested current root/packing policy are
checked before the immutable displayed monetary composition hint. A revoked or
foreign root stays 42501 even if the displayed composition is stale.

The service preserves composition-first token/cap validation, then the actual
root/current packing policy predicate, then graph staleness. Admin translates only
the same three existing business-stale messages from 22023 to PT409. Other denials,
provenance failures and limits remain errors. A contended TRY key or NOWAIT row
raises 55P03 `scope_invoice_reader_lock_busy`, rolls back and permits a controlled
retry. Busy is never a successful missing-evidence result.

## Current evidence

Supplemental actual 23-schema PGlite rehearsal plus pinned untouched admin61253 and
new migration returns eight known/unknown old/new service/admin vectors. The
source-controlled direct fixture compares every saved identity, fingerprint,
status, flag and copied amount except volatile `as_of`. The source-controlled
vector checker runs the frozen strict parsers and unchanged Operations kernel;
known partial invoice subtotal is retained, empty unknown subtotal remains null,
and all remaining/coverage/EAC/budget/margin gates remain unavailable/null.
The direct fixture proves old private role bypass denial, wrong-public-role
denial, schema/actor/foreign-root denial and endpoint-specific policy/stale
priority. Read calls make no cost, obligation, source, publication or receipt writes.
This rehearsal is not simultaneous PostgreSQL, signed-JWT or mounted-App proof.

## Required remaining runtime evidence

Fresh real PostgreSQL must execute the candidate migration and actual public read
entries. Required causal writer families include manual baseline/project revoke,
composition/org-first, direct enrollment/economic-first, compound preview/root-
first, role revoke and packing current-policy revoke, plus both invoice protocols
and first absent counterpart. Reader transactions must remain open while actual
queues are observed; accepted compatible SHARE as-of reads must bind the same
saved composition/baselines and complete frozen evidence. Advisory or conflicting
row contention must produce exact 55P03 with no history/state change. No timeout or
deadlock can count as a permitted busy result.

Signed JWT/PostgREST service/admin requests, every installed owner call path,
dynamic dispatch audit and role revocation are additional product gates. Fourth
mounted scope-invoice mode must retain its blocked state until these close and the
correct whole read gate and complete candidate sources enter its no-write proof.

Rollback is a separately reviewed routing migration restoring the original two
public bodies and role EXECUTE on the old cores; it never removes cost evidence or
rewrites historical rows. Existing gates can remain disabled during rollback.
