# Operations scope invoice line evidence — source contract

This is an additive, default-off Step 6 read seam based on Operations commit
`224142643da2b540734c70925f2c6ed75242effc` / tree
`ce17b9abb33b081c217f884fa3a89685dda6f362`. It is staged only. It does not
claim a migrated database, authenticated runtime, hosted UI, provider evidence,
release, or activation.

## Authority and route

- The browser calls only `public.read_operations_scope_invoice_lines_admin_v1`.
- The public wrapper is `security invoker`, has an empty search path, and grants
  execute only to `authenticated`; `anon` and `service_role` have no route.
- The private function is `security definer` with an empty search path. It first
  invokes the existing compatible admin capture path. That path owns the actual
  user/profile/admin authorization, current root and composition proof, member
  project checks, both existing default-off database gates, source barriers,
  current receiver heads, and scope/composition/baseline locks.
- The new function calculates no prices and writes no state. It joins the held,
  resolved source proof to the exact immutable binding event only to reveal the
  already-persisted allocation identity.

## Exact available tuple

Each available line contains only:

1. `source_organization_id`
2. `project_id`
3. `invoice_id`
4. `source_allocation_id`
5. positive `amount_minor`
6. three-letter `currency`
7. positive `source_economic_revision`
8. `source_status` (`preliminary` or `confirmed`)
9. `source_economic_fingerprint`

Lines are unique and sorted by source organization, invoice, allocation and
project. Split allocations remain separate lines. The response and UI define no
subtotal, total, forecast, budget, margin, EAC, replacement, or attestation
calculation.

## Missing, rejected and credit behavior

- A line exists only when the existing kernel says the source is resolved and
  the immutable binding agrees on identity, revision, fingerprint, positive
  amount, currency and preliminary/confirmed status.
- Rejected, missing, stale, replayed, changed-currentness, unsupported-basis and
  unmapped sources never acquire an amount of zero. They increase an unavailable
  count or make the request fail closed with the existing `PT409` boundary.
- An empty line list has `availability: unavailable`, never an economic zero.
- Credits are deliberately not admitted. `credit_eligible` remains `false` and
  signed-negative credit parity is an explicit later gate.
- `source_coverage` remains `unavailable`; this seam cannot prove completeness.

## Browser privacy and lifecycle

The child table is independently default-off behind
`VITE_OPERATIONS_SCOPE_INVOICE_LINE_EVIDENCE_ENABLED=true`. It reuses the
parent's actor, access token, organization, root, composition snapshot and
session boundary; uses an exact bearer RPC; has a shared 15-second deadline;
checks the session before and after the RPC; aborts on unmount; hides cached rows
while refetching; sets `gcTime: 0`, `staleTime: 0`, `retry: false` and
`meta.persist: false`; and excludes tokens from query keys. It renders identities
and the copied amount/status/revision only. It creates no total.

## Migration and rollback

The migration adds two functions and changes no table, policy, gate, receiver,
binding or existing RPC. Rollback is compatible and explicit:

1. turn off `VITE_OPERATIONS_SCOPE_INVOICE_LINE_EVIDENCE_ENABLED`;
2. remove the child component integration and client/shared validator;
3. `drop function public.read_operations_scope_invoice_lines_admin_v1(jsonb);`
4. `drop function operations_economy_private.read_scope_invoice_lines_admin_v1(jsonb);`

No data rollback is required because the seam persists nothing. Existing Booking
invoice UI, scope capture, forecasts and cost projections are unchanged.

## Still-open runtime gates

- apply the migration to an isolated exact-schema database;
- genuine admin success and anon/non-admin/cross-organization denial;
- both database gates disabled/enabled behavior and concurrent lock failure;
- split, rejected, stale/replay, missing mapping, changed receiver head and
  partial-currentness database vectors;
- actual Finance publisher → Operations receiver preliminary then confirmed with
  the same invoice/allocation/project/amount/currency/revision identity and no
  duplicate contribution;
- mounted App behavior for logout, actor/token/org/composition switch, late
  response, refetch hiding and dehydration;
- credit support, hosted exact-version evidence, provider/Fortnox evidence,
  release and production activation.
