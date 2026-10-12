> Archived evidence from local test commit `8a952cf67c897cf7011ddd95990631e406718dfa`. This preserves the exact recorded candidate hashes; it is not a rerun of later published heads. Run this archived harness with explicit absolute `OPERATIONS_SOURCE_ROOT` and `FINANCE_SOURCE_ROOT` and its recorded dependencies.

# Accepted personnel cost chain — independent composition

This is a test/evidence directory, not product code or a deployable integration.
`accepted-chain-runtime.mjs` composes the actual candidate modules and SQL from
the Operations and Finance recovery checkouts. Nothing is sent outside the process.

Run from the shared workspace root:

```sh
NODE_PATH=/tmp/operations-recovery-deps/node_modules node recovery-cost-chain/accepted-chain-runtime.mjs
```

Optional absolute `OPERATIONS_SOURCE_ROOT` and `FINANCE_SOURCE_ROOT` select the
reviewed source checkouts. The checked dependency is PGlite 0.5.9 and the Operations
locked TypeScript transpiler. Source paths and SHA-256 values are written to
`SOURCE_MANIFEST.json` only if all assertions pass and the candidate files remained
unchanged during execution. A changing candidate requires a clean rerun.

## What executes

1. The existing Operations accepted-rate/review/issuer fixture executes unchanged,
   including its negative assertions. A test-only exact text hook keeps its
   disposable database open until composition finishes. Snapshots are calculated
   by actual Operations code from synthetic Time fixtures and issued by actual
   private SQL. No fabricated accepted-reference row is inserted by this harness.
2. Finance loads actual canonical schema fragments, snapshot storage, bound-read
   ingestion, metadata receiver, and accepted receipt candidate SQL. Missing schema
   prerequisites are explicit synthetic columns/constraint, not replacement cost
   or transport functions. A synthetic Finance admin enrolls disposable projects;
   the actual signed metadata SQL establishes their source bindings.
3. Actual Operations accepted claim leases the first eligible issued outbox row.
   Actual TS transport signs its frozen raw envelope. An in-memory HTTP adapter
   invokes actual Finance Edge validation, then the actual SQL receive function.
   Actual Finance signed acknowledgement is verified by the sender and by actual
   Operations finish SQL. No source file is changed by the harness.

## Assertions

- Earliest accepted revision claimed; its later revision remains blocked while leased.
- Transient Finance receive failure returns HTTP 503 and retries without creating a receipt.
- Full source stream commits exactly once despite an invalid ACK, lost committed
  response and a fresh-nonce retry; exact receipt is reused.
- Source membership, line identity, status and minor-unit amount are preserved.
- Raw-byte tampering, correctly signed wrong source/destination tenants and wrong
  epoch are denied before the Finance SQL port.
- An existing exact shadow snapshot cannot be promoted by accepted delivery.
- All stages create **zero canonical cost events**. Receipt acceptance is not a
  Finance actor command or financial posting.

## Limits

This is sequential synthetic PGlite plus actual TS handlers with an in-memory HTTP
adapter. It proves neither physical PostgreSQL concurrency nor hosted authentication,
deployed credentials/enrollment, real Time API provenance, activation, trusted total
coverage or financial closure. The explicit Finance actor apply/withdrawal transaction
has its own independent test suite and is not invoked here. No hosted mutation,
customer record, invoice, payment or approval occurs. Product candidates remain dormant.

Two integration defects found and corrected by the product authors: the sender and
issuer now share the receiver's 524288-byte limit; transient receiver errors now
return HTTP 503 rather than permanent HTTP 422. Final candidate hashes identify
the exact tested bytes. Metadata and accepted-delivery signing keys are distinct
disposable fixture values.

## Recorded result

Final local execution: **45 issuer regression checks and 11 composition checks PASS**,
exit 0. `result.log` contains the complete successful output; `SOURCE_MANIFEST.json`
records the six frozen product candidate files checked before and after execution.
The Operations candidate is local commit `f6cafb6debe727c6b3ca44287625f3bd8331d444`.
The manifest's published bases identify source lineage, not activation or approval.

Reproduction requires the complete reviewed Operations and Finance source checkouts,
not just the six candidate files. Operations dependencies include its accepted-rate
fixture, issuer fixture, personnel calculation/store modules, review issuance helper,
classification/bootstrap SQL and personnel migrations. Finance dependencies include
core/command/security migrations, signed metadata migration, and the two canonical
shadow/bound-read migrations under `accepted-cost-sources`. No Finance product code
is copied into this evidence directory. Leave `INTERNAL_PROJECTS_TEST_DSN` and
`PERSONNEL_ACCEPTED_TRANSPORT_TEST` unset for the recorded isolated composition.

## Published-source rerun

Root independently reran the unchanged harness against reviewed Operations transport
`4ce826322dc703da64f7439abc739481487cac09` and Finance accepted receipt
`603b8ad035b1fdf54b748e9b58555afd0a022ab0`: **45 issuer + 11 composition PASS**, exit0.
`PUBLISHED_HEADS_20261012.json` records the six source hashes and
`published-heads-result.txt` records output. This covers the final receiver body deadline
addition. It does not exercise the later Operations project-review descendant or the
under-development customer/v2 protocol. Existing isolated-schema and no-hosted limits apply.
