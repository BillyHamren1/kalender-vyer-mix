# EventFlow concurrent-editor release checklist

## Before work

1. Read the remote repository metadata and current default-branch SHA through the authenticated GitHub integration.
2. Compare that SHA with local `HEAD` and cached `origin/main`.
3. Inspect commits after the local base, especially Lovable bot commits and user-approved visual corrections.
4. Record which files the request is allowed to change.
5. If the user says Lovable is editing now, determine whether those changes are committed. An uncommitted preview is invisible outside Lovable.

## Before publication

1. Re-fetch remote main. If it moved, stop using the old base.
2. Reapply or merge the authorized change onto the new head without replacing unrelated files.
3. Inspect the exact changed-file list and diff. No design-token, route, shared contract, migration, or environment file may change accidentally.
4. For UI work, inspect a rendered screenshot and check page hierarchy, not only the changed component.
5. Run the relevant tests, typecheck, and production build.
6. Use fast-forward publication only. Never use force to win a race with Lovable.

## After publication

1. Fetch main from GitHub and confirm its SHA and commit title.
2. Check CI/deployment separately when claiming the change is live.
3. If Lovable immediately publishes another commit, inspect it before diagnosing a regression; do not automatically restore the previous Codex tree.

## Conflict rule

The latest user-approved decision wins. When two implementations overlap and approval is unclear, present the concrete conflict and its effect. Do not silently select the older local version, and do not combine both into duplicate UI.
