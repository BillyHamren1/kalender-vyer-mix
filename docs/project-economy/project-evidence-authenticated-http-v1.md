# Isolated authenticated project-evidence HTTP proof

The new fixture exercises the actual public Catering v3 and saved scope evidence
RPCs over PostgREST with genuinely signed, authenticated fixture JWTs. It adds no
reader, calculator, product migration, provider request or production activation.
The fixture contains only synthetic identities and source documents.

`scripts/project-economy/operations-project-evidence-http-fixture.sql` requires
the exact disposable database `eventflow_project_evidence_http_runtime`, the
session setting `test.project_evidence_fixture=true`, and empty Catering,
received-invoice, manual-baseline and composition ledgers before mutations. The
root runner must independently verify a fresh local domain before installing the
audited bootstrap and exact ordered DDL closure. It must not run every historical
migration against guessed legacy tables. Root owns this manifest, runner, process
cleanup and workflow. Required baseline source is Operations d6e2281 and the
reviewed four-file scope follow-up ec98a30d145570afb455ee44a3e2851f3eee43e0.

The fixture invokes the actual native Catering publisher and invoice recipient
receiver, then actual authenticated scope enrollment, manual baseline, source
binding and composition commands. Saved facts are a preliminary Catering cost
of 52502 minor units, another stream with missing cost moved A→B→B, and a partial
manual estimate of 1000000 with unknown commitment. Its received supplier amount
540000 remains separate. No supplier amount is added to the manual estimate or
Catering cost. The Catering publisher and invoice receive enrollment finish
disabled; Catering outbox records remain parked. Saved upstream currentness is
unverified and complete cost coverage, EAC, budget and margin remain unavailable.

The isolated runner uses PostgreSQL 15.19, PostgREST 12.2.3 and Deno 2.8.1. The
canonical auth bootstrap supplies the real column shape and `auth.uid()` claim
lookup required by the product functions. PostgREST validates actual HS256
signatures and maps the verified role/subject to these synthetic rows. This is
native HTTP/database authorization evidence, not hosted Supabase Auth sign-in,
device-session or genuine provider-currentness evidence. Existing intercepted
browser/React DOM tests remain a separate proof layer.

The journey requires `CI=true`, `ISOLATED_PROJECT_EVIDENCE_HTTP=true`,
`PROJECT_EVIDENCE_DATABASE_NAME=eventflow_project_evidence_http_runtime`,
`PROJECT_EVIDENCE_POSTGREST_URL` and `PROJECT_EVIDENCE_CONTROL_URL` with bare
loopback HTTP origins, and two distinct ephemeral credentials of at least 32
UTF-8 bytes: `PROJECT_EVIDENCE_JWT_SECRET` and
`PROJECT_EVIDENCE_CONTROL_TOKEN`. No secret/token/source payload is logged. Every
production RPC request uses `role=authenticated`; no read request has a
service-role JWT or fixture-control header. Fixed control requests use only
`x-project-evidence-control-token`. Fetch redirects fail closed. Requests and
streamed responses have a 15-second deadline, 2 MiB byte cap and 4096-chunk cap.

Root-owned fixture controls must perform only these fixed operations against
the exact disposable database and synthetic identities, with one-row CAS where
appropriate. All POST bodies are exactly `{ "fixture": "project-evidence-http-v1" }`.
They must reject other methods, bodies, paths, callers, databases and tuples.
Controls never substitute an application reader or accept SQL/table/actor/org
parameters. A successful POST returns only `{ "status": "accepted",
"operation": "<exact-path>" }`.

| Path | Fixed operation |
|---|---|
| `GET /state` | Read actual database name and ledger row counts. |
| `POST /move-admin-org` | Compare admin ending009 profile org ending001, move to existing fixture org ending099. |
| `POST /restore-admin-org` | Compare the same profile org ending099, restore ending001. |
| `POST /delete-project-a` | Soft-delete only live project ending007 in org ending001. |
| `POST /revoke-admin` | Remove only admin ending009's admin role in org ending001. |

The state response has exactly `databaseName`, `cateringPublications`,
`cateringObservations`, `cateringOutbox`, `invoiceSnapshots`, `baselines` and
`compositions`. Initial counts are respectively 4, 4, 4, 1, 1 and 1. Final counts
must be unchanged. The two real grant/revoke commands append security evidence;
the fixed profile/role/project controls deliberately mutate disposable fixture
identity state. No official cost, provider document or customer billing command
is called, and unchanged evidence counts do not claim verification of omitted
legacy product tables.

The journey checks 15 cases: actual copies and ANY-history opaque withdrawal,
missing cost null, copied partial scope, no root fallback, missing project grant,
accepted scoped grant, exact accepted receipt-based revoke and denied reread,
foreign actor, wrong live-profile organization selector, missing/nonexistent
actor, tampered signature, live profile-org move/restore, deleted root, admin
role revocation and unchanged financial-evidence row counts. Current org comes
from the actual live profile, not a decorative JWT organization claim. Foreign
admin also reads its own empty namespace successfully so foreign denials cannot
be attributed to an invalid JWT. Complete-source/project coverage remains
unavailable regardless of authentication success.

Run the journey with `deno run --unstable-sloppy-imports --allow-env --allow-net`
and the exact owned source imports. Root narrows network permissions to the two
actual loopback ports in CI. It prints fixed case names and PASS/FAIL only.
Type checking is available independently of runtime. Native HTTP execution and
independent exact-head review remain required before this new proof is accepted.
