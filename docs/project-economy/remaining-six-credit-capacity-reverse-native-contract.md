# Credit and capacity reverse ordering — proposed isolated native contract

This is a NEW test-only vertical. Its starting source is Operations `c3a25aece32edc35bedf0487f8a4135c14a4db5c`, with tested merge `939e41f8e9e958c331d81157bea5cf6364981fe4`. The actual prior run37050410563 passed hired11, credit5 and capacity4 authored records plus each cleanup terminal. Only the hired records prove public original/policy-reader-first waits against a genuine receiver. The common terminal label is not reverse-credit/capacity proof.

The proposed files do not modify the accepted original owner53-file closure, ordered27 schemas, 62-table evidence inventory, source generators, original fixtures, product migrations, public functions, cost calculations, workflow or existing runner. Root owns Git and workflow routing. This contract must receive semantic review before a new native implementation is frozen or routed.

## Actual source and lock distinction

| Source | Actual authority and behavior used |
| --- | --- |
| `20261002145349_operations_remaining_six_compatible_read_entries.sql` | Public service-only `read_operations_obligation_original_v1(uuid,uuid,uuid,text)` invokes the compatible admission path. For a current positive binding it obtains the obligation-org lock and the binding's original invoice source lock. Its function-scoped100ms fallback is PER-lock and applies only while this public wrapper executes. |
| `20261002023731_operations_project_obligation_authority.sql` | Frozen original evidence derives the saved positive binding and baseline. It labels currentness `receiver_v1_only`, retains unknown commitment and unavailable forecast. |
| `20261002032702_operations_invoice_economic_source_barriers.sql` | Public service-only V1/V2 receiver RPCs acquire the actual source identity `invoice-economic-source-v1:<destination-org>:<source-org>:<invoice-id>` before their unchanged cores. |
| `20261002035459_operations_obligation_credit_assignment.sql` | Authenticated own-credit assignment resolves the real registered credit and its saved positive original. The owner proof obtains BOTH sorted source barriers, then invokes the original core under its definer owner. No public wrapper100ms is inherited by this command. |
| `20261002042005_operations_obligation_credit_capacity.sql` | Authenticated capacity append follows the real saved assignment, both source barriers, and positive original under the owner chain. A saved reservation is local metadata, not Finance cost, credit eligibility or EAC. |
| `operations-own-credit-native-setup.sql` and `operations-credit-capacity-native-setup.sql` | Unchanged genuine service receiver and authenticated baseline/binding/assignment seeds; first credit is minus50000, original is540000, estimate1000000 and commitment NULL in SEK. Capacity's second real credit is minus500000. No source amount is recalculated. |

A public original read does **not** acquire the different own-credit invoice's source barrier. The new contract therefore requires a nonconflicting credit replay to finish while that read still holds the original barrier. Claiming that all invoices or both sources are blocked by this single original read would be incorrect.

No harness statement may take a synthetic advisory lock to simulate a product call. Every holder must first complete the actual public reader or authenticated containing command, validate its genuine response, and only then pause its own transaction. A separate observer must verify exact holder PID, exact granted advisory keys and actual receiver waiting on that holder. A generic `Lock` wait or an arbitrary granted advisory lock is insufficient.

## Fresh source and isolation

Use two separate owned fresh databases, proposed names `eventflow_own_credit_reverse_remaining_six` and `eventflow_own_credit_capacity_reverse_remaining_six`. They satisfy the unchanged native setup guards but are distinct from the accepted previous jobs. Require CI=true, a NEW explicit isolation flag, exact loopback host127.0.0.1/port5432/postgres, exact repository, numeric run ID and PostgreSQL15.19. Reject proxy, libpq service/options, dynamic-loader, Python and shell injection variables before any child.

Verify every imported runner/helper and original selected dependency against a NEW source closure pinned to genuine current Git blobs. Load the same27 schemas, insert the unchanged role/FK bootstrap at the same position before130228, verify exact62 public/Auth tables and run the unchanged original credit/capacity SQL before and after145349 using the reviewed exact mode-specific singleton sentinels. A failed original fixture, unexpected table, changed role constraint or unexpected source hash stops this vertical. Do not borrow a full installed-catalog certificate from this selected closure.

Generate actual synthetic input through the pinned Deno2.8.1 Operations generators. Seed only through unchanged actual setup SQL and product receiver/baseline/binding/assignment RPCs in these disposable databases. Keep original invoice23232323…, first credit89898989…, source Finance org99999999…, Operations org11111111…, project55555555… and obligationabababab… as fixed fixture identities. No selectable tenant, invoice, SQL, destination or role is accepted from caller input.

This proof uses actual service-role PostgreSQL receiver RPCs and real authenticated role/JWT-claim database commands. It is not a new HTTPS, HMAC, PostgREST, GoTrue or human-login proof; those separately accepted or open gates remain separate.

## Ordered cases in each fresh mode

| Case | Actual holder and receiver | Required observation and result |
| --- | --- | --- |
| Original-reader → original V1 replay | Public service original read, then actual V1 receiver using the exact saved original raw body and a fresh nonce | Read is bound_original with copied540000/SEK, estimate1000000 and commitment NULL. Holder owns the exact original source key. Receiver has an ungranted request for that same key and `pg_blocking_pids` includes the verified holder PID. Release reader; exact replay receipt commits. Only V1 receipt count increases by1. |
| Original-reader alongside credit V2 replay | Same original read; actual V2 first-credit replay with its exact saved raw body | Reader holds the original key and does NOT hold this credit key. Replay finishes and commits while the exact reader remains paused. Only V2 receipt count increases by1. This is a deliberate source-scope control, not a failure. |
| Containing command → original V1 replay | Actual authenticated own-credit assignment, or capacity append, accepted with the exact next CAS; actual original replay | Holder owns both actual original and first-credit source keys. Original receiver waits on the holder's exact original key. Release holder and commit its accepted metadata; receiver replay commits. Exact allowed metadata and receipt changes only. |
| Containing command → credit V2 replay | New actual next-CAS assignment or capacity append; actual first-credit replay | Holder again owns BOTH source keys. Credit receiver waits on the holder's exact credit key. Release holder and commit; replay commits. Check saved original/credit amounts and historical evidence remain exact. |
| Original-reader → absent original V2 counterpart | Same public original reader; unchanged setup's `raw_original_v2` enters actual V2 receiver | Original V2 head is absent before the race and stays absent while receiver is observed waiting on the exact original key. After reader release the receiver accepts source/economic revision1 with the same original540000. New V2 receipt/snapshot/head are allowed; old V1, binding, baseline, assignment and capacity history remains immutable. Previously captured assignment/capacity proof becomes unresolved rather than being relabeled current or converted to zero. |

Run the absent-counterpart case last so the deliberately changed unified source provenance cannot contaminate the preceding genuine owner commands. The original reader remains explicitly V1-only; no whole-project/current-provider claim follows from its still-bound saved V1 evidence.

For assignment mode, the two containing commands must be fresh accepted revisions1 then2, under the synthetic live org admin, with distinct fixed idempotency keys. They may create one credit ownership row, one assignment head and two assignment events. Their copied credit amount remains minus50000, original540000 and unknown commitment stays NULL. Existing saved evidence and all other money/Auth rows are unchanged.

For capacity mode, the original setup already registers TWO real credits/assignments. The two containing commands append the FIRST credit's reservation revisions1 then2 with50000 reserved and50000 retained aggregate against540000. No second-credit reservation is silently added. Both original assignment rows and their captured source proofs remain immutable. The final V2 counterpart makes current capacity unresolved while the latest saved50000 reservation and both capacity events remain retained. No subtraction from invoice cost, eligibility, EAC, remaining or margin is authorized.

## Exact evidence neutrality

Use the existing62-table whole-row state inventory without altering it. Every replay-only case requires unchanged whole rows for all tables except the exact protocol receipt table, which must gain exactly one receipt; validate its actual replay/source/body binding separately. Do not accept row-count-only head equality.

For containing commits, enumerate only the precise metadata tables above and the one replay receipt table as allowed. Bind each new event to the actual accepted receipt/event ID, actor, command, CAS revision, source snapshot and copied signed source proof. Verify prior event IDs and whole-row fingerprints are preserved; a permitted table name is not permission for arbitrary same-count mutation. Capacity head fields/current event and assignment head fields/current event must agree exactly with those accepted receipts.

For the final absent V2 counterpart, validate the actual new original snapshot against the unchanged setup body and exact saved money before allowing its stream/receipt/snapshot delta. Every earlier source/raw hash, V1 head, credit snapshot, baseline, binding, assignment, reservation and Auth row remains exact. SQL accounting_state, settlement_state and provider_approval_state are copied unchanged; a service receipt or reserved_minor never constitutes invoice attestation/payment or operational credit eligibility.

For the native same-count head negative, call the actual receiver with a genuine next synthetic publication inside a rollback-only transaction, retaining the copied monetary fields. Assert that the real head count stays equal, its whole-row fingerprint changes and the state checker rejects the delta; then roll back and prove exact restoration. Do not update an immutable old event/head or bypass its guard to manufacture this test. The historical-event byte negative alters only private captured comparator input and must be rejected; actual saved rows remain unchanged. Add an incorrect blocker-PID/key control and a nonconflicting credit control so sequential execution or an unrelated wait cannot impersonate the required races. No fake product head or source handler is installed.

## Resource and terminal protocol

Reuse only byte-pinned reviewed owned process/session helpers, private0600 logs and the existing bounded TERM/KILL/reap verification. PostgreSQL connections use connect3s, bounded statement/idle-in-transaction deadlines and explicit race-specific lock budgets. A receiver's real wait is permitted; the public wrapper100ms does not impose a universal owner-command or whole-request100ms limit.

Observe holder pause and exact granted key first, launch receiver, then obtain its exact PID and requested key/blocking-PID evidence from an independent connection. Cancel/release only the verified owned holder, and inspect EVERY scheduled future on success, observation failure, cancellation and exception. Unknown exceptions have literal closed diagnostics without property/string/class reflection. Preserve private evidence if cleanup cannot be verified, and never print PASS before all owned processes/backends are gone.

Use fixed ordered unique markers: two original fixture parity records, the five cases above, then one final verified-cleanup terminal per mode. Any missing, duplicate, unknown or out-of-order marker fails. Raw SQL, invoice bodies, JWTs, source proofs, paths and exception messages remain private. Root must review the NEW executable closure, guards, native state deltas and workflow routing before native acceptance; source supplements are not the native proof.

## Gates remaining separate

Contract approval, source/code guards and embedded sequential SQL are separate from actual native sessions. Native acceptance requires both new fresh jobs with all exact markers and verified cleanup on their tested Git merge/source. Existing actual69, owner20, hired reverse2 and old App8/16 do not automatically satisfy this NEW matrix. Full installed/dynamic/extension caller certificate, new-six mounted App, fourth scope mode, genuine provider/current-source completeness, device/hosted release and all default-off activation remain explicitly open.
