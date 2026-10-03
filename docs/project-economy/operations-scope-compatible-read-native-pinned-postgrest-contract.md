# Immutable-source compatible-read PostgREST successor

This is a source-only repair candidate on Operations commit
`cc366d73216342010db5b494d27f89ec2d116c02`, tree
`5ba72da2d1da3ff9ad0c33d71d7dd2e03b81724e`. It performs no Docker, database,
provider or release action during review.

The published predecessor reached its actual workflow route but failed closed at
`source_closure` in run `37116639538`, job `111184621488` (raw log SHA-256
`b4e953f87166589bfa4522c35a65426d84316df002c5fc31fef58ae1694872ee`).
The outer held-byte bootstrap admitted the reviewed acyclic v4/87 closure, but
the compiled implementation still required its obsolete v2 closure and a set
that included the outer workflow and bootstrap authorities. Those requirements
could never both hold. This repair removes that duplicate inner custody path.

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
