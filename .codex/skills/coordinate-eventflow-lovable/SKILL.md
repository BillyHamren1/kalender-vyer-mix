---
name: coordinate-eventflow-lovable
description: Coordinate safe EventFlow changes when Codex, Lovable, GitHub, or another agent may edit the same repository. Use before implementing, publishing, merging, or diagnosing a regression blamed on another editor; prevent stale branches from restoring old UI, colors, contracts, or logic.
---

# Coordinate EventFlow and Lovable

The latest accepted remote state is the starting point. A locally available clone, cached `origin/main`, CSS comment, or earlier Codex commit is not automatically authoritative.

Read [references/release-checklist.md](references/release-checklist.md) before any GitHub mutation or when investigating why a previous Lovable change appears to have reverted.

## Hard rules

- If the user says `koda inte`, `ändra inget`, or requests analysis, perform read-only inspection only.
- Resolve the actual remote main SHA with the authenticated GitHub integration immediately before work and immediately before publication.
- Inspect the latest Lovable commits and the precise files they changed. Preserve later user-approved changes even when an older local branch has a different value.
- If a Lovable preview contains uncommitted work, GitHub cannot reveal it. Do not claim it is preserved. Pause publication of overlapping files until it is committed or the user explicitly chooses which version wins.
- Never force-push or move main backwards. A non-fast-forward is a signal to integrate the new head, not an obstacle to bypass.
- Build a new commit on the current remote head. When publishing through the GitHub tree API, use the current remote tree as `base_tree`; include only authorized changed files.
- Do not label a color, URL, UUID, sender, schema, or ownership rule canonical solely because old code says so. Resolve its true owner and current approved source.

## Scope control

Before changing files, state the user-visible outcome and the areas that must remain untouched. Review the final diff against that boundary. A functional addition must not silently reorder the whole page, replace module tokens, remove old content, or create a parallel data source.

For UI work, compare the final rendered page with the latest accepted screenshot or current production view. Compilation is not visual verification.

## Publishing result

After publication, fetch the remote branch again and report the exact SHA actually on main. Do not say `publicerat`, `live`, or `Lovable har synkat` unless the relevant remote or deployment state confirms it. A GitHub push confirms source publication, not necessarily Lovable deployment.
