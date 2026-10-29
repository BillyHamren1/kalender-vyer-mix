# Operations, WMS Scanner and Time security release — 2026-10-29

PR80 merged85b11f8; PR81 final head110f4c62 passed all8 CI workflows and mergedc5f911aab063ce5974fed446cb89de34c0ede951. Canonical Planning/Warehouse module gates are stored atomically with source revisions, stale/equal-conflicting/unversioned grants denied. Scanner's eight credential/read/command paths revalidate current linked staff authority; independent personnel stays separate. Time planner requests require exact selected-org roles, current Planning gate and the existing explicit source→Time binding.

Migration20261028181334_scanner_hub_access_guard.sql applied via native Supabase (generated receipt20261029055213 reconciled to canonical filename after exact SHA256 validation f0d36d2b024a7d6373d8dd69d39cb3e7355627a5b011b264b41d01d84d42fc33). Existing staff identities only mirrored into private immutable anchors; no account linking by email. RPCs are service-only. Private table RLS remains deny-all to clients. Security advisor adds only intended INFO RLS-with-no-policy on scanner_staff_bindings; no new warning/error classes.

## Deployed and independently downloaded source

All dependencies byte-match mergedc5f911aa. Gateway JWT setting preserved false because the functions authenticate their own credentials/envelopes.

| Function | ACTIVE version |
|---|---:|
| receive-user-sync |1027|
| verify-sso-token |1040|
| mobile-app-auth |288|
| scanner-api |969|
| scanner-command-api |78|
| scanner-dispatch-api |17|
| scanner-inventory-command-api |66|
| scanner-inventory-read-api |66|
| scanner-return-api |17|
| scanner-return-read-api |17|
| time-planning-proxy |145|

## Verification and limits

Actual live PostgreSQL rollback-only smoke (scripts/authz-regression/live-scanner-module-smoke.sql) passed: precise >2^53 revision, warehouse-only entitlement revoke with roles retained, stale and equal-revision conflict denial, old four-arg RPC refusal, full revoke, foreign org preserved, immutable staff links, authenticated self-grant/RPC denial and revoked tenant reads. Independent cleanup confirmed zero synthetic users/orgs/staff/receipt rows. Twenty isolated SQL assertions plus privilege tests and20 executed handler/auth tests passed, alongside Time9 actual-handler tests and existing CI contracts.

Actual unsigned HTTP probes reject requests: receiver401,SSO400 missingdata,mobile-auth400 missingcredentials,Scanner401missingtoken or400missingcontract,Time401unauthorized. These negative probes do not prove a signed HUB transition or authenticated Time/Scanner end-to-end flow; root coordinates those.

Generic shared browser packing mutation policies are a separately identified remaining boundary, not silently claimed covered here. WMS-specific mutation-gate follow-up is tracked separately. New versioned deliveries REQUIRE module_access.planering/lager booleans; unversioned legacy delivery remains accepted only for never-versioned subjects. Existing version rows with no module gates require a newer authoritative HUB revision, not a same-revision rewrite.
