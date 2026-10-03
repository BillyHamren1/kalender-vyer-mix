# Immutable-source compatible-read PostgREST successor

This is a source-only successor on Operations commit
`26c1be405621193946a4e72c1415fc0724f7b8a9`, tree
`796a4fbeaf7eb7e12985e29ecf0ccfdf8ad3baa7`. It performs no Docker, database,
provider or release action during review.

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
compile the captured implementation bytes into a new ModuleType. It never asks
importlib to reopen the implementation pathname. The implementation's Python,
SQL, Deno and shell paths all resolve inside the kernel-immutable tree. A second
complete check is the last operation before `_execute_materialized`; a final
check follows it. Successful cleanup first clears only the flags it set and then
discards the private tree. A failed or uncertain attempt retains the immutable
tree; cleanup/no-survivor is not claimed.

The only accepted image selector is
`EVENTFLOW_SCOPE_COMPATIBLE_READ_POSTGREST_IMAGE=postgrest/postgrest@sha256:729bf65c733b73f5b52777f0e4b853f22ed73aa67a22d38269d289779b0a8401`.
Every other key with that selector prefix is rejected by presence, including an
empty value, and the admitted key is removed from child environments.

Pure tests exercise the actual bootstrap and implementation, workflow launcher
shape, bootstrap-A/path-swapped-B refusal, coherent closure+implementation
substitution refusal before effect, implementation held-byte execute-A/path-
swapped-B behavior, canonical and materialized replacement
detection, immutable-gate denial, selector adversaries and the original 13-test
guard suite. They mock immutable ioctls and do not execute Docker.

This source packet does not prove that a GitHub runner can set immutable flags,
that the digest is present, that Docker used it, that native execution or
cleanup passed, or that the Step 6 line runtime is admitted. The workflow bytes
are source-reviewed routing only; publication, workflow runtime and release
remain separate OPEN gates.
