# Packing write authority release — 2026-10-29

PR #83 merged as `0e3d53a3918b8e4fd2fc133da67a3065843b1bd4` after independent review of `d305c64ed359010f3e3f6b5e642d9fc418cb197a`. All six CI workflows passed: Packing write authority, Scanner module authority, Planning mobile contracts, Profile tenant authorization regression, Booking lifecycle database gate and Warehouse integrity.

## Verified scope

Actual PostgreSQL/PGlite migrations and roles passed 51 explicit assertions plus denial cases: Warehouse revoke while raw roles and Planning remain, shared reads, own/foreign organization DML, stale grant denial, full revoke, TRUNCATE denial and client definer RPC denial. Three executed helper tests and two actual-handler tests covered module-specific failure before packing access and error handling. Independent catalog audit found the exposed parameterized packing mutator `planning_edit_packing_list_item`; its client EXECUTE privilege was removed. Shared Planning exclude/restore remains behind the authenticated Edge path. Warehouse routes own direct physical packing writes.

## Production deployment

Native migration `packing_hub_write_ceiling` succeeded. Subsequent read-only catalog checks confirmed 21 restrictive packing policies, the own-actor helper, and authenticated EXECUTE=false on the planning-edit RPC.

Exact merged source deployed and downloaded byte-equal, including all 17 unique dependencies (24 bundled files):

| Function | Active version |
|---|---:|
| edit-packing-list | 102 |
| repair-packing-items | 137 |
| apply-packing-change-request | 136 |
| sync-booking-to-packing | 876 |
| process-sync-jobs | 851 |

Existing `verify_jwt=false` settings retained; each entrypoint validates its own caller or trusted worker credential.

## Verification limit

The production rollback-only synthetic SQL smoke did not return a result and was aborted. No live DML transition pass is claimed from that run. A subsequent read-only recovery check confirmed zero synthetic users/organizations and no matching active or idle-in-transaction sessions. No unrelated sessions were cancelled. Integrated HUB-to-module revocation verification remains incomplete; partial receipt evidence and remaining failures are tracked by the integrated release workstream. The local SQL tests use actual migration code with reduced fixture tables; shared Operations reads and independent trusted service paths are intentionally retained.
