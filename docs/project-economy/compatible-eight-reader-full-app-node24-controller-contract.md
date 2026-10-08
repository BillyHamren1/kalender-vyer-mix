# Exact Node 24 full-App controller source contract

Status: **source candidate only; runtime, workflow and release admission remain
closed**.

This additive controller joins the independently reviewed Node 24 preparation,
long-process successor and CA exporter source boundaries without changing any
published source. It has no process-spawn, socket, download, Git, provider,
deployment or product-data authority. Its executable entry point always exits
78.

## Destructive-on-failure private-root rule

The materializer's caller must create a mode-0700, caller-owned private parent
containing exactly the fixed child `compatible-app-809f`. The controller pins
the parent FD, root FD and root identity before SDK placement. If any of the
three sequential O_EXCL SDK file placements raises for any reason, the
controller recursively removes only that still-FD-bound child and then removes
the child directory itself. Traversal is no-follow, owner checked, deadline
bounded and capped at 100,000 entries. Cleanup receives a fresh, independent
15-second reserve even when placement exhausted its execution deadline. The
original failure is re-raised only after discard succeeds; a failed or
incomplete discard instead denies all continuation.

No retry may reuse the unlinked FD, partial files, partial extraction, old root
path or any receipt derived from them. A retry requires a newly created private
materializer root with a new identity and must repeat acquisition,
materialization, SDK placement and all later gates from the beginning. This is
the mandatory controller obligation that compensates for sequential rather
than transactional placement.

## Exact evidence joins

The controller accepts caller-captured, size-bounded JSON bytes plus a distinct
expected SHA-256 for each input. Duplicate keys, non-finite JSON constants,
unknown keys, malformed hashes, missing phases and cross-input mismatches fail
closed. It joins:

1. `compatible-full-app-materializer-evidence.v1`, binding exact App manifest
   `4c6005bb...`, 2,445 files, 20,984,073 bytes and the materialized root
   identity;
2. `compatible-full-app-sdk-placement-receipt.v1`, binding the same root and
   exact reviewed three-file Node 24 SDK package
   `859cb4fbf12ddc4192e7ad21a29c25368accd7bee3111394c484d36714d08220`;
3. `compatible-full-app-read-only-tree-receipt.v1`, binding that same root,
   App manifest and SDK package, an exact tree manifest and `read_only=true`;
4. `compatible-full-app-kernel-egress-receipt.v1`, binding the exact Node
   archive, registry origin, TCP destination, DNS policy and raw-socket denial;
5. `compatible-full-app-node24-ca-export-receipt.v1`, binding the exact
   archive, Node hash/version, reviewed CA serializer hash, CA result and
   complete child cleanup;
6. exactly five ordered supplemental native receipts: `node-version`,
   `npm-version`, `npm-ci`, `sdk-unit`, `app-build`.

Each supplemental receipt must have a matching immutable mode-0600 base
receipt. The controller hashes the actual persisted base bytes and requires all
common fields to match. It reopens and hashes every bounded `.out` and `.err`
artifact and verifies each immutable owner/closed identity pair against the
receipt PID and start time. It also joins the runtime toolchain policy to the
kernel-egress receipt hash, CA result hash, Node hash, npm CLI hash and every
native phase. The returned summary deliberately keeps both
`runtime_admission` and `release_admission` false.

## Exact frozen source inputs

- Node 24 preparation:
  `e24aee8bfb3d8e0bdd5e9599a1cf7aa8d9f14227cce066c2a0fcd3b80d6d8c42`.
- Node 24 long-process successor:
  `7a3028e0650e1ba5f3751a893fe15cb8213e05ba90381b241eed3beb087245c8`.
- normalized effective-request origin guard:
  `767145176eb49355611612f883b85a60babe8bff11cd41e69b4ffca33589369a`.
- published base long-process adapter:
  `96e827a5e726656c459fdae5db74120282de63e1b7a89c31c0861a924e08a53c`.
- Node archive:
  `fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`.
- CA exporter source:
  `dad7e0cd6b352f899da2dc2a9a50069a478f1a866db7402207355a6699e8008b`;
  source capture `16a0644858cd8f1090a61f0b6ac96fd17d0811bcecab15a5f362a5310f7a602f`
  (independent review still required).

## Deliberately open gates

This candidate does not claim that any evidence producer exists or has run.
The current reviewed materializer does not emit the required materializer
receipt. The read-only tree and kernel-egress producers are not yet reviewed.
The Node executable result hash is not known. The CA exporter has not run under
the exact extracted Node FD, so no CA result hash is pinned. None of the five
native phases has run. No outer workflow routes this controller. Independent
source review, compatible producer implementations, actual Node 24 evidence,
failure-path evidence, exact workflow publication and release review are all
still required.
