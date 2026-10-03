# Immutable-source compatible-read PostgREST successor

This Stage10 source-only successor is based on the exact current Operations
commit `25561278631ee358054afcb53d75f39ace63bbbe`, tree
`126f4330c3f405d8bba2cddf924c877ec7da926d`. It performs no Docker, database,
provider or release action during review.

Historical origin: `cc366d73216342010db5b494d27f89ec2d116c02`, tree
`5ba72da2d1da3ff9ad0c33d71d7dd2e03b81724e`, was the earlier Stage9 source
candidate's base, not this Stage10 publication base. The separate historical run
`37116639538`, job `111184621488` on then-head `4de3` (raw log SHA-256
`b4e953f87166589bfa4522c35a65426d84316df002c5fc31fef58ae1694872ee`)
established an obsolete inner v2 custody requirement. The earlier repair removed
that duplicate inner custody path. This historical diagnosis is not current
Stage9 runtime evidence.

The actual current-base run `37119750172`, job `111193408698`, failed with the
generic `source_closure` marker after successful guard step5. The first inner
cause remains unresolved. Its workflow omitted the exact required image
selector, which independently guarantees refusal if environment installation
is reached; immutable sealing occurs before installation. Stage10 fixes that
handoff, routes the self-contained pinned guard suite and adds finite public
phase diagnostics without inferring native execution or cleanup acceptance.

The exact modified `.github/workflows/operations-project-economy.yml` is the
external trust anchor. Its fixed inline Python launcher opens both the bootstrap
and closure once with no-follow, validates each regular-file metadata, exact
independent SHA-256 and full held-FD/path identity, and only then compiles and
executes the retained bootstrap bytes. It passes both retained open file
descriptions, byte strings and identities into the bootstrap; neither the
interpreter nor importlib reopens either authority pathname.

The held-byte bootstrap consumes the launcher's already-held bootstrap and v4
closure authorities and joins both to their current pathnames before any
effect. The closure contains exactly 87 transitive runtime inputs; it excludes
the bootstrap and workflow, avoiding any self-hash cycle. Workflow old/new
blobs and the two launcher authority digests are instead bound in the reviewed
source capture and publication packet. The bootstrap verifies every transitive
input's SHA-256, Git blob, byte length and full path/FD identity, then
materializes those exact bytes into a private tree. It requires the Linux
immutable inode flag on every file and directory. If the runner lacks authority
or filesystem support for that flag, the attempt fails before loading the
implementation and before any database or Docker effect.

Only after a complete immutable-tree and canonical-FD recheck does the bootstrap
create a fresh object capability and compile the captured implementation bytes
into a new ModuleType with that capability present during this load only. The
implementation consumes the injected name into a private per-load, monotonic
gate. There is no separate module-level effect body. The bootstrap arms that gate exactly once with a copied environment; the
gate itself validates and binds the exact Deno selector and digest-pinned image,
then removes the image selector from the child environment. The installer module
name is removed after arming. `_execute_materialized` consumes that exact
capability and bound tuple once as the first statements of the only effect body,
before it can call `closure_paths` or perform any effect. A direct import has no
capability and direct private-entry/body calls,
caller-supplied Deno/image arguments, replay and re-arm all fail closed at
`guard` before a path or effect is reached.

The bootstrap never asks importlib to reopen the implementation pathname. The
implementation's Python, SQL, Deno and shell paths all resolve inside the
kernel-immutable tree. A second complete check is the last operation before
the capability-protected `_execute_materialized`; a final check follows it.
Successful cleanup first clears only the flags it set and then discards the
private tree. A failed or uncertain attempt retains the immutable tree;
cleanup/no-survivor is not claimed.

Inside that already-held immutable tree, the implementation now validates the
same exact v4/87 closure, requires the exact base-plus-successor member set after
excluding the workflow and bootstrap authorities, and returns only the 23
ordered schema paths. It has no second `SourceCustody`. Direct pathname execution
of the implementation is deliberately refused at `source_closure`; only the
external workflow launcher and held-byte bootstrap may invoke
`_execute_materialized`. The outer authority continues to hold and recheck all
transitive file descriptions before effects and after execution.

The only accepted image selector is
`EVENTFLOW_SCOPE_COMPATIBLE_READ_POSTGREST_IMAGE=postgrest/postgrest@sha256:729bf65c733b73f5b52777f0e4b853f22ed73aa67a22d38269d289779b0a8401`.
Every other key with that selector prefix is rejected by presence, including an
empty value, and the admitted key is removed from child environments.

Pure tests exercise the actual bootstrap and implementation, workflow launcher
shape, bootstrap-A/path-swapped-B refusal, coherent closure+implementation
substitution refusal before effect, implementation held-byte execute-A/path-
swapped-B behavior, canonical and materialized replacement
detection, immutable-gate denial, exact v4/87 acceptance, v2 and outer-authority
member rejection, direct-route refusal, direct private-entry rejection before
`closure_paths`, exact validated selector binding, one-use/re-arm refusal,
selector adversaries and the original 13-test guard suite. They mock immutable
ioctls and do not execute Docker.

This repaired source packet does not prove that a GitHub runner can set immutable flags,
that the digest is present, that Docker used it, that native execution or
cleanup passed, or that the Step 6 line runtime is admitted. The workflow bytes
are source-reviewed routing only; publication, workflow runtime and release
remain separate OPEN gates.

Stage10 adds only the required digest-pinned image environment handoff, routes the
existing pinned 20-test guard suite, and reports a closed public phase for outer
held acquisition/compilation or inner capture, materialization, immutable sealing,
compilation, environment installation, pre-effect verification, effects, final
verification, and owned cleanup. Unknown exception properties and strings are
never inspected. Every refusal remains nonzero, and pre-effect refusal reaches no
runtime effect. The observed stage9 generic failure does not establish which
inner phase failed; the absent image selector independently guarantees refusal
if installation is reached. Immutable ioctl support remains a genuine native
prerequisite. A later workflow publication requires a separate shared source
manifest rebind to the final workflow bytes. No runtime, cleanup, or release
acceptance is inferred from these source controls.

## Stage11 immutable-seal discriminator

The exact PR merge run `37122162873`, job `111200263616`, checked out merge
commit `08ec0f5592f6b35379df141a35f054676d5cd92f` (head
`60ad012148d0fab3e25b60f70fa04e4abad9e689`, base
`f0565e76e071bc50011ae33535c2b97022e46293`). The source guard suite passed
20/20 and the outer held bootstrap plus inner capture and materialization
passed. The actual route then failed closed at
`source_closure PHASE=immutable_seal`, before compilation, environment
installation, Docker/PostgREST effects or owned cleanup. The decoded UTF-8 log
including BOM is 38,773 bytes with SHA-256
`4f6d26c470c66e7488521ef8eb4827bfbaaf838129f8a967103cba8f463ddf30`.

The broad phase proves that the first failure is somewhere inside the Linux
immutable-file seal boundary, but it does not distinguish ioctl permission,
filesystem support, readback or FD/path identity. The current source's first
operation in that phase is `FS_IOC_SETFLAGS` on the first private materialized
regular file. Linux requires suitable immutable-file authority for that
operation; the log did not expose errno or capability state, so permission is
a bounded leading hypothesis, not accepted cause.

Stage11 preserves every Stage10 operation and order and adds only fixed public
subphases for regular-file set (permission/unsupported/other), readback and
identity; directory set (the same classes), readback and identity; and final
immutable verification. It never emits errno, paths, source identities,
exception text or private bodies. Unknown exceptions map to the fixed `other`
class. Every failure remains nonzero and remains before compilation/effects.

Pull-request execution uses GitHub's synthetic merge commit. The capture is
bound to exact head/tree source bytes, while runtime admission continues to
bind the checked-out `GITHUB_SHA` and the complete closure at the merge. The
observed merge reached immutable sealing, so it is evidence that its exact
source/manifest closure passed; it is not evidence that a future merge equals
the branch head or that immutable setting will succeed. Publication and a new
exact-merge rerun remain separate gates. No repair, runtime, cleanup, absence
or release claim is made.
