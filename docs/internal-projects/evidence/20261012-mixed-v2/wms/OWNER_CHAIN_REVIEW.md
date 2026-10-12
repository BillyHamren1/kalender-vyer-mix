# Actual WMS owner composition and missing authorization seam

14 checks PASS, `node owner-chain-runtime.mjs`, isolated PGlite; see owner-chain.log.
12 exact SQL/fixture inputs are pinned and checked unchanged in OWNER_CHAIN_MANIFEST.json.
No product source edits, source grants, API activation or external writes occurred.

## Executed scope

The existing reservation candidate's actual authority port remains untouched and
rejects with VERIFIED_SOURCE_AUTHORITY_PORT_ABSENT. No mock-verified function or
GUC replaces it. Physical stock composition then calls its existing actual WMS
reserve_inventory_atomic directly against disposable owner-schema test data.
This intentionally proves owner behavior, **not authorized project integration**.

The real availability function counts actual non-scrapped instances and confirmed
reservation demand, not the PR7 fixture's synthetic stock function. Reserving2of3
leaves1. Insufficient competing demand fails. Two instances pack through real PR7
RPC; checkout before complete packing rejects. Current-main manual-quantity
underflow protection remains installed and rejects quantity-unpacking identified
allocations. Return before checkout rejects. Checkout keeps availability1 rather
than deducting allocated equipment twice. Unpack after checkout stays frozen.
Wrong-reservation return cannot release allocations. Partial return preserves the
remaining allocation and reservation hold. Full return completes the reservation,
restores availability3 and creates exactly2 return movements. Exact replays do not
duplicate effects. Injected owner receipt-commit failure rolls back allocations,
instance status, movement, reservation status and operation row together.

## Reproduced bypasses in selected real owner SQL

1. `service_role` invokes scanner_instance_mutate_v2, checkout_instance_v2 and
   return_instance_v2 successfully with null Booking argument and arbitrary
   synthetic actor, while no Operations source grant/receipt exists. A future
   guarded project wrapper alone cannot make those direct paths safe.
2. Exact operation/fingerprint checkout replay returns the old receipt even if
   performed_by changes. scanner_operation_claim compares only caller-supplied
   fingerprint, not independently computed actor/action/work-reference identity.
3. `service_role` directly calls scanner_operation_claim then
   scanner_operation_commit to produce a committed operation result without any
   stock/movement effect. This is an explicit negative reproduction, not accepted
   proof. Project projections must not trust the legacy ledger status alone.

OWNER_ENTRYPOINT_PRIVILEGES.json records observed service EXECUTE and SECURITY
DEFINER for10 actual selected owner functions. scanner_operations also explicitly
grants service_role ALL in PR7. These are selected-file local grant findings;
actual deployed privileges are not asserted. No generic host/database access was
used to infer production exposure.

## Mutation surfaces requiring project-aware protection

| Canonical surface | Mutations / relevant existing entrypoints |
|---|---|
| reservations | reserve, replacement header, checkout checked_out, final return completed |
| reservation_lines | reserve/replace; lifecycle guard freezes changes after checkout |
| allocations | PACK/UNPACK/RETURN; existing legacy allocation/deallocation routes also require review |
| item_instances | checkout/return status, return condition/notes; legacy checkin/checkout routes require review |
| inventory_movements | physical audit/quantity movements across packing, checkout and return |
| scanner_operations | claim/commit/fail + direct service-role DML; caller fingerprint alone is insufficient |
| project_reservations + receipts | immutable source mapping, current revision and original reserve provenance |
| reservation revisions / return plan | owner revision trigger closure and actual owned return order/session still missing from this run |

The PR7 allocation-delete phase guard accepts a matching in-progress RETURN_INSTANCE
row; it does not verify a protected source proof or a private transaction capability.
Because service can mint that ledger row, it cannot serve as the new project's
unforgeable authorization marker. The harness did not grant extra table DML to
pretend deployed direct-allocation rights; that broader path remains to be audited.

## Minimum safe owner seam

Keep one canonical stock writer and one scanner_operations ledger. Add a project
provenance/authority extension, not another operation state machine. Legacy paths
must detect reservations in the immutable project mapping and refuse writes unless
executing within the verified project transaction; Booking behavior remains intact.

A viable bounded design is a private, non-API-writable authorization context keyed
by actual DB transaction, operation and exact reservation/instance/action. Only the
new owner entrypoint may create it, **after** real signed source/actor/grant/request
validation and original receipt checks. It calls existing canonical mutations,
attaches typed provenance to the same operation, then removes the context before
returning. Mutation guards verify this exact private context for project-bound rows.
No caller-set GUC, JSON verified flag, public in-progress operation or supplied hash
is an acceptable substitute. Context is authorization state, not a stock ledger.

The actual source verification port must remain absent/failing until Operations'
producer and WMS verifier exist. Replays recheck current authority before returning
old receipts; digests bind actor, reference, tenant, action, original receipt,
revision, return plan/session and payload. All context/provenance/mutation/receipt
writes share one transaction and fail together. Native tests must establish the
lock order across reserve/replace/pack/checkout/return and capability isolation.

Root should assign private authority-context/guards, typed project adapter and
independent adversarial tests as disjoint files. Do not change generic grants or
all legacy RPC bodies blindly: first verify the actual owner grant/schema closure
and every legacy writer that can reach these canonical tables.

## Still open

Real source grant issuance, protected transaction-context implementation, direct
legacy writer closure, actual project wrapper/typed receipts, bulk/quantity return,
owned return order/session/revision, damaged/missing policy, full deployed schema,
native concurrency and hosted signed-in WMS/Scanner acceptance. This chain cannot
justify Scanner conformance=true or publication. WMS/Scanner publication remains
unauthorized; WMS runtime sources must not be published into Operations as a workaround.
