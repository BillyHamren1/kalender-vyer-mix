# Atomic HUB role projection

Follow-up to #76. The profile/tenant guard and tenant-scoped admin lookup from
#76 are deployed. Native PostgreSQL 15 and PGlite tests passed. A rolled-back
live database check verified authenticated tenant mutation denial and ordinary
profile editing; it did not constitute a browser/SSO end-to-end test.

This change replaces role upserts in `verify-sso-token` and the two-statement
upsert/prune in `receive-user-sync` with one service-only, transactionally locked
RPC. It replaces the full role set for exactly one user and organization.
An empty authoritative role set revokes an existing identity without creating
an account or changing its active profile context. Missing role input is refused.
Tenant RLS context now additionally requires a current local membership, so an
existing session loses tenant data access after that local projection is removed.

Validation: 31 PGlite assertions, including rollback on a partial replacement
failure; seven executed handler tests with mocked auth/network adapters. The
same SQL fixture is configured for native PostgreSQL 15 CI. No credentials,
messages or real-user role assignments are created by these tests.

## Remaining cross-system revocation limits

This change does NOT promise instantaneous revocation from HUB across all modules.
Current HUB `sync-user` skips Calendar delivery when neither Planning nor Warehouse
is entitled. The module can now consume an empty-role revocation, but the sender
must actually deliver it. Missing delivery, old sessions before delivery, and
out-of-order distinct authorization snapshots require coordinated HUB work:
durable/versioned revocation delivery and rejection of older revisions. The local
advisory lock prevents partial concurrent replacements; it does not establish
source-message ordering. No such ordering guarantee is claimed here.

Do not replace these server projections with module-local role administration.
HUB remains the sole authority. Other module backends still require their own
authorization/revocation verification.
