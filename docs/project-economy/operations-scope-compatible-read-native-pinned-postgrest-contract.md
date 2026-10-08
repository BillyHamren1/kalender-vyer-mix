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

## Stage12 held-FD immutable transition successor

The exact current predecessor run `37123882209`, job `111205196023`, on head
`566a99dc959039e7c5736aa7cb654adf89cdc012` refined the first failure to
`source_closure PHASE=immutable_file_set_permission`. That fixed marker proves
only that the first regular-file `FS_IOC_SETFLAGS` operation returned `EPERM`
or `EACCES`. It excludes the unsupported-ioctl, readback, identity, directory,
compile and product-effect phases as that run's first failure. Absence of an
effective `CAP_LINUX_IMMUTABLE` is the leading bounded explanation, but the
privacy-preserving marker cannot distinguish the exact errno, capability,
mount or LSM policy, so it is not asserted as observed fact.

This successor keeps the product runtime under the ordinary runner identity.
Only a fixed immutable-flag transition may cross the existing noninteractive
sudo boundary. The parent retains the already captured descriptor and invokes
absolute, root-owned, non-group/world-writable system executables with an empty
stdin, bounded deadline, captured output and a two-entry fixed environment.
The helper reopens only `/proc/<parent-pid>/fd/<held-fd>`, validates the complete
pre-transition device/inode/type/owner/link/size/time identity and current
flags, and permits exactly `old -> old|FS_IMMUTABLE_FL` or its cleanup inverse.
It receives no source pathname, environment authority, SQL, token or product
payload. Any output, nonzero exit, timeout, identity mismatch, flag mismatch or
unexpected transition fails closed under a fixed public phase. The parent then
checks flag readback and unchanged non-ctime identity before continuing.

Failure after materialization now attempts owned rollback before returning the
original fixed phase: every held materialized file and directory is inspected,
any observed immutable bit is cleared through the same bounded transition, and
the private tree is removed. Files are restored first; directories follow in
captured deepest-to-parent order, leaving the top boundary immutable until the
final inverse transition. Cleanup failure is reported as `owned_cleanup`
and is never relabeled as the earlier cause. This covers partially completed
file and directory seals; it does not claim a native no-survivor result until
the exact hosted run proves add, effects, inverse transition and absence. The
guard suite exercises permission-only delegation, unsupported/refused/deadline
paths, fixed silence, held-FD command construction, invalid descriptor denial,
partial file and directory rollback, zero pre-effect effects, and original
closure/adversarial controls. Raw runtime, cleanup, release and publication
acceptance remain separate gates.

## Stage13 early owned-parent registration

The private temporary parent becomes owned immediately after `mkdtemp`
returns, before its mode is changed and before the mirror child is created.
Cleanup therefore covers a failure in either the parent `chmod` or mirror
`mkdir` boundary. The executor enters the fixed `owned_cleanup` phase for any
registered parent, removes a partially constructed parent as well as a full
mirror, and restores the original fixed `materialize` phase after successful
rollback. Execute-level injected failures at both boundaries require a
nonzero fixed `materialize` marker, zero implementation effects, and no new
`operations-compatible-immutable-*` survivor.

This is source-only evidence. The exact hosted immutable transition, Docker,
PostgREST, database, cleanup/no-survivor, release and publication gates remain
open until separately executed and reviewed.

## Exact-head and run-owned no-survivor successor

Run `37128067946` was successful merge-integration evidence attached to head
`b278f4baace80aa13906957d61a847a964ea2fd6`, but its checkout was the synthetic
pull-request merge `26e26a9adc65bb0c6e3459c87d50caca24b35edc`. It is therefore not evidence of
a standalone execution of head `b278f4baace80aa13906957d61a847a964ea2fd6` or
tree `49ba90dcd074c61bb6dc693fbbddcbb20a42f831`.

The successor workflow checks out the event pull-request head explicitly. Every
job then compares `HEAD` with that event identity, resolves both commit trees,
and requires a clean index, worktree and untracked set before later steps.

The compatible-reader runtime derives a fixed run key only from the numeric
`GITHUB_RUN_ID` and `GITHUB_RUN_ATTEMPT`. Its immutable parent, private reader
parent and PostgREST container names contain that exact key and are created
exclusively. The workflow registers those exact paths, its launched process and
the exact container name before waiting. After the runtime's owned cleanup, an
`always()` step checks only those registered resources for absence. It neither
globs nor removes any older `/tmp/operations-compatible-immutable-*` path. The
runtime uses Docker host networking and registers that it owns no network.
Failure of the absence check is diagnostic and fail-closed; it never performs
cleanup on an unverified survivor.

This candidate changes CI source identity and test-resource custody only. It
does not change product economics, publish a ref, deploy, release or touch live
data. Hosted exact-head execution and independent review remain separate gates.
