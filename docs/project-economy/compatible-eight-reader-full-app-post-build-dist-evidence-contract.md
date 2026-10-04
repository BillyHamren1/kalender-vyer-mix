# Post-build dist custody and manifest evidence — source-only contract

Status: **source-only; no genuine build, dist, browser, runtime, workflow, or release evidence**.

This additive producer verifies one already-existing `dist` directory inside a
separately derived writable build root. It does not create or copy that root,
run `npm ci`, run the application build, place or assume an SDK, fetch bytes,
change permissions, remove/quarantine an attempt, serve files, launch a browser,
or authorize a release.

## Input boundary

The caller supplies three distinct held inputs:

1. the existing derived writable build-root directory FD;
2. a private mode-0700 evidence-directory FD; and
3. a held, owned, single-link, non-writable regular-file FD containing canonical,
   duplicate-free bytes using exact schema
   `compatible-full-app-writable-build-root-evidence.v1`.

The schema and exact key set match the independently source/route-reviewed
producer published at Operations commit `8e83f41965fd6153b665a12d95791e592c00b16a`,
source SHA-256 `dd063d2fd138dea08bae107a73bb81704fc9f129b3ea7f63e210bb9df0062c8d`
and Git blob `04845860fb40b586cf6657f4076d5534f219fdc0`. No genuine receipt from that
producer is claimed here. The receipt must bind the
exact809f immutable source manifest/tree, 2,445 files, 20,984,073 bytes, 220
directories, source purpose `immutable_source_snapshot_only`, build purpose
`derived_writable_build_root`, distinct roots and a complete source join. Its
SDK, npm, build, post-build-dist and runtime admission fields must all remain
false. The receipt FD is fully read and identity-checked before use, cannot be
one of the observed dist members, then is fully reread and identity-checked
after all output persistence.

The receipt records the build root before npm/build can legitimately change its
directory link count, size, mtime and ctime. The verifier therefore joins the
held post-build root to the receipt only through exact device, inode, owner,
group and mode, requires both identities to be directories with valid link
counts, and requires nondecreasing ctime. It then captures the current full
nine-field identity and holds that exact identity unchanged for the complete
verification attempt. This is a same-inode custody join, not build-execution
provenance.

## Bounded held-FD scan

`dist` is opened relative to the held build-root FD with `O_NOFOLLOW` and
`O_DIRECTORY`. Every descendant is opened relative to its already-held parent,
with pre-open, held-FD, pathname and post-read full identity equality. The scan
is streaming and globally bounded by:

- 180 seconds shared across all passes and persistence;
- 4,096 entries, depth 16 and 1,024 UTF-8 path bytes;
- 16 MiB per regular file and 64 MiB total body bytes;
- one 1 MiB canonical manifest maximum.

Hidden names, malformed names, symlinks, hard-linked files, special files,
group/other-writable nodes, executable files, unsupported static suffixes and
unexpected ownership fail closed. Exact `index.html` and directory `assets`
must exist. File bodies are streamed from held FDs in bounded chunks and bound
to byte count and SHA-256. The complete sorted manifest is scanned twice before
persistence and once after manifest persistence; all rows, body hashes, full
node identities, dist-root identity and projection hash must remain identical.

## Durable evidence and failure semantics

The producer creates, in order, fixed mode-0600 `O_EXCL` files:

1. `post-build-dist-evidence.started.json`;
2. `post-build-dist-manifest.json`;
3. `post-build-dist-evidence.json`.

Each file is fsynced, rebound through a no-follow read FD, read back exactly and
followed by an evidence-directory fsync. Existing names are never replaced.
Failures retain any partial evidence for inspection; the source has no unlink,
rename, chmod, process or network authority and performs no destructive cleanup.

The final receipt binds the exact derived receipt hash, immutable-source receipt
hash, the producer's complete-tree identity digest, a distinct current-root
identity digest, current build-root and dist identities, manifest body hash and
projection, counts and total bytes. It explicitly records:

- `build_execution_provenance:false`;
- `sdk_routing:false`;
- `dist_read_only_transition:false`;
- `static_server_admission:false`;
- `browser_admission:false`;
- `runtime_admission:false`; and
- `destructive_cleanup:false`.

Thus a valid synthetic receipt proves only bounded stable custody of the
observed `dist` snapshot. A reviewed build controller must separately bind real
npm/build receipts and cwd identity. A later governed transition must make the
verified dist tree read-only before static serving. Native Node 24 execution,
browser import/launch, outer workflow and release evidence all remain open.

Local tests exercise a successful synthetic three-pass snapshot, strict receipt
decoding and root join, symlink/hidden/hardlink/FIFO/suffix rejection,
writable/executable rejection, global entry/byte caps, missing mandatory nodes,
receipt-in-dist rejection, receipt/file mutation, whole-dist replacement,
exclusive evidence names, finite
deadline, fixed exit 78 and absence of mutation/process/network primitives.
They are support evidence only.
