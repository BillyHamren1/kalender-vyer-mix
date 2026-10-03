# Exact App writable-build-root derivation — source contract

Status: **source-only copy boundary; npm, build, SDK, dist, browser, workflow and
runtime remain denied**.

This additive source turns the separately reviewed immutable source snapshot
into a distinct writable build input. It consumes the exact pretty-printed App
manifest at SHA-256 `4c6005bb...`, the exact held
`compatible-full-app-read-only-tree-evidence.v2` bytes, and held FDs for the
source parent, mode-0500 source root, mode-0600 receipt, separate mode-0700
build parent, fixed attempt and initially empty writable root. The reviewed
read-only transition source is SHA-256 `f47c4c7b...`; its runtime receipt, not
its source filename, is the authority supplied here.

## Exact source and distinct destination

The manifest must be duplicate-safe JSON with commit `809f64e0...`, tree
`3d963015...`, all 2,445 regular mode-100644 inputs, 20,984,073 bytes, 220
directories and projection SHA-256 `9fac8673...`. Formatting is not normalized:
the original manifest bytes must retain the fixed SHA. Every path is relative,
canonical and bounded; each byte count and Git blob SHA-1 is exact.

The read-only receipt is canonical duplicate-free ASCII with its complete exact
key set. It must bind the held source root's full nine-field post identity and
full-tree identity digest, file mode 0400, directory mode 0500, immutable-source
purpose, same-root install/build false, derived writable root required but not
admitted, and every downstream admission false. Receipt FD, bytes, mode,
single-link state and parent-relative pathname are rebound before use.

Source and build parents are distinct inodes. The source root and writable root
are also distinct inodes. The build parent admits only its fixed
`compatible-full-app-build-derivation-attempt`, whose initially closed layout
is one empty mode-0700 `writable-build-root`. All six caller FDs are distinct and
each fixed root is reopened no-follow through its parent before copying.

## Complete held-FD derivation

One shared 300-second deadline covers admission, two full source observations,
copying and two full destination observations. Traversal is FD-relative and
bounded by the exact manifest inventory. Source directories/files must remain
0500/0400. Destination directories are created 0700 and files O_EXCL 0600;
each source leaf is fully read, Git-blob verified, copied, fsynced, read back
and rebound to its no-follow destination pathname. No symlink, device, hard
link, extra or missing path is accepted. The immutable receipt and both roots
are rebound to their fixed parent-relative pathnames again immediately before
return; a same-UID root-path substitution is denied. If that interference also
changes the attempt anchor, quarantine is refused as ambiguous and the entire
derived attempt remains intact at its original name for outer recovery.

The emitted canonical O_EXCL mode-0600
`compatible-full-app-writable-build-root-evidence.v1` binds:

- source commit/tree, manifest and projection hashes;
- exact immutable-source receipt hash, root identity and full-tree identity
  digest;
- exact writable root identity and full-tree identity digest;
- the 2,445/20,984,073/220 inventory and 0600/0700 modes;
- distinct-root and complete-source-join truth;
- SDK routing, npm-ci admission, App-build admission, post-build-dist
  verification and runtime admission all false.

This receipt is the planned narrow input to a later owned npm/build controller
and post-build dist custodian. It does not authorize either. SDK remains a
separate verified root because the exact App source contains no `scripts/`
directory and the reviewed placement contract uses `create=False`.

## Non-destructive whole-attempt failure handling

After the fixed attempt is bound, any failure moves the entire attempt with
Linux `renameat2(RENAME_NOREPLACE)` to the fixed `.discarded` sibling. The
source contains no unlink/rmdir authority and never replaces an existing
quarantine. Its held original FD, the quarantine pathname and a no-follow
reopen must agree. Only ctime may advance across the atomic rename; the captured
post identity is stable through parent fsync. A same-UID substitution can at
most be moved intact; identity mismatch raises `quarantine_incomplete` and the
replacement marker survives. Outer reviewed recovery is required before any
retry.

## Explicitly open gates

- Genuine immutable-source and derivation receipts have not been produced on
  the exact 2,445-file tree.
- The acquisition-route join, Node/npm live runner receipts and exact Node24
  controller have not run.
- SDK separate-root placement, owned `npm ci`, SDK unit and Vite build remain
  separate gates.
- Post-build held-dist inventory/read-only custody, static owner/server,
  Playwright import/browser/actor cleanup, outer workflow and release remain
  open.

Local tests use a two-file synthetic tree and the real 2,445-row manifest. They
cover complete distinct copying with false admissions, bad immutable receipt,
external FD substitution, partial-copy quarantine with original error,
pre-existing output retention, final build-root pathname substitution,
unbound-attempt non-movement, same-UID
substitution retention, and the fixed no-process/network/delete surface. They
are support evidence only. `main()` always exits 78.
