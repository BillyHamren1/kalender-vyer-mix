# Operations personnel-cost first shadow delivery

Canonical cross-module program: https://github.com/BillyHamren1/eventflow-finance/pull/55 and `docs/project-economy/CHECKPOINT.md` on Finance branch `codex/project-economy`.

Operations calculates historical personnel cost from server-bound immutable Time evidence. Finance retains Operations amounts without multiplication. The new engine and additive publication/rate tables are not connected to production readers or endpoints. No legacy export or official total is changed by this proposal.

Starting Operations source: f0565e76e071bc50011ae33535c2b97022e46293. Lovable planning project d42a96b9-4d25-4701-b40a-d3fe594418b5 reports that exact source. Time source d236273ee781a05ba4a73d2b86a39f294c03731d also matches its Lovable project. Actual source/tenant/worker/project bindings and device runtime remain open.

Sixteen adverse engine cases and Deno engine/fixture typecheck pass locally; independent reviewer executed synthetic producer-to-Finance handoff60000 unchanged. Dedicated CI generates fixtures with the actual engine and runs this new schema's service-role, immutable, revision and CAS tests on isolated PostgreSQL15. It uses a minimal role bootstrap rather than claiming all legacy Operations migrations were verified.

Activation requires an authorized immutable Time read, explicit tenant/Auth→personnel/project mapping, historical rate administration, outbox and authenticated Finance receipt, per-project review on multi-project days, missing-rate correction audit, coverage UI and real isolated chain tests. A raw SHA only proves integrity, not authorization. Same-Time review preserves prior amounts; traced rate-recalculation is not supported by v1. An empty corrected stream withdraws all prior allocations.

Rollback: leave the new boundary disabled. Preserve append-only evidence. Never use record deletion as accounting rollback. No production migration, merge or deployment is part of this draft.
