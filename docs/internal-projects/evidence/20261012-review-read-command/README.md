# Public review/read command evidence

Frozen author harness38e3f45 and independent rerun. Read REVIEW_READ_ACCEPTANCE.md and INDEPENDENT_REVIEW.md for result/boundaries. This archive contains only harnesses, hashes and synthetic logs; private Finance/WMS product SQL is not copied.

DEPENDENCY_BLOBS.json pins62 sources to genuine Operations5a333, Finance28fec and Timeadae commits plus the separately pinned genuine invoice DDL. Historical author provenance retained unchanged; this normalized manifest resolves Time commit/tree ambiguity. prepare-reproduction.py can materialize exact dependencies from authorized local Git repositories into a new external disposable directory; it verifies every byte before writing and performs no network/auth operation. Run its --help for required repositories.

After installing pinned PGlite0.5.9/TypeScript5.6.3 in a disposable dependency directory, run from output/operations with ACCEPTED_FIRST_DAY=1, FINANCE_SOURCE_ROOT=../finance, FINANCE_METADATA_SOURCE_ROOT=../financeMetadata, TEXT_BOOKING_SOURCE_ROOT=../text, TIME_SOURCE_ROOT=../time and NODE_PATH pointing to those dependencies; execute ../harness/acceptance-runtime.mjs. No deployment, activation or live financial action is authorized by this archive.
