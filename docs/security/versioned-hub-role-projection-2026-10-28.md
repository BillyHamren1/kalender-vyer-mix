# Versioned HUB role projection

Receiver-first migration for Operations/WMS. HUB remains the role authority;
this project stores a tenant-scoped projection and never adds module grants.

Both `receive-user-sync` and SSO's freshly HUB-verified payload use
`source_revision`, a canonical decimal string in PostgreSQL bigint range.
The new `apply_hub_role_projection` RPC binds the version to the canonical HUB
UUID and organization, resolves the local identity only through
`resolve_hub_actor_v1`, and updates roles plus the retained version atomically.
An empty projection records a tombstone even without an Auth account.

Older revisions, same-version different-role payloads, and unversioned
deliveries after the first version are rejected. The old three-argument RPC
also checks the version ledger, including immutable links created after an
absent-user tombstone. This prevents a delayed old adapter from bypassing the
new handler. Same-version same-role delivery is idempotent; a newer revision
may deliberately restore access. A failed role write cannot advance the
version. Other organizations remain untouched.

The original atomic role-replacement body is retained behind a private-schema
helper. The old public function keeps its identity and ACL, so stored SQL
dependencies cannot retain a renamed bypass. Only service_role may execute
either public mutation RPC or the private helper. Authenticated/anonymous
callers cannot read the version ledger or write the local role projection.

Email and user-editable metadata no longer select a local principal. Existing
canonical UUIDs and approved immutable links work. Unmapped email conflicts
fail closed and require a reviewed identity link; do not infer a link from
metadata. A read-only production inventory found two such candidate accounts;
they need authoritative HUB ownership review before switching these handlers.
Their personal data is intentionally not included in this repository.

## Validation and release

- 31 existing SQL authorization assertions passed in isolated PGlite.
- 42 version-ordering/identity/ACL/atomicity assertions passed in PGlite.
- 11 executed handler tests cover revalidated SSO data, failure before session
  issuance, tombstones, decimal precision, malformed versions, email conflicts,
  missing role sets and unauthenticated requests.
- CI repeats SQL checks on native PostgreSQL 15 and runs handler tests.
- No production migration, deployment or end-to-end HUB delivery is claimed
  by these isolated tests.

Apply the migration, verify ACLs and approved canonical links, then deploy both
handlers with `_shared/hub-role-projection.ts`. Only then enable HUB source
revision delivery. Until the first versioned delivery for a subject/org,
unversioned delivery remains compatible. Once versioned delivery is enabled,
do not roll back to an unversioned sender: it intentionally fails closed.
Keep the ledger/tombstones during any operational rollback.
