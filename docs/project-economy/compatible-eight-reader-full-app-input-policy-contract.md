# Full-App Node 24 input and SDK placement preparation

Status: **source-locked preparation; admission blocked; no download or placement**.

The Node project identifies Node `v24.21.0` with bundled npm `11.19.0` and
publishes SHA-256
`fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`
for `node-v24.21.0-linux-x64.tar.xz`. The preparation descriptor freezes that
exact HTTPS URL, archive identity, platform, archive root, Node entry, npm CLI
entry and npm symlink target. It permits no floating `latest`, setup action,
ambient Node/npm, or unverified archive member.

The future fetch/extract source must download only the frozen URL, verify the
archive hash before parsing, reject absolute paths, parent traversal, special
files, hard links and escaping symlinks, and bind the Node executable, npm CLI
entry and every npm transitive import to the verified archive root. Lifecycle
PATH must contain only the verified private distribution's `bin` directory.

The npm policy is exact but not yet implemented: direct access only to
`https://registry.npmjs.org/`, all proxy environment removed, strict TLS,
cross-origin and downgrade redirects denied by a reviewed wrapper, a fresh
empty private cache with no restore/seed, no notifier/audit/fund side effects,
and no secrets. The CA file must be deterministically serialized from the
verified distribution's `tls.rootCertificates`, hashed, and bound before any
network access. No ambient runner CA bundle is admitted.

The SDK descriptor freezes exact source SHA/size and an exclusive no-symlink
placement below the already verified App root. Its receipt must bind source,
destination, materialized-root identity and exact App manifest before the
long-process adapter snapshots its source FD. The descriptor performs no write;
a separately reviewed FD-based implementation and native negative tests remain
required.

There is a concrete incompatibility gate: canonical long-process source
`96e827a5…` accepts only `v22.x.y`, while the required distribution is Node 24.
Therefore these inputs cannot truthfully be consumed by that adapter. A new
reviewed adapter successor (or an explicit reviewed decision to use exact Node
22) is required before download, extraction, npm network, `npm ci`, SDK test or
build can be routed. The guard proves and reports this mismatch; it never edits
the canonical adapter.

References used for the frozen release facts:

- `https://nodejs.org/en/download/archive/v24.21.0`
- `https://nodejs.org/en/blog/release/v24.21.0`
- `https://nodejs.org/dist/v24.21.0/SHASUMS256.txt`
