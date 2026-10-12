# Combined metadata protocol verification

Independent reviewer: `/root/publish_catering`, 2026-10-12.

The test executes actual Operations classification, atomic creation, metadata capture and delivery migrations in one isolated PGlite database; actual Finance core authorization, classification, close guard and receiver migration in another. It runs the actual sender and receiver Edge handler sources with only the network/client plumbing substituted by local calls. Actual WebCrypto HMAC, PostgreSQL JSONB fingerprint verification, receipt transaction and signed acknowledgement processing are preserved. No external HTTP, real key, live data or deployed endpoint is used.

Result: **12 checks PASS** (5 enrollment and 7 combined-chain checks). The chain proves default-empty enrollment makes zero HTTP calls; actual producer fingerprint survives cross-runtime delivery; lost response after Finance commit retries with one receipt and unchanged budget; signed ACK finalizes the original delivery; completed receipt is not resent; raw-body tamper fails; correctly signed foreign source fails mapping; zero canonical cost events are created.

## Reproduce

Use Node 24, PGlite 0.5.9 (with contrib pgcrypto), and TypeScript accessible through ordinary Node resolution or NODE_PATH. Both environment paths must be local genuine reviewed sources, including their new metadata files.

```sh
FINANCE_SOURCE_ROOT=/absolute/path/to/finance \
OPERATIONS_SOURCE_ROOT=/absolute/path/to/operations \
NODE_PATH=/absolute/path/to/isolated/node_modules \
node scripts/internal-projects/metadata-chain-runtime.mjs
```

Reviewed Operations commit `f0736c5c2`; Finance commit `45ef5b2`. ACK schema includes destination explicitly (eight keys). Metadata is not accepted cost coverage and does not unlock financial close. Issuer keys, tenant allowlists, exact source enrollment and approved starting revisions remain empty/default-off pending controlled activation. Hosted deployment, multi-session concurrency and authenticated UI are not proven by this harness.

## Exact tested source hashes

- Operations `handler.ts`: `13e199bbccb2a7a1e4c26d0544a076475bfc4137a212a6b19987f6351a444187`
- Operations `20261012155516_internal_project_metadata_delivery.sql`: `4692572169587595291e281c6a858e8d65933cbe625b9d6c9577b6a733f76a31`
- Operations `20261012150947_internal_project_metadata_outbox.sql`: `31dede4f10e4f35d693db3cfeef37c89b7255a4b5492fd07c862b11cf74fcd79`
- Finance `index.ts`: `a6aea6deda93e001183a5757328ea01ee6d9323292ccb0dc40ff0969de65ff36`
- Finance `operations-project-metadata-contract.ts`: `31ec8a5d06c250bb99b19a3dd02ec3216913f63e810e796b1a90c635ba549147`
- Finance `20261012155253_finance_operations_metadata_receiver_v1.sql`: `9281f6452689c298ce04cd5a3aed09571cd6ef6a916026f2db84c4cc73e92313`
