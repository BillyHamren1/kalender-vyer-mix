# Canonical scope view aliases: contract only

An alias lets an explicitly enrolled local project or packing view refer to one existing canonical economic scope. The displayed financial evidence belongs to the **full canonical scope**, including every additional booking and project outside the selected view. An alias does not create another budget, choose a portion, reprice a source, sum parent and child baselines or change permanent economic ownership.

This batch contains only a strict command validator, graph compatibility preview and tests. There is no alias migration, saved event, RPC, UI mount or activation. Native graph/currentness/authorization/concurrency proof remains required before implementing a persisted alias authority.

## Actual source boundaries

The existing membership ledger is migration `20261002014937_operations_project_scope_enrollment.sql`. `operations_project_scope_heads` fixes organization/scope/root identity; immutable scope snapshots capture revision, graph fingerprint, actor and reason. `operations_project_scope_member_ownership` permanently reserves each local source project or local Booking TEXT ID to one economic scope. An alias cannot transfer those reservations or convert a legacy Operations Booking TEXT ID into a canonical Booking-service UUID.

The unchanged `canonical-project-scope.ts` derives actual `public.projects`, `large_projects`, `packing_projects`, `bookings`, `large_project_bookings` and `packing_project_bookings` relationships. Public projects and large projects have `deleted_at`; packing projects do not. Packing authorization instead requires the real enabled status policy and accessible same-tenant live parent/master membership. Parent join identities remain part of the graph proof. Distinct project leaves sharing one Booking are genuine members and remain distinct.

The initial alias authority and read boundary must require a current organization administrator using the actual profile/user-role authorization. A grant to a leaf project or packing subview conveys no authority over the whole canonical economic scope. Future explicit full-scope financial grants require a separate reviewed policy. Alias enrollment itself grants no permission.

## Locked command

The exact eleven fields are `schema_version:'operations-canonical-scope-view-alias.v1'`, `economic_scope_id`, `view_root_kind`, `view_root_id`, `expected_alias_revision`, `expected_canonical_scope_revision`, `expected_canonical_membership_fingerprint`, `expected_view_membership_fingerprint`, `expected_catalog_fingerprint`, `idempotency_key`, `reason`.

Organization and actor are derived server-side; callers cannot submit either identity, a grant, monetary values, member lists or a display-scope override. The alias CAS revision is a nonnegative safe integer below MAX_SAFE_INTEGER so its successor stays safe. The canonical revision is positive and safe. UUID identity normalizes to lowercase; legacy Booking TEXT is preserved exactly. Hashes are exact lowercase SHA256 hex. Reasons are immutable bounded nonempty text.

The canonical context has exactly six fields: organization, economic scope, canonical root kind/ID, current canonical revision and saved membership fingerprint. Permanent owner rows have exactly organization/member kind/member ID/economic scope/first scope revision. Every current canonical member must have one matching permanent owner. Foreign, duplicate, missing or differently owned members fail closed; a view can only be a nonempty subset of that canonical graph. A large-project view covering multiple bookings cannot alias to a partial single-booking canonical project.

## Coherent capture and fingerprints

The pure preview synchronously copies one complete shared catalog and owner list, builds both canonical and view graphs without awaiting, and serializes all preimages before hashing. It requires the freshly derived canonical graph fingerprint to equal the saved canonical revision's fingerprint. It reports exact canonical/view graphs, both fingerprints and the additional canonical members outside the selected view.

`catalog_fingerprint` is SHA256 of UTF8 `operations-scope-alias-shared-catalog-v1\n` followed by compact canonical JSON of `{context,view_selector,catalog,member_owners}`. Object keys and normalized catalog/owner rows are ordered by UTF8 bytes. UUID columns normalize; Booking TEXT, relationship identities, statuses and source values do not. The full captured catalog is fingerprinted, so even an unrelated captured row change can invalidate a preview conservatively. The future service should capture a bounded complete relevant catalog rather than an unbounded tenant database.

A fingerprint proves captured integrity only. It proves neither source authenticity, administrator authority, database snapshot coherence nor natural upstream freshness. Saved graph hashes and owner references cannot be reused as permission grants.

The future SQL boundary must collect both roots, canonical head, any existing canonical head for the selected view root, source catalog and permanent owners in **one coherent statement/snapshot**. Calling the existing membership RPC twice in separate READ COMMITTED statements does not establish a coherent two-graph proof. Current auth/profile/role, roots, parent policy and canonical head require live locks with post-lock rechecks. Root/scope acquisition must follow a single canonical global ordering before economic-source or leaf-head locks; compatibility with current enrollment/read writers must be demonstrated, including absent source/root inserts and revocation.

Existing enrollment uses the organization advisory barrier `operations-economic-scope:<organization UUID>` before membership/root reads and canonical-head CAS. Future alias metadata writers must share that reservation barrier. Existing financial composition/read paths instead first take `obligation-org:<organization UUID>` before invoice barriers/ledger reads. Alias creation does not read or calculate money. A future alias-to-financial-read transaction must preserve the established financial organization barrier before any financial source/head locks and must demonstrate compatibility if it also takes the scope reservation barrier. This contract does not claim an untested combined lock order is safe.

## Persistence rules reserved for future review

A view root has permanent same-organization ownership by one canonical scope. An existing canonical head for that view root in another economic scope is a hard conflict, even if its current graph happens to match. No last-write reassignment, implicit first-Booking selection or silent alias transfer is permitted. Transfer needs a separately reviewed lineage contract. Initial enrollment and explicit refresh append immutable actor/reason/idempotency events with canonical/view/catalog fingerprints and alias CAS revision. The actor is `auth.uid()`, not a command field.

An exact retry can return historical provenance, but it cannot claim current alias validity without a fresh read. A change in either graph or canonical revision makes the prior alias stale until an explicit refresh preserves the same canonical ownership and passes current authorization/CAS. Reads must verify the displayed alias event and canonical composition identities before and after asynchronous transport/session changes. The full-scope label and additional members remain visible in every response/display; a view label cannot masquerade as a view-only price.

## Proof matrix and open gates

Pure tests cover a leaf view of a genuine two-booking master, packing parent edges, a forbidden master-to-partial-project alias, permanent owner conflicts, exact caller-free command, UUID case/UTF8 Booking preservation, caller mutation during asynchronous hashing, graph/parent-edge changes, foreign roots and invented packing deletion fields.

Before any migration or activation, independent semantic review must accept these rules. Native tests must then prove coherent shared graph capture, two-session membership inserts/deletes, canonical enrollment and alias CAS races, absent view ownership contention, permanently conflicting owners, live administrator/policy revocation, shared parent deletion and changed canonical composition. Real authenticated HTTP and mounted UI must prove full-scope labeling, additional-booking visibility, no subview grant escalation, stale displayed-token handling and private query dehydration exclusion.

No category completeness is inferred. Budget mapping and economic mapping remain unavailable; EAC remains NULL. Existing personnel, invoice, Catering, credit, obligation, composition and kernel modules are untouched.
