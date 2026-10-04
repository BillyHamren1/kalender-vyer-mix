# Exact Node 24 bundled CA export — source contract

Status: **unpublished, unrouted source candidate; local support tests only**.

This source closes only the deterministic CA-export design gap. It executes one
fixed vector: the caller-captured exact Node executable FD, `-e`, and the exact
embedded JavaScript whose SHA-256 is derived in the module. That JavaScript
loads only `node:tls`, rejects absent/malformed/CR-containing bundled roots, and
serializes `tls.rootCertificates` in Node order as each existing PEM string plus
one LF. No environment value, filesystem path, package or network input is
read by the script.

The source loads frozen b901 process custody only from exact captured bytes at
SHA-256 `b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a`.
Before spawn it binds the exact caller-selected Node file SHA, stable FD
identity, owner, link count, non-writable mode and executable bit. The CA output
must be an already-exclusive empty mode-0600 regular FD; the journal must be a
private mode-0700 directory FD. stdin is null, stderr/owner evidence are
exclusive mode-0600 journal files, the environment contains only C locale, and
the output has a 4 MiB `RLIMIT_FSIZE`.

b901 provides `/proc` identity, WNOWAIT observation, pidfd-owned cleanup,
descendant scans and single reap. Execution has 10 seconds plus a separate
15-second cleanup reserve. Only zero exit, empty stderr, stable Node/CA FDs,
complete cleanup, and strict PEM validation permit a receipt. A closed record is
written before the immutable receipt. The receipt binds archive identity,
declared Node version, exact Node file hash, exporter-script hash, CA hash/size,
certificate count and cleanup completion.

If `Popen` raises before returning an identified child, the primary spawn
failure is preserved, b901's ownership kernel is not called with `None` or an
invented identity, and no closed record or receipt is written. Once `Popen`
returns a child, the source registers it as uncertain before owner capture.
Failure to validate that owner record retains the uncertain entry for caller
recovery and likewise never calls `stop_owned` without the validated saved
identity. The source module immediately retains a strong `PENDING_RECOVERY`
record containing that exact child, the dynamically loaded custody module, the
private journal identity, fixed owner leaf, a duplicated still-open original
owner FD plus its creation anchor, and any validated saved identity.
It therefore survives stack unwind without relying on an exception traceback
or the caller having retained the otherwise-local custody module.

`recover_pending()` accepts only the same held private journal FD and one
pending record. It never reopens or adopts the owner pathname: it reads only
the retained original owner FD, binds its creation anchor and full pre/post
identity to the unchanged parent-relative pathname, validates the exact child
PID/session tuple, and only then calls b901 cleanup under a new bounded reserve.
The pending and custody-uncertain entries are removed only after the exact
child has a complete reaping record and final journal/owner FD/path identities
still match; those checks occur before removal. Missing/partial/unlinked or
same-UID-replaced owner evidence and failed cleanup retain the strong recovery
record. Only a child with captured ownership can enter bounded cleanup.

The stderr result is accepted only through its still-open mode-0600 FD: its
full identity and zero size remain exact, and its journal pathname must still
resolve to that same inode both before and after bounded child cleanup. An
empty pathname replacement cannot hide bytes written to the held inode. The
exact Node executable FD is fully rehashed and identity-rechecked again after
cleanup and before the closed record or receipt is written; the receipt cannot
assert a pre-cleanup-only Node identity.

The fixed `main()` returns 78. No workflow/controller route, Node distribution
download, Node execution, CA result, npm access, install, SDK test or build is
claimed. Remaining gates are independent source review; a controller that binds
the Node FD to the exact reviewed archive/extraction receipt and pins its exact
file hash; native success and failure evidence for Node 24.21; independent
review of the resulting CA hash; then integration of that pinned hash into the
successor policy. Browser/provider/release authority is outside this source.
