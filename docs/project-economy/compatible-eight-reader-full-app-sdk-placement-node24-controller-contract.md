# Held-FD SDK placement and exact Node24 execution preflight

Status: **source-only placement; SDK producer provenance, npm, SDK execution,
build, dist, browser, product runtime and release remain unadmitted**.

This controller mutates only the separately derived writable build root. It
never mutates the immutable exact2445 source snapshot and never derives a
second execution root. The held build attempt/root and original canonical
`compatible-full-app-writable-build-root-evidence.v1` receipt are rebound to
their fixed parent paths. The controller loads the exact reviewed writable
producer source (SHA-256 `dd063d2f...`) and uses its manifest parser and
bounded full-tree scanner to prove the pre-placement 2,445-file source tree.

The separate SDK root is admitted only through the canonical
`compatible-full-app-sdk-root-evidence.v1` bytes, held receipt/root/file FDs,
fixed closed layout and package SHA-256
`540f52028b7f0adad9cb62853f1f396668cd6fee260995b75a09b4750f2d3e09`.
The three source files are independently rehashed and rebound. Placement uses
exclusive creation under newly created owner-only `scripts/project-economy`
directories. Destinations are mode `0600`, fsynced, held, rehashed and joined
to the original App manifest. A second complete full-tree scan proves the
exact 2,445 original files plus exactly these three SDK files and no other
entry. Source and destination FDs remain held through final checks.

Any failure after attempt custody is established performs no unlink, rmdir or
recursive cleanup. It atomically renames the whole exact attempt with Linux
`RENAME_NOREPLACE` to the fixed `.sdk-placement-discarded` quarantine. The
held/path identity is checked immediately before rename; only ctime may advance
across the rename; the held, reopened and path identities must then stay exact
through parent fsync. Substitution or uncertain quarantine is
`quarantine_incomplete`, never reusable success. Partial files and receipts are
retained for the outer recovery policy.

## Exact Node24 preflight, not execution

The controller also binds canonical Node extraction evidence, held
distribution/Node/npm FDs and distribution-relative paths. It requires exact
Node `v24.21.0`, npm `11.19.0`, archive/preparation/policy hashes, executable
Node identity/hash, non-executable npm CLI identity/hash and the exact npm
symlink. It additionally source-pins the reviewed Node24 runner
(`7a3028e0...`) and base runner (`96e827a...`). The receipt fixes the future
cwd identity, purpose `sdk-unit` and additive Node24 SDK test path.

No child is started here. This is deliberate: the reviewed base long-process
receipt does not yet prove that `npm ci` ran against this exact post-placement
cwd or authenticate the complete installed tree, and npm may legitimately
change the writable-root identity. Therefore `node_executed`,
`npm_ci_admitted`, `sdk_unit_admitted`, `app_build_admitted`,
`post_build_dist_verification` and `runtime_admission` are all false. A later
reviewed execution join must use the same held build-root FD, bind pre/post cwd
identities, preserve exact Node/npm/CA/egress/process custody, prove ordered
node-version/npm-version/npm-ci/SDK receipts, require the fixed SDK PASS line
and empty stderr, and quarantine the whole attempt on any uncertainty.

The placement receipt also keeps `sdk_root_producer_provenance=false`: exact
custody does not establish how the separate root was acquired. No provider,
authentication, database, invoice, approval, payment, deployment or release
action is authorized. The CLI prints a fixed HOLD line and exits 78.
