# Exact Node 24 extraction/executable evidence — source contract

Status: **unpublished, unrouted and not runtime evidence**.

This additive wrapper consumes exact captured bytes for the independently
reviewed Node 24 preparation source at SHA-256
`e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42`
and policy at SHA-256
`978007cda2664e5fccd1974b377b0cf35f35c33a0a2e3253f5685d2f92c1d8bd`.
It invokes only the captured source's policy parser and exact archive
validator/extractor. It never invokes its fetch function and never executes
Node, npm, a child process or a network operation.

The caller provides an already-open, owned, single-link, non-writable regular
FD for the exact `node-v24.21.0-linux-x64.tar.xz` archive at SHA-256
`fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`.
The wrapper hashes the held archive FD before extraction, after extraction and
again after receipt persistence. Full archive FD identity must remain exact.
An earlier fetch producer may create a mode-0600 file, but a future controller
must first finish and bind that producer, remove all write bits, reopen/capture
the exact archive FD, and only then call this wrapper. No ambient pathname or
ambient Node installation is accepted.

The caller also supplies an absolute canonical owned mode-0700 empty private
parent. The wrapper exclusively creates its fixed `node24-distribution`
directory, passes the held directory FD to the exact captured extractor, and
requires that its only top-level result is the exact
`node-v24.21.0-linux-x64` root. Extraction remains bounded by the captured
source: exact archive hash, at most 65,536 members, at most 402,653,184 expanded
bytes, no absolute/parent-escape paths, devices, FIFOs, sockets or hardlinks,
and only internal relative symlinks.

After extraction the wrapper opens the distribution root through no-follow
directory FDs. It derives the exact SHA-256, size and full held/path identity
of `bin/node` and `lib/node_modules/npm/bin/npm-cli.js`, and the full identity
and exact target of `bin/npm`. `bin/node` must be executable; all captured
regular leaves must be single-link, owned and group/other non-writable. The npm
link must target `../lib/node_modules/npm/bin/npm-cli.js`. Directory components
and leaf paths are checked before/after each held-FD read. All three artifacts
are independently reopened and re-read after receipt and directory fsyncs and
must equal their earlier evidence.

The canonical ASCII receipt
`compatible-full-app-node24-extraction-evidence.v1` includes exact preparation,
policy and archive hashes; held archive and distribution-root identities;
archive member/expanded-byte counts; derived Node/npm/link evidence; and
explicit `node_executed=false` and `runtime_admission=false`. It is written
once as an owned, single-link, mode-0600
`node24-extraction-evidence.json` with O_EXCL/O_NOFOLLOW, held-FD fsync/readback
and final FD/path identity checks. Distribution, extraction and private parent
directory FDs are fsynced. This is a bounded live snapshot, not an immutable
mount or release claim.

Failure is fail-closed and may leave an exclusive partial distribution or
receipt. This source has no deletion authority. A future controller must
discard the entire private attempt root under an independent cleanup deadline
before retry; it may not reuse or overwrite any partial attempt.

Local tests use a synthetic archive seam only. Genuine official archive
extraction, exact Node v24.21.0 execution/version evidence, exact npm 11.19.0
execution, CA derivation, static-server ownership, browser runtime, native
five-phase build, workflow and release remain open gates. `main()` always exits
78.
