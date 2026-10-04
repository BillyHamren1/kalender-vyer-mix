# Operations obligation reconciliation v1

Status: local frozen candidate; default-off; not deployed or published.

## Authority and boundaries

- Operations owns the reconciliation, the immutable snapshots, the current head, close/reopen state, and the receipt.
- The append command contains only CAS selectors, source-count expectations, explicit supersession identities, close intent, and audit text. It cannot supply money.
- Amounts are read from saved current invoice, source-policy, own-credit-capacity, and hired-personnel authorities already held by Operations.
- Finance receives no write. `finance_recalculated` is always false. `finance_copy_eligible` is false until every referenced authority is current, every expected source is present, every required amount is known, and there is no overcredit exception.
- Missing estimate, commitment, allocation, policy, credit proof, hired source, or hired rate remains `null`; absence is never converted to zero.
- The org gate defaults to false. Authenticated Operations admins may append/read only after service-controlled enablement for that same organization.

## Economic rules

1. The latest saved binding for a source anchor is the only version read. A preliminary-to-confirmed transition with the same anchor remains one document.
2. Reallocation requires an explicit one-to-one `prior_source_anchor -> current_source_anchor` edge. Both anchors must resolve to saved documents for this organization, project, and obligation; a typo or orphan on either side fails closed. The prior document stays in evidence but becomes inactive. Cycles, duplicate edges, missing targets, and chained targets fail closed.
3. Each document exposes its complete saved allocation total and `recipient_net_minor`. `visible_unallocated_minor` is the sum of `recipient_net_minor - all_allocations_minor`; if the identity or money is incomplete, it is `null`.
4. Current supplier amount is active document allocation minus current retained own-credit reservations. Credits are not clamped. An overcredit remains a visible negative amount with `coverage=exception_overcredit` and is not Finance-copy eligible.
5. Hired authority is deduplicated by its immutable `source_identity`. It is operational evidence only and has `charged_minor=0`, preventing an invoice-backed hired source from being charged twice. A missing hired rate makes the reconciliation totals `null`.
6. A close appends a normal immutable snapshot and freezes that snapshot ID. Later credits append new current snapshots while the frozen close remains byte-identical. Reopen changes the current head state but does not delete or replace the frozen close. A later re-close appends current evidence and changes the closed state, but preserves the first `frozen_close_snapshot_id`.

## Persistence and concurrency

- Snapshots and receipts are append-only and trigger-protected; the head may advance by exactly one revision to an already-saved matching snapshot.
- The command is idempotent per organization and actor. Exact replay returns the original receipt; changed actor or body conflicts.
- The append path takes the one canonical `obligation-org:<organization_id>` transaction advisory lock before binding, baseline/current, policy, credit, or hired authority reads. It takes no candidate-specific advisory lock, which fixes lock order and avoids a second-key deadlock cycle. It then checks expected head revision and expected baseline event. Concurrent writers yield one accepted append and one stale result.
- Any validation, authorization, currentness, or insert failure is transactional and leaves head/snapshot/receipt state unchanged.

## Safe verification

The native runner creates a network-isolated, read-only-root PostgreSQL 15.19 container from an exact image digest, loads only synthetic authorities, runs positive and negative paths, exercises concurrent writers, removes the container, and asserts absence. A removal error or surviving container forces a nonzero exit even after every database assertion passed. It never contacts Finance, Fortnox, Lovable, Supabase hosting, or production data.

## Known external gates

- No hosted migration, RLS, signed-JWT/PostgREST, real Operations UI, Finance-copy consumer, provider, or device runtime has been exercised by this local candidate.
- Publication, merge, deploy, gate enablement, and release require separate review and authorization.
