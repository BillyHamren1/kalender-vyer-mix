# Exact809f held-FD materializer evidence — source contract v2

Status: **unpublished and unrouted; local support/negative tests only**.

This additive source emits only the five-field
`compatible-full-app-materializer-evidence.v1` required by the staged Node 24
controller. It accepts exact captured bytes for the frozen source verifier at
SHA-256
`5115410dc3cec00451f4e39aff0c72e8032d034cff2ac4cfb763471bfa952c9d`
and the complete App manifest at SHA-256
`4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434`.
The exact result is commit `809f64e0...`, tree `3d963015...`, 2,445 files,
20,984,073 bytes, with both build/admission flags false.

The caller supplies an absolute, canonical, owned mode-0700 private parent.
The producer opens that directory and its fixed mode-0700
`compatible-app-809f` child with no-follow directory FDs and binds their full
FD/path identities. Verification never calls the frozen verifier's path-based
`verify()` entrypoint. Instead, it parses the exact pinned manifest and invokes
the exact captured verifier's `leaf(root_fd, ...)`, `inventory(root_fd, ...)`,
`selected`, `identity` and 45-second `Deadline` primitives while retaining the
original root FD. Every selected leaf is read through directory FDs and checked
against its exact Git blob SHA-1 and byte count; the bounded FD traversal must
equal the complete 2,445-file manifest and exact total. Root FD identity is
checked before and after traversal.

This held-FD route closes the rejected pathname ABA design. A same-UID writer
may temporarily replace the parent-relative root pathname and swap the original
name back, but it cannot redirect `leaf()` or `inventory()` away from the
already-open root FD. The adversarial local test performs that swap-to-
replacement/swap-back sequence and proves the verifier still reads the
original inode and original bytes. Independent path continuity and full root FD
identity checks remain required before receipt persistence and after parent
fsync; a path substitution that is still present is denied.

The evidence is canonical ASCII JSON written once as an owned, single-link,
mode-0600 `materializer-evidence.json` in the private parent. Creation is
O_EXCL/O_NOFOLLOW; the held read/write FD is fsynced and read back, and its full
identity must equal the parent-relative pathname. The parent is fsynced. Only
expected parent timestamp/size changes are tolerated: device, inode,
owner/GID, mode and link count remain bound. Root FD/path and receipt FD/path
identities remain exact after persistence. A pre-existing receipt is never
overwritten.

Any verification, persistence or final-binding failure is fail-closed and can
leave private recovery material, including an exclusive partial/replaced
receipt. The future controller must discard the entire exact FD-bound
materialized root and its private attempt directory before retry; it may never
overwrite or reuse that attempt. This source deliberately has no deletion
authority.

This evidence is a bounded snapshot of exact source content and root identity;
it is not an immutable-filesystem claim. A separately reviewed producer must
later bind SDK placement and the full tree manifest, make the complete tree
read-only, and prove that state before native commands. This source also does
not prove Git acquisition provenance; the reviewed exact acquisition boundary
remains a separate required controller input.

The source starts no child, opens no network connection, removes no file, and
has no npm, build, browser, provider, product-data, Git, workflow or release
authority. `main()` always exits 78. Genuine materializer execution over the
real 2,445-file tree, exact acquisition/evidence joining, read-only-tree
evidence, native phases, outer workflow and release remain open gates.
