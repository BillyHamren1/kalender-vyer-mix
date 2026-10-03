# Exact 2,445-file governed immutable-source-root transition

This additive source boundary is unrouted and admits no application, provider,
browser, database, build or release. It performs no fetch, child execution,
network call, deletion or retry. The exact input remains commit
`809f64e0fd98322c53d9c4e9697df5b515303812`, tree
`3d96301591652f9d86ccbbdf8ff26efcb7180ce9`, manifest
`4c6005bb374fa13f89aafc52ce4a013feaa1673454dce76bd09aee77c95e6434`,
2,445 files and 20,984,073 bytes. The sorted manifest projection is independently
bound as `9fac867355f20d6586ffca32227ee8b861f64879cc2619c1427c1b3d97ea8cf8`.

This producer is intentionally limited to an immutable source snapshot root.
It must not be invoked before `npm ci` or `npm run build` in the same root:
those commands require writes (`node_modules`, package-manager state and
`dist`) that modes 0400/0500 prohibit. Any future build route must derive a
distinct private writable build root or reviewed overlay from the verified
source snapshot, bind that derivation to this receipt, and perform install and
build only there. The derivation, writable-root custody, unchanged npm/build
execution and post-build `dist` verification are separate OPEN gates. Neither
this source nor its receipt admits or describes such a writable build root.

The future outer controller must keep the following gates distinct and
fail-closed:

1. `derived-writable-build-root`: create a new private 0700 empty root, bind
   its held FD identity, and persist the exact derivation mechanism plus this
   read-only source receipt SHA-256. It must prove a complete pre-install
   2,445-file source manifest/body join without treating the writable copy as
   immutable. Partial derivation is discarded under an independent cleanup
   deadline and is never reused.
2. `owned-install-build`: invoke the separately reviewed long-process adapter
   only in that held writable root, with exact Node/npm/trust FDs and durable
   `npm ci` and `npm run build` receipts. This transition supplies no command,
   environment, network, cache, certificate or process authority.
3. `post-build-dist-custody`: after build, acquire `dist` through a held,
   no-follow descriptor; reject extra/symlink/special/hard-linked entries;
   bind every relative path, mode, byte length and body hash into a bounded
   sorted manifest; join the build receipts, build-root identity and source
   receipt; then prove a complete stable reread. Until an independently
   reviewed producer supplies that evidence, static-server and browser phases
   remain blocked.

The caller supplies exact manifest bytes, exact
`compatible-full-app-materializer-evidence.v1` bytes and one absolute private
0700 attempt parent. The producer opens the already-persisted materializer
receipt and `compatible-app-809f` root with no-follow held descriptors. The
receipt bytes, descriptor identities and pathname identities remain bound
through completion. Duplicate JSON keys, non-finite values, mismatched root
identity, pre-existing transition artifacts and any expanded or missing source
inventory fail closed.

Before mutation the producer traverses the full tree twice through held,
component-by-component no-follow descriptors. Directory enumeration is a
streaming `scandir` walk with one global 2,665-entry cap and deadline checks;
no unbounded directory list is materialized. It requires exactly 2,445
regular files, 220 non-root directories, no extra path, file mode 0600,
directory mode 0700, exact UID/GID/link/size and every Git blob body. Both
passes must have the same full dev/inode/UID/GID/type+mode/link/size/mtime/ctime
identity digest. It then durably creates the exclusive mode-0600
`read-only-tree-transition.started.json` marker before the first chmod.

The only authorized transition is 0600→0400 for files and 0700→0500 for
directories. Files are processed first, directories deepest-first and the held
root last. Each target is reopened component by component, joined to its
captured identity, changed with `fchmod`, joined to the same pathname and
fsynced before it is joined to the same pathname and rehashed where it is a
file. Dev, inode, UID, GID, type, link count, size and
mtime must remain equal. Ctime may only stay equal or increase. A single shared
300-second deadline covers both complete scans and all changes.

After transition, the producer performs a complete exact-body scan, checks
every node against the allowed mode/ctime delta, exclusively persists
`compatible-full-app-read-only-tree-evidence.v2`, fsyncs it and the parent, and
performs a final complete scan and artifact readback. The receipt explicitly
states `full_tree_read_only=true`, `immutable_filesystem=false` and
`runtime_admission=false`. It also fixes
`root_purpose=immutable_source_snapshot_only`,
`same_root_install_or_build=false`,
`derived_writable_build_root_required=true`,
`derived_writable_build_root_admission=false` and
`post_build_dist_verification=false`. Read-only modes are a governed identity
transition, not an immutable-filesystem, build, dist or runtime proof.

There is deliberately no rollback or delete authority. Any failure after the
started marker—including a partial chmod, identity drift, timeout or final
receipt failure—leaves the private attempt and marker retained. A higher-level
controller must discard the entire private attempt under its own independent
cleanup deadline before retry. It must never reuse a partial tree or infer
success from either artifact alone. SDK placement is separately OPEN: the exact
2,445-file manifest contains no `scripts/` directory, so this transition does
not claim that the staged SDK package can be placed or executed in this root.
SDK materialization therefore also requires a distinct reviewed root and may
not be inferred from either this transition or a future writable build-root
derivation.
