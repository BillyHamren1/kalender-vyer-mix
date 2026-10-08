# Held-root Node24 npm/SDK execution join

Status: **source-only and deliberately unrouted**. The current source always
denies before `Popen` because no reviewed active kernel-egress enforcer is yet
bound to the build attempt and child lineage. It therefore provides no native
execution, npm, SDK, app-build, product-runtime or release evidence by itself.

## Fixed input join

The future route consumes the exact post-placement writable attempt produced
at Operations commit `b6449cc43c46176e842cc6c891dd609fdcd44579` / tree
`038e81fb51f61062c103711f4823435c4dd2f6d4`. The attempt FD, writable-root FD,
original writable receipt FD, placement receipt FD and all three placed SDK
destination FDs remain held. The controller requires the placement source
SHA-256 `965c801b...`, writable producer `dd063d2f...`, exact App manifest
`4c6005bb...`, exact Node24 SDK path/hash and the two other SDK files. It runs
the reviewed writable scanner before any future process, proving the original
2,445 files plus exactly the three placed files and matching the placement
tree-identity digest.

The Node distribution is bound through the canonical extraction receipt,
distribution/Node/npm FDs, archive `fd8e59d5...`, preparation `e24aee8b...`,
policy `978007cd...`, Node `v24.21.0` and npm `11.19.0`. The exact Node24
runner `7a3028e0...`, frozen base runner `96e827a5...` and origin guard
`76714517...` are source pinned. The execution join does **not** use the older
runner's `command_for`: its fixed SDK argv selects only
`scripts/project-economy/compatible-eight-reader-full-app-sdk-shape-test-node24.mjs`.
Mutation to the old Node22 filename is fail-closed and tested.

CA bytes are not accepted merely because a caller policy names their hash.
The held CA FD is joined to a held canonical
`compatible-full-app-node24-ca-export-receipt.v1`, exact reviewed exporter
source `dad7e0cd...`, capture `16a06448...`, exact Node hash/version, exporter
script `eabddb52...`, CA byte count/hash/certificate count and
`cleanup_complete=true`. The held CA journal is exact: empty held stderr,
canonical owner and exporter-closed records with matching PID/starttime/PGID/SID,
and the exact receipt path/FD bytes. No caller-only CA/policy pair is enough.

## Future four-phase boundary

After an active egress successor is reviewed, the fixed order is:

1. exact Node version output;
2. exact npm version output;
3. genuine `npm ci` in the same held post-placement writable root;
4. the exact Node24 SDK shape unit in that same root.

Every phase uses argv without shell, exact FD-backed Node/npm/CA/guard inputs,
an owner-only state directory, a held journal directory, bounded output and a
deadline. The npm phase may legitimately change root mtime/ctime/size, but the
same root inode/owner/mode/link anchor is required. A bounded FD/openat scan
then hashes the complete installed tree (including internal-only symlinks),
and all original 2,445 files plus all three SDK files are independently
reopened and rehashed. The SDK phase must emit exactly one fixed PASS line and
zero stderr. Its post-tree and original-source hashes are recorded. App build
is not part of this controller.

Immediately after `Popen` returns, the original child and held out/err/owner
handles enter both custody `UNCERTAIN_CHILDREN` and a strong local pending
record before owner parsing. Successful phases require captured PID,
starttime, PGID and SID, verified stop/reap, held-FD output reads, owner/closed
agreement and durable phase receipt rebinding. The final journal inventory is
exactly rebound before any aggregate receipt.

If owner parsing fails, the source deliberately unwinds with the original
child and handles still retained. `recover_pending` uses only that retained
Popen child, custody object and original held handles; it never reopens or
adopts pathname replacements. Pending state clears only after verified
stop/reap, held-artifact hashing and a durable recovery-closed receipt.
Failure or ambiguity keeps pending custody. Whole-attempt quarantine is
permitted only after pending custody is empty; quarantine is the reviewed
non-destructive `RENAME_NOREPLACE` operation, never unlink/rmdir cleanup.

## Explicit active-egress hold

The existing `compatible-full-app-kernel-egress-receipt.v1` is accepted only
as preparatory metadata. It is replayable and has no live attempt/root,
network-namespace, cgroup or child PID/starttime binding. The JS origin guard
is not raw-socket/process confinement. `_active_egress_gate` therefore always
raises before state-directory mutation or process launch. Publication of this
source must not be described as npm, SDK or native runtime proof. A later
reviewed active enforcer must bind the same held attempt/root and every child
lineage for its full lifecycle before the fixed four-phase body can be routed.

The CLI prints a fixed HOLD line and exits 78. Provider login, authentication,
database operations, invoice/approval/payment actions, browser launch,
deployment and release are outside this source.
