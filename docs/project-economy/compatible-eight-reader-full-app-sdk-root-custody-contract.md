# Separate SDK-root custody — source contract

Status: **source-only custody; placement and every execution admission remain
false**.

This verifier accepts only caller-held file descriptors for a fixed private
parent, its fixed read-only SDK root and each of three exact SDK source files.
The root has one closed layout: `scripts/project-economy/` and the additive
exact-Node-v24.21.0 shape test, unchanged SDK reader and unchanged refusal GET
adapter. The parent is mode `0700`, the SDK root/directories are `0500`, files
are owner-only `0400`, single-link regular files, and all objects are owned by
the current effective user/group.

Every directory inventory is streamed under one finite deadline and an exact
entry cap. Every file is independently opened with `O_NOFOLLOW`, bound to the
caller FD and pathname identity, bounded, positionally hashed, and rebound at
the end while all verification FDs remain held. Symlinks, hardlinks, extra or
missing entries, changed identity, wrong mode, wrong owner, wrong content and
a pre-existing receipt are denied.

The verifier creates exactly one sibling `0600`, `O_EXCL` receipt in the
private parent. Its canonical ASCII JSON binds source commit/tree, the exact
App manifest, exact Node v24.21.0, root identity, all three file identities,
hashes and byte counts, and fixed deterministic package-manifest SHA-256
`540f52028b7f0adad9cb62853f1f396668cd6fee260995b75a09b4750f2d3e09`. The held
receipt and pathname are rebound after file and parent fsync, and a fresh
close-on-exec duplicate of that exact receipt FD is returned to the caller. A failure after
exclusive creation deliberately retains the partial/non-admitting receipt;
this source has no deletion authority and the caller must quarantine/discard
the whole private parent through a separately reviewed custody controller.

The receipt explicitly says `placement_to_writable_build_root=false`,
`sdk_unit_admitted=false`, `npm_install_admitted=false`,
`app_build_admitted=false` and `runtime_admission=false`. This root is separate
custody only. It must never be merged into the immutable exact2445 source
snapshot, which has no `scripts/` directory.

## Future join still required

A later independently reviewed placement or mount controller must consume the
canonical SDK-root receipt and held root/file FDs together with the canonical
`compatible-full-app-writable-build-root-evidence.v1` receipt and held writable
root. It must use exclusive destination creation, rehash source and
destination, bind the post-placement writable-root identity, retain or
quarantine every uncertain attempt, and emit a new non-ambient placement
receipt. Only an owned exact-Node-v24.21.0 long-process phase may then select
the additive Node24 test. The old Node22 test and its contract remain
unchanged.

This verifier starts no process, performs no network request, reads no ambient
executable, authenticates no actor, mutates no provider, and grants no npm,
SDK, build, browser, deployment, release or product-runtime authority. The CLI
entrypoint exits 78 because the held-FD caller is intentionally absent.
