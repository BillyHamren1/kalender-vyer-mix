# Exact Node 24.21 SDK shape successor — source contract

Status: **source-only successor; placement, npm, build and native acceptance
remain denied**.

This additive `.mjs` is an exact four-replacement successor of the reviewed
Operations SDK shape source at SHA-256 `03a96740...`. It preserves the complete
source-manifest/body verification, package-lock and installed Supabase 2.116.0
checks, nine fixed service calls, 403-only adapter response, diagnostic
suppression, owned Vite middleware shutdown and final source revalidation. It
changes only:

1. the descriptive first comment;
2. the Node admission from major 22 to exact `process.version === 'v24.21.0'`;
3. the fixed FAIL label;
4. the fixed PASS label, which now includes exact Node v24.21.0.

The exact-version check deliberately does not accept ambient Node 24, a major
range or a future patch. It aligns the source-unit phase with the separately
reviewed Node archive/extraction/acquisition route. It does not claim that the
source has run under that archive.

## Required future placement and execution

The exact809f source snapshot has no `scripts/` directory and remains
immutable. A future independently reviewed SDK package producer must capture
this successor plus the unchanged SDK reader and GET adapter through held FDs,
then place or mount them into the **derived writable build root**, never the
immutable source root. That receipt must bind the SOURCE-ACKed writable-root
evidence, exact three file hashes and post-placement root identity.

Only after an owned `npm ci` receipt proves the exact held writable root and
Node/npm identities may an owned long-process phase run this source. The
positive phase must bind exact Node v24.21.0, CI=true, fresh installed lock
closure, fixed stdout, empty stderr, process ownership/start time and complete
cleanup. The later App build uses a separate serial receipt. No success from
ambient Node or a synthetic source tree is acceptance.

## Safety retained from the predecessor

The source still replaces global fetch before Vite/service loading, forwards
only nine fixed GET shapes to a caller-local 403 refusal adapter, suppresses
diagnostics, rejects credentials and treats the anonymous SDK token only as a
shape binding. It does not create a user/session, authenticate a fixture actor,
write provider/product data, invoice, approve, pay, deploy, publish or admit
rendered App behavior. Timeout or uncertain teardown suppresses PASS.

Local Python controls reconstruct the entire successor from the exact
predecessor and four literal replacements, verify all fixed source/lock/denial
literals, and run a real negative under the available non-24.21 Node binary.
That negative must emit only the fixed FAIL line and exit 1 before positive
imports. It is not the required exact24.21 positive.
