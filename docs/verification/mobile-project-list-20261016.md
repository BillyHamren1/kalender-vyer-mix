# Projects-only mobile read

Additive projectsOnly:true on the existing signed planning-mobile-read-request.v1.

The flag is valid only for a list request, never detail, booking resolution, workspace or workspace options. The endpoint retains signature, nonce, actor resolution, per-organization authorization, exact pagination and shared phase/status sources. It skips calendar_events, booking_staff_assignments, staff_members and profiles. The returned projectionKind:projects explicitly identifies the partial resource set; legacy requests and responses remain unchanged.

35 local Node tests passed with node --test scripts/tests/planning-mobile-read*.test.mjs, including project parity, absence of unrelated queries, denied actor, malformed flag, pagination and existing detail/booking/date/staff regressions. No database schema or live records changed. No authenticated live read or deployment is claimed.

Deploy this owner capability before the Brain projects action and frontend. Legacy calls remain compatible. Companion Brain branch: codex/brain-operations-project-list-20261016 in BillyHamren1/meeting-clarity.

## Project workspace loading follow-up
Supplier enrichment now depends only on the tenant-scoped supplier links, and runs concurrently with the existing booking, cost and other section reads. Previously it began after the complete Promise.all batch, making upstream latency additive. Authorization, canonical presentation, partial section errors and response contract are unchanged. A deterministic blocked-economy test proves supplier requests start before economy completes; workspace owner suite: 22 passing tests. No deployed latency claim.
