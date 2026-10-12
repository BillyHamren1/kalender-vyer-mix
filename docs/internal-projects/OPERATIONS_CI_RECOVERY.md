# Operations native test recovery — 2026-10-12

Owner: `/root/operations_recovery`, delegated by root recovery lease through 19:56 UTC. Source: Operations draft PR55.

## Exact failure and correction

Head `26da19b9699e52875a95a03d79d4d06a30b2a769`, workflow `38280207481`, job `114915403293`: 41 engine/handler tests and 33 PGlite scenarios passed. Native PostgreSQL stopped at `personnel-review-issuance.mjs:69`: the JavaScript array `[fakeProof]` bound to a JSONB parameter was encoded by node-postgres as a PostgreSQL array literal. PostgreSQL rejected invalid JSON before the intended semantic provenance assertion. The PGlite driver had accepted that JavaScript array directly.

The sole correction is explicit `JSON.stringify([fakeProof])` at that parameter. No production SQL, runtime behavior, assertion, privilege, feature flag or release gate changed. Independent reviewer `/root/recovery_review` approved exact blob `bedf66b4b9f873424a2fb9a910132f8b62469de3`. Audit of both harnesses found no other top-level array parameters intended as JSONB.

Root published genuine-parent commit `0520f931bf596de5070fd7b28471f7ec4f78f37c`, tree `a85aebd61ef1c7484f5375f13d5d524a0e3700ae`.

## Verification

- Corrected local 33 PGlite scenarios PASS.
- Locked node-postgres 8.16.3 `prepareValue` reproduction: old array raises JSON parse error; explicit JSON text round-trips the complete nested proof unchanged.
- Exact-head workflow `38294656352`, job `114962738640`: 41 Vitest tests, transitive publisher types, 33 PGlite scenarios and 33 actual PostgreSQL 17.11 scenarios PASS. Raw logs explicitly include the previously blocked rejected/voided/correction-requested forged-confirmation checks.
- Separate workflow `38294656343`, PostgreSQL concurrency job `114962738962` SUCCESS. Application job `114962739299` also SUCCESS: regressions, full application types, build, isolated migrations and mock transport. Both workflows are entirely green on the exact head.

This is isolated synthetic schema/auth and CI evidence, not hosted authentication or accepted production cost enrollment. No deploy, hosted migration, merge or live financial action occurred. Remaining program gates include canonical Finance accepted-cost receipt/withdrawal/coverage, WMS/Scanner owner chain, hosted release/rollback and authenticated deployed UI.
