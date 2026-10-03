# Exact Node24 acquisition/route join — held-FD source contract

Status: **source-only join; launch, workflow, native runtime and release remain denied**.

This additive source closes one interface gap without starting Node, npm, a
browser or any child process. It consumes the exact captured Node preparation
source at SHA-256 `e24aee8b...`, an already completed held-archive acquisition,
the exact extraction receipt, held distribution/Node/npm FDs, and the first two
completed Node24 long-process receipts (`node-version`, then `npm-version`). It
emits bounded canonical Node and npm version/hash evidence plus the exact
`compatible-full-app-node24-executable-evidence.v1` bytes required by the
published static owner. Every emitted receipt keeps `runtime_admission:false`;
the joined route also keeps `launch_admitted:false`.

## Fixed private attempt and held inputs

The caller owns a mode-0700 parent and its one fixed child
`compatible-full-app-node24-route-attempt`. The join reopens that exact child
through the parent FD and accepts this closed layout only:

- `archive-acquisition/node-v24.21.0-linux-x64.tar.xz` and the canonical
  `compatible-full-app-node-archive-fetch-receipt.v1`;
- `node24-extraction/node24-extraction-evidence.json` and
  `node24-extraction/node24-distribution/node-v24.21.0-linux-x64`;
- `runner-journal`, containing complete base/supplemental receipts, stdout,
  empty stderr, owner and closed records for serial purposes 1 and 2.

Every caller FD is distinct and must equal the no-follow FD reopened from that
layout. The top-level layout is admitted by a streaming scan under that same
60-second deadline; allocation stops at the exact expected-entry count, before
an extra name can be retained. Archive, Node and npm bytes are fully rehashed
from their held FDs under the shared deadline. The fixed archive SHA is
`fd8e59d5...`; Node and npm
hashes and identities must equal the canonical extraction receipt. The npm
link is reopened and must target exactly
`../lib/node_modules/npm/bin/npm-cli.js`. The extraction receipt must retain
`node_executed:false` and `runtime_admission:false` and match every full
nine-field archive/distribution/tool identity. No pathname-only evidence and no
ambient Node or npm is accepted.

The acquisition receipt is accepted only as canonical duplicate-free ASCII
from the exact fixed URL, with zero redirects, disabled proxy discovery,
identity-bound byte count and SHA, and a lowercase bootstrap-CA hash. Its
producer source is not invoked by this join. Exact preparation bytes are
required at SHA-256 `e24aee8b...`; the join has no fetch or network primitive.

## Runner and owner mapping

Both version phases must carry the exact supplemental Node24 receipt, its exact
base receipt, matching immutable stdout/stderr artifacts, and matching
new-session owner/closed records. The join requires cleanup complete, the
frozen base adapter `96e827a5...`, origin guard `76714517...`, the same dynamic
policy/trust evidence hashes, the exact extracted Node/npm hashes, and literal
stdout `v24.21.0\n` / `11.19.0\n`. This validates caller-supplied runner
evidence; the join itself has no execution seam.

Four O_EXCL mode-0600 receipts are fsynced and rebound before return:

1. Node tool-version/hash evidence;
2. npm tool-version/hash evidence;
3. the static-owner executable evidence using adapter `100c5a67...`;
4. one route evidence record binding the acquisition receipt, extraction
   receipt, both tool receipts and owner mapping.

The route record explicitly keeps SDK routing, immutable-source binding,
writable-build-root/overlay binding, source-to-build derivation,
read-only-tree binding, launch and runtime admission false.

## Whole-attempt discard

Once the fixed attempt has been safely bound, any later validation or output
failure invokes a separate 15-second **non-destructive quarantine**. This source
contains no unlink or rmdir primitive. Linux `renameat2(RENAME_NOREPLACE)` moves
the fixed attempt name to the fixed sibling
`compatible-full-app-node24-route-attempt.discarded`; an existing quarantine is
never replaced. The caller's original attempt FD remains held. After the atomic
rename, only the directory ctime may advance relative to the immediately
captured pre-rename identity;
device, inode, owner, mode, link count, size and mtime must be unchanged. That
captured post-rename full identity must equal both a no-follow reopen and the
quarantine pathname, while the reusable attempt name must be absent. The exact
captured post identity is required stable through parent fsync. The immutable
object anchor must also equal the originally bound attempt even if this source
has already added a partial output before failure.

A failure before binding moves nothing. If a same-UID actor substitutes the
source immediately before the atomic rename, the replacement can at most be
moved intact into quarantine: the held-original identity mismatch raises
`cleanup_incomplete`, and neither the replacement nor the renamed original is
deleted. Tests exercise that race and prove the replacement marker survives.
Ordinary validation failures likewise retain the complete original attempt,
including hard links, under the quarantine name. Outer reviewed recovery must
inspect and remove that retained directory; this source never retries or
reuses it. A new attempt therefore requires a fresh private parent after
failure.

## Deliberately open gates

- The extraction/evidence source `6bdee40d...` and capture `f62fb1e3...` are
  canonical at Operations commit `16f37db9...` / tree `484be70b...`; no genuine
  held-archive extraction receipt has yet been produced by that source.
- Current exact809f materialization has no `scripts/` directory. The reviewed
  SDK placement uses `create=False` under `scripts/project-economy`, so this
  source does not mutate the exact 2,445-file root or pretend placement can
  succeed. A separately held and verified SDK package root/mount is required.
- The exact application source root must become a separately evidenced
  immutable input. It must **not** be used as the cwd for `npm ci` or the Vite
  build: those phases require a fresh, separately held and verified writable
  build root or governed overlay plus a receipt binding its derivation to the
  immutable source manifest/identity. Only the resulting `dist` is eligible for
  a later governed read-only transition. No such source-to-build derivation or
  writable-root receipt exists yet; a read-only-source receipt alone cannot
  admit npm/build.
- Exact live Node/npm runner receipts, CA export, the remaining native phases,
  static-server native positive, browser import/actor/cleanup, outer workflow
  and release evidence have not run.

Local tests use synthetic archive/tool bytes and prebuilt receipt fixtures.
They cover the successful false-admission join, false acquisition with intact
quarantine proof, substituted Node FD, runner-output mismatch, partial output
failure, bounded exact-layout denial, unexpected-layout FD non-leak,
unbound-attempt non-movement, hardlink retention, non-destructive top-level
rename/replacement detection, absence of unlink/rmdir authority, and the fixed
exit-78/no-process surface. They are support evidence only. `main()` always
exits 78.
