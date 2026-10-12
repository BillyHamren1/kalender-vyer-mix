# Independent backend review — working candidate

2026-10-12, booking_catering reviewer. Read-only inspection of Operations and Finance agent worktrees, not an approval of final heads. Findings sent directly to owners and coordinator; owners must record fixes and test exact final revisions.

## Operations candidate 20261012124216_internal_project_classification.sql

1. **Blocking type mismatch:** original project_billing schema declares project_id TEXT, while projects.id is UUID. Candidate compares p.id = NEW.project_id and b.project_id = NEW.id. No later type alteration was found. Cast canonical project UUID to text and verify with executable SQL.
2. **Completion bypass:** UPDATE OF status-only trigger misses direct INSERT completed and reclassification of an already completed project. Enforce invariant for all admission paths, with valid OLD handling and tests.
3. **Billing discriminator bypass:** guard checks only medium. project_billing has a polymorphic text project_id, no FK in its original schema. If arbitrary direct types are allowed, a forged small/large discriminator can skip this guard. Validate target family or document narrow scope; test actual direct-write boundary.
4. **Authorization review required:** replaced SECURITY DEFINER ensure_internal_lager_setup permits NULL auth.uid through its conditional check. Verify existing grants and trusted backend path; reject anonymous execution explicitly or revoke it.
5. **Concurrent classification/billing:** reciprocal EXISTS checks without shared row locking can admit write skew. Lock canonical project consistently before checking and test two-session ordering if reclassification remains possible.

## Finance candidate 20261012124248_finance_internal_project_classification_v1.sql

1. **Indirect billing mapping bypass:** candidate checks finance_customer_invoice_documents.project_id, but the same candidate projection resolves coalesce(document.project_id, commercial_snapshot.project_id) through document_sources. Null direct project plus internal source snapshot is not guarded; enrollment-history check has the same gap. Protect source and snapshot paths, not just direct document mapping.
2. **Concurrent first classification/document admission:** reciprocal EXISTS checks need serialized project locking or another proven invariant.
3. Cost-only adapter consumes canonical amounts and excludes internal rows from commercial TB; no time repricing or extra invoice addition observed in reviewed implementation.

These are code-review findings, not production exploits or runtime proof. No DB mutations or owners' file edits were performed. Verify resolved/rejected status against the final migration and meaningful SQL tests before release.
