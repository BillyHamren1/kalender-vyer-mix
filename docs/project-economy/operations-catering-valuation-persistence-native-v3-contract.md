# Operations Catering valuation persistence native v3 contract

This candidate is a scratch-only, synthetic native PostgreSQL execution path for the already published two-booking Catering persistence kernel. It does not authorize publication or execution yet.

## Ordering and authority

1. Checkout is read-only and exact source hashes are checked before Docker.
2. Node 24.21.0 and npm 11.19.0 are asserted; the 23 pure census tests run first.
3. The pure-test closure includes both transitive imports: `catering-project-evidence.ts` and `project-personnel-cost.ts`. The guard fixes the two exact import edges and the workflow pins all four runtime TypeScript modules before Node loads any of them.
4. A closed image-admission document must bind the raw registry index, linux/amd64 child manifest, config digest, publisher signature, transparency/trusted-time evidence, entrypoint and command. The current document is deliberately blocked and therefore refuses before creating a private root or invoking Docker. Hex-shaped bundle references alone never authorize a future successor.
5. An opened successor must materialize already-held, exactly hashed admission, migration and SQL bytes into a root-owned 0700 private root under a root-owned parent. The runner UID has no pathname mutation authority inside that root. A fixed-size private filesystem bounds Docker image and writable-layer growth; data and exec roots live inside it.
6. A unique private Docker daemon is started only after admission and source materialization. The shared runner daemon is never queried, adopted or cleaned. Every command is bounded by a wall-clock timeout and has both pre- and post-command process start-time, socket identity and daemon-ID continuity checks. Pull and create both request the admitted `linux/amd64` platform.
7. The pulled image ID must equal the admitted config digest; inspected platform, entrypoint and command must match admission; only exact returned image and container IDs are used. The container has no network or host port and has explicit memory, CPU, PID, file-descriptor and PostgreSQL-data limits.
8. PostgreSQL is reached only through exact-ID `docker exec`. The held migration and fixture bytes form one exact private SQL driver; statement, lock and idle-transaction timeouts are mandatory. Synthetic identities are used and the fixture rolls its transaction back.
9. Success requires exact-ID removal, empty private container/image/volume inventories, exact daemon termination, private-filesystem unmount, and removal of the root-owned private root without recursive deletion through a runner-mutable pathname. Failure retains the protected private root for evidence and never runs global cleanup.

## Runtime matrix

The existing SQL fixture covers service-role admission, authenticated denial, two bookings on one project, exact replay, changed replay, observed and effective predecessor CAS, contiguous source observations, correction lineage, stale/reordered denial, per-command origin uniqueness, `current_empty` withdrawal, `unavailable` non-destructive preservation, explicit zero distinct from missing-cost NULL, one-owner/no-double-count origin semantics, and rollback compatibility. It calculates no project total and gives Finance no calculation authority.

## Open gates

- Reviewed raw OCI index/child/config bytes, publisher signature, mandatory transparency consistency and trusted-time evidence.
- A verified image config digest and image ID; the current observed tag/index/child values are non-authoritative observations.
- Executable admission verification of the already ACKed DSSE v6 design/KAT against real registry, publisher, transparency and trusted-time artifacts.
- Adversarial runtime evidence that a runner-UID path or socket substitution cannot alter endpoint/source custody and that unrelated sentinels survive cleanup.
- Actual resource-exhaustion and timeout runs proving bounded failure and cleanup behavior.
- Independent security/source/route review of this launcher and workflow.
- Actual all-green synthetic runtime with exact log hashes and cleanup/no-survivor receipt.
- Authenticated Catering producer, hosted/provider, compatible migration/rollback and release acceptance.
