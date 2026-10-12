# Actual Finance endpoint adapter composition

Extends review/read chain38e3f45 with genuine Financec88dfdb038f477476ccb50b6d16669910f6f7243 endpoint and four-field public SQL ingress. No product file is changed.

```sh
cd /workspace/scratch/3f646f03b350/recovery-review-read-source
ACCEPTED_FIRST_DAY=1 FINANCE_SOURCE_ROOT=../recovery-finance-evidence-read NODE_PATH=/tmp/operations-recovery-deps/node_modules node ../recovery-endpoint-chain/acceptance-runtime.mjs
```

The actual Edge entrypoint source (not deployed) is transpiled without source replacement and evaluated with its genuine shared receiver. The VM supplies Deno environment/serve and resolves the remote Supabase client import to a synthetic network adapter. That adapter checks the exact configured URL, service credential fixture, client auth options, RPC name and four argument names, then executes the actual public SQL facade under SET ROLE service_role. It preserves actual SQLSTATE errors into the real Edge handler. No private receiver is directly invoked by this harness.

All anon/authenticated/service_role grants are verified absent before a fixture-only execute grant on the public facade. The facade invokes its owner private receiver normally. Unsigned requests, signed-body byte tampering and stale timestamps are rejected before any SQL call. Actual valid HMAC requests flow from Operations caller dispatch; actual Finance SQL generates the signed ACK and actual sender validates it. Index no-store response header is checked.

The complete previous chain remains: new head0 bootstrap; authenticated Operations project review and replay; mixed revisions1–4; future metadata dependency produces503/retry; actual signed metadata delivery; lost committed response and exact retry; explicit Finance command; public recorded-cost read showing pending/previous money before apply, then canonical subtotal240000→240000→180000→0 with no double count. Customer attributes and eight invoice owner tables remain unchanged. Whole-project coverage stays unverified and cannot unlock closure.

## Limits

Two isolated PGlite databases and in-memory HTTP. The client adapter is not the real remote supabase-js network or deployed PostgREST/auth stack. Service-role selection and endpoint environment values are disposable fixtures; no credentials were retrieved. No hosted grant, deploy, migration, authenticated user UI, native concurrency or production activation is established. Time source authority remains synthetic around actual read-handler verification, as documented in the preceding evidence. Public endpoint grants remain revoked in product SQL.
