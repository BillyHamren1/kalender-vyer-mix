# Dormant customer identity compatibility and causal cost metadata

Source base Operations PR55 `4ce826322dc703da64f7439abc739481487cac09`; accepted project-review override copied from reviewed `ac13685f` source. Owner `/root/operations_recovery`, isolated `recovery-customer-metadata`. Draft SQL only: no hosted migration, enrollment, key, exposed issuer caller or activation.

## Authority and exact customer scope

Operations attests its authoritative project classification and tenant-checked relationship to its real Booking row. This is **not a Booking-origin signature** and does not change commercial order ownership. Finance separately requires explicit authorized admin enrollment of the signed source identity to an existing customer project; a generic Operations map alone is insufficient.

Only explicit ordinary `projects.project_kind='customer'`, `is_internal=false`, nondeleted, direct same-tenant noninternal Booking is supported. Booking identifiers remain opaque exact TEXT, including non-UUID identifiers, without normalization. This cost transport supports 1–256 UTF-8 bytes (a compatibility limit, not an asserted Booking schema limit). Legacy NULL classification, NULL booking, `large_projects`/`large_project_bookings`, packing projects and unsupported identities fail closed. No artificial booking is created.

`customer-identity-metadata.sql` extends the existing metadata destinations with immutable purpose `customer_cost_identity` and exact source booking. Owner-only enrollment locks Booking before project, revalidates the relationship, captures one prospective immutable source receipt, then inserts disabled enrollment atomically. No historical inference/backfill or customer business writes. Unenrolled customers remain untracked. The existing metadata wire remains six keys: customer kind and declared kind, legacy false, real booking TEXT, and both budget fields null. Customer budget/name/status edits emit no revisions and remain untouched. Finance must not apply even these null budget fields to customer financial data.

Identity changes, source deletion/soft deletion, or Booking identity/tenant/internal-classification changes append a terminal delete carrying the frozen original metadata. Ordinary Booking status changes are not identity changes. Delivery subscription remains available to deliver the tombstone; disabling it would strand revocation. Restoring/reinserting the source does not revive the proof or permit re-enrollment. There is no automatic rebind.

Booking mutation already holds its Booking lock and obtains dependent project locks in UUID order. Customer project transitions never acquire a Booking lock in reverse order. Enrollment uses Booking→project, then the existing per-project metadata advisory lock. Native tests require observed physical waits for both race directions.

## Causal accepted envelope v2

`accepted-personnel-metadata-v2.sql` preserves v1 and its canonical cost snapshot. A NEW issuer/epoch may explicitly opt into immutable `metadata_required=true`; existing issuers remain false and cannot be silently upgraded/downgraded. No issuer rows are provisioned.

V2 keeps the original twelve accepted-envelope fields and adds `project_metadata_refs`, an ordered array of exact `{source_project_id, revision, fingerprint}` objects. Refs cover every distinct project in all current snapshot lines, including rejected and missing-rate lines. Empty current membership gives an empty array; prior withdrawals remain tied to their historical accepted receipt in Finance. Source SQL captures the actual latest eligible source receipts under sorted live project locks and existing metadata locks before the canonical stream lock. Metadata identity must match current source row and explicit enabled delivery enrollment. The marker freezes refs and source envelope in the same canonical transaction; no new money ledger or cost recalculation.

`accepted-personnel-review-metadata-v2.sql` preserves the ancestor's frozen v2 refs and enforces the same project membership. It never looks up latest metadata during review/delivery and acquires no additional metadata project locks. Existing actor/grant/route fences remain intact.

Finance requires the exact referenced signed metadata revision and fingerprint, plus matching purpose/kind/pinned Booking identity. Missing authorized dependency is retryable (503); conflict or known later terminal delete with positive lines is denied. V1 remains internal-only. Metadata channels are asynchronous: a source mutation after capture cannot be instantaneously known by Finance; no such guarantee is claimed. Hosted orchestration must define delivery alignment before activation.

## Verification and remaining gates

Customer oracle: 9 PGlite PASS including soft deletion and restoration denial. Actual source issuer plus review: 53 PGlite PASS (including real pre-extension v1 customer source/review downgrade denial). Native overlap tests are authored for isolated PostgreSQL CI and are not yet execution evidence. Independent review and mixed non-UUID Booking full-stream composition are in progress.

Draft install order: existing canonical migrations, accepted issuer, accepted review, metadata outbox/delivery, TEXT compatibility override, customer identity extension, v2 issuer, v2 accepted-review override. Nothing is installed on a live database. Callable issuer/adapter design, real keys/enrollment, coverage, hosted migration/rollback and authenticated published UI acceptance remain open.
