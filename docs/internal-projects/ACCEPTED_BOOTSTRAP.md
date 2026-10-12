# Dormant owner-only prospective day bootstrap

Unpublished candidate based on reviewed caller 22a98b673. Caller exact thirteen blobs were published as Operations PR55 a443566f6803f4474ef7560078bca5bd64b340a7. Caller CI 38307414559/job115004707291 independently verified 65 PGlite, 70 PostgreSQL 17.11, 76 TypeScript tests and handler types PASS. This supersedes earlier caller native-pending notes; no hosted or activation claim.

New owner-only `bootstrap_personnel_day_v1(org,worker,work_date,issuer,epoch)` derives the stream from persisted enabled policy and exact current frozen Time binding. Date is explicit Time civil date, finite years 0001–9999; no server date or timezone inference. Global exclusive ownership fence precedes all identity/head reads and writes. It initializes canonical empty revision zero and immutable same-epoch floor zero atomically. Retry is permitted only while truly empty. Existing history, aliases, foreign epoch, changed binding or any canonical evidence is denied. No shadow promotion. Cross-organization collision of the same Time stream is conservatively denied; multi-Operations-tenant ownership is not established.

Transport route destination is pinned; legacy route.enabled controls the legacy sender and is intentionally not used as accepted ownership authority. Accepted delivery remains separately configured. No caller-provided Time identity, key, enrollment, automatic ingestion bootstrap, public port, service grant, migration or deployment is added. Policy/issuer setup remains an explicit separately authorized owner operation. Database owner is trusted.

The REST store accepts explicit head zero only with no publication/outbox at ANY revision. Validated FK links imply no reviews/proofs/markers without those parents. Missing head remains zero under validated FK constraints. Reads are not atomic: concurrent first publication is resolved by the authoritative expected-zero SQL CAS and bounded handler retry. Missing reports are never a zero-cost claim.

Install order (draft only): canonical donors and accepted provenance/issuer/transport/metadata/TEXT/caller isolation, then this bootstrap function, then compatible handler store. Existing caller read-mode wrapper permission must be staged before legacy-enabled handler deployment; flags alone do not supply revoked RPC privileges. All new bootstrap execution remains revoked from anon/authenticated/service_role. No actual setup or grant in this change.

Tests: local composed PGlite and exact module tests; dedicated fresh PostgreSQL17 workflow includes writer-first lock, bootstrap-first service denial and concurrent same-day bootstrap. Native proof pending publication; local PGlite is not native/hosted. Final hashes/results appended after independent review.

Final local freeze: product/test commits b1752b1e8 and 3432ccd4196ed4c1192a04fd3dfb43b5e56be02d. Independent Finance reviewer APPROVE; corrected final **60 composed PGlite checks PASS**, **84 TypeScript tests PASS**, handler dependency types PASS. The earlier alias-fixture assertion was corrected to seed a constrained publication under the derived stream; the expected evidence denial was not relaxed. One simultaneous author PGlite process exited137 before output; serialized independent final run completed successfully.

- SQL SHA256 `f6a3136941b4a5b86dc2211c1ca659895b6510947453e0e1dd40005dabecba09`.
- Store SHA256 `405ac5e867a9ce1ed38713d80081ed0b93d45c2116a8ea6cdb6a51db6f6ff08e`.
- SQL fixture SHA256 `f82e0dbc49bdb2c2b250e45cab5b95f892335e788058e7ef4fb63cfd429fc9ba`.
- Independent final log `/tmp/finance-review-bootstrap-60b.log`, SHA256 `f37cc7f5d12c9c0e5b47e4b4fbb50f547a18e44f50ee6ec274b81c2ab4f118f7`.

Native workflow is prepared for **64 checks** (60 composed + existing causal-metadata native case + three bootstrap physical cases). This is an expected count, not an executed result. Actual first-day mixed caller chain is being independently checked separately. No hosted/UI acceptance, policy provisioning or activation is established here.
