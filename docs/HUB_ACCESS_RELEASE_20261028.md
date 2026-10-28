# HUB receiver release

PR78 merged at805e78ec648f4a86bcc43d49b4472451cc2182b5. Migration applied through connected deployment capability; exact definitions and service-only ACLs independently verified. Two previously reviewed canonical identity links installed.

Live rollback-only database smoke passed14 assertions: revoke, stale/equal-conflicting/unversioned grant denial, absent-user tombstone with >2^53 revision, foreign organization preserved, direct authenticated role writes/RPC/private ledger access denied. These are SQL session simulations, not signed HTTP end-to-end proof.

Deployed receive-user-sync version1026 and verify-sso-token version1039 are ACTIVE with verify_jwt=false and own authentication. All deployed source files independently byte-match reviewed source. Real HUB-triggered delivery remains a coordinated release gate.

Deployment tooling generated a duplicate migration under20261028170051 and rewrote bun.lock. Remove duplicate and restore reviewed lockfile. Reconcile only the migration history version to canonical20261028145811 after confirming identical SQL; do not rerun DDL or remove tombstones.
