# Exact full-App long-process custody — source contract

Status: **source-only candidate; unrouted; no install, test, build, preview, or release claim**.

This contract bounds the future native-Linux execution of the already reviewed
exact full-App source. It does not authorize a workflow and it does not select a
Node distribution, npm distribution, registry, proxy, redirect, CA, or cache
policy.

## Frozen inputs and exclusions

- The process-custody kernel remains byte-for-byte frozen at SHA-256
  `b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a`.
  This adapter calls its `/proc` identity, WNOWAIT observation, pidfd-owned
  signalling, live process-group scan, and irreversible single-reap primitives;
  it does not modify or replace that kernel.
- Exact App source remains commit
  `809f64e0fd98322c53d9c4e9697df5b515303812`, tree
  `3d96301591652f9d86ccbbdf8ff26efcb7180ce9`, manifest SHA-256
  `4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434`,
  2,445 files and 20,984,073 bytes. Source acquisition/materialization custody
  remains outside this adapter.
- The adapter grants no Git, GitHub, network, browser, provider, database,
  Finance, export, admission, preview, release, or product authority.
- It accepts no shell text and has no executable CLI route. `main()` is a fixed
  exit-78 refusal.

## Exact finite purposes

Only the following order and argument vectors exist. A future root controller
must prove the serial order without skips; this source alone is not that
controller.

| Serial | Purpose | Exact vector shape | Execution budget | stdout/stderr cap |
|---:|---|---|---:|---:|
| 1 | `node-version` | captured Node FD, `--version` | 10 s | 64 KiB each |
| 2 | `npm-version` | captured Node FD, captured npm CLI FD, `--version` | 10 s | 64 KiB each |
| 3 | `npm-ci` | captured Node FD, captured npm CLI FD, `ci` | 600 s | 8 MiB each |
| 4 | `sdk-unit` | captured Node FD, exact SDK relative path | 60 s | 1 MiB each |
| 5 | `app-build` | captured Node FD, captured npm CLI FD, `run`, `build` | 300 s | 8 MiB each |

Every purpose has an additional, separate 15-second cleanup reserve. The
success path must observe a zero exit while the leader is still unreaped, prove
that the source-directory FD identity is unchanged, complete the frozen
kernel's no-live-member scan and one-way reap, write an immutable closed
companion, and only then write a success receipt. No timeout or failure path may
produce a success receipt.

## Required caller-locked inputs

The caller must supply the exact bytes and SHA-256 of a descriptor conforming to
`compatible-full-app-toolchain-policy.v1`. Duplicate or unknown JSON members
are rejected. The descriptor must name:

- exact Node 22 patch version and exact Node executable SHA-256;
- exact npm CLI version and exact npm CLI entry SHA-256;
- exact HTTPS registry origin;
- exact CA-file SHA-256;
- explicit proxy, redirect, and cache-policy declarations; and
- SHA-256 of the independent evidence supporting that trust policy.

Parsing this descriptor proves only byte custody and schema conformance. It is
**not approval** of the named toolchain or npm trust policy. No exact Node 22
patch, npm version, registry/proxy/redirect policy, CA, or cache policy is
selected by this candidate. Until those bytes are independently sourced and
reviewed, `npm-ci` and every downstream phase remain blocked.

The future caller must open Node, npm CLI, and the CA file with no-follow
semantics and keep those FDs alive through the child. Before every purpose, the
adapter itself hashes the passed FDs against the caller-locked descriptor,
checks stable metadata, ownership, link count and modes, and repeats FD identity
checks before cleanup. npm CLI's imported distribution tree and any Node lookup
performed by lifecycle scripts must still be covered by that future reviewed
toolchain source contract; pinning only the entry file is not sufficient to
claim a trusted npm runtime.

## FD and environment boundary

- The materialized source, state, and journal directories arrive as already
  opened directory FDs. Each must be owned by the effective user/group and mode
  `0700`.
- Child cwd is `/proc/self/fd/<source-fd>`; stdin is `/dev/null`.
- stdout, stderr, and pre-exec owner evidence are exclusive no-follow files of
  mode `0600` in the private journal directory. RLIMIT_FSIZE and post-run size
  checks bound the output files.
- The environment is built from an exact allowlist and never copied from the
  host. HOME and npm cache resolve below the private state FD. The only App
  build flags are the three reviewed Operations evidence flags, each exactly
  `true`.
- HOME/cache directory creation and any cache seed are future caller-owned
  operations. They must be fresh/private or separately evidence-backed exactly
  as the reviewed descriptor declares.

## Still-open integration gates

1. Independent source review of this adapter, tests, contract, and their exact
   capture.
2. A source-backed exact Node/npm distribution and npm registry/CA/proxy/
   redirect/cache policy. Ambient runner defaults are forbidden.
3. A reviewed way to place the SDK shape test into the materialized source
   boundary. The exact 2,445-file App manifest does not contain this test, so
   the adapter must not improvise an injection.
4. A new root workflow/controller that captures this source exactly, verifies
   serial no-skip receipts, proves clean Git before and after, and pins exact
   Node/npm versions. No existing workflow may be edited for this candidate.
5. Native Linux runtime evidence for success, nonzero exit, timeout, output
   overflow, owner-record failure, descendant survival attempt, signal race,
   and cleanup-reserve exhaustion. Local support/negative unit tests are not
   that evidence.
6. Only after the preceding gates: unchanged `npm ci`, SDK Node test, and
   `npm run build` against the exact materialized source. A green result would
   still not authorize browser/provider testing or release.

The candidate is therefore useful only as a finite custody primitive. It makes
no claim that dependency installation or the App build has been attempted.
