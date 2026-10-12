# Brain ↔ Time internal messages

Canonical data stays in Time/Operations `direct_messages`. Brain calls `brain-internal-messages` with the real user JWT; that function checks the canonical active organization claim and membership, signs a narrowly allowed request, and calls `mobile-app-api`. Operations checks HMAC freshness, one-use nonce, same-organization profile and role, and an unambiguous active staff link. A planner without a staff row keeps their verified auth ID. The existing send handler writes the message and invokes the existing push path.

The two projects need a new identical server-only `BRAIN_INTERNAL_MESSAGES_SIGNING_SECRET` (at least 32 characters). Never reuse `PLANNING_BRAIN_READ_SIGNING_SECRET`. Brain also needs `BRAIN_INTERNAL_MESSAGES_URL=https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mobile-app-api`. No secret belongs in Git or a VITE variable. Missing configuration fails closed.

## Changes

- Same-row retry using a client UUID in the existing primary key; a repeated ID returns only an identical original send. Conflicting body/actor/recipient/org returns 409. Replays do not invoke push again.
- Composite `(created_at,id)` pagination, 31st-row lookahead, DB-side archive filtering and dual staff/auth identities. Older clients may still pass ISO cursors.
- Read receipts stop at an explicitly observed inbound message; a newer arrival stays unread.
- Time retains the retry ID and scopes its inbox cache to organization and staff.
- Private messages are removed from organization-wide dashboard reads unless the caller participates. Legacy messaging tokens now require a matching server session; missing session or failed lookup does not grant access.
- A migration adds restrictive participant policies, sender-only inserts and immutable authorship/content. It preserves the existing tenant policy. Service-role handlers remain responsible for their own actor checks.

## Validation and activation

Local Node contract/security tests: 16 passed. Isolated PostgreSQL RLS assertions: passed. Brain contract and UI tests are in the paired PR. Changed TypeScript sources parse successfully. Full repository builds and Deno checking are CI gates, not locally claimed passes: the local Git snapshots are partial.

Run `node --experimental-strip-types --test tests/internal-messages.test.mjs`. Run `node tests/internal-messages-rls.mjs` with `@electric-sql/pglite@0.3.14` available (or PGLITE_MODULE pointing to its installed entry). CI installs that test runtime outside the checkout; no production database is contacted.

Before activation: review both PRs, verify CI, apply the participant migration in isolated staging, deploy the Operations function, configure both server secrets and the Brain URL securely, deploy the Brain adapter, then test with two explicit test accounts in one organization and one in another. Check both staff/auth ID directions, retry after response loss, 31+ messages, simultaneous arrival while marking read, and one push per accepted send. Production customer messages were not read or sent during this implementation.

## Remaining release checks

Backend metadata confirmed same-organization users can read active session IDs. Therefore both login endpoints now issue an HMAC-signed envelope, and all direct-message actions (including aggregate inbox/dashboard routes) require the signature as well as the live server session. The envelope remains base64 JSON for compatibility with existing clients. Signing uses the existing server-only Supabase service-role credential with a distinct mobile-session domain; no credential is sent to clients. Unsigned tokens are never silently upgraded by refresh. Existing unsigned mobile sessions must log in again before messaging. Deploy **both mobile-app-auth and mobile-app-api together**, then verify both login routes. Other legacy endpoints are outside this messaging hardening and still need a wider auth audit.

Lovable verified archive/unarchive RPC execution is restricted to postgres/service_role; browser callers cannot invoke them. The migration matches the actual schema, and the nonce RPC accepts two arguments with its existing TTL default. Three additional token-signature tests passed, including spoofing with a known session ID, claim tampering and expiry.

Inbox grouping still uses the latest 200 rows. The response explicitly reports `truncated`; Brain explains that older conversations can be reopened through colleague search. Counts in that bounded preview are not an authoritative lifetime total. Brain v1 sends text; existing attachments are identified and opened in Time. AI-initiated sending is not added: sends here come from the user's explicit Send button.

Push failure after a successful DB insert remains best-effort; retry guarantees one message, not guaranteed push delivery. A durable notification outbox is a separate improvement.

No migration, deployment, live secret change, main merge or real recipient send is included in the Git change itself.


## Deployment receipt — 2026-10-12

Operations PR #53 merged at 659693a6ef1877e413d2be4769e1f0c6f97f7aa0. Lovable applied the reviewed participant migration as `20261012134510_a41b3aae-bd1c-4fa8-89aa-2a13060a68a0.sql` and added `20261012134548_79f64cdb-d069-48cc-8c1d-687abf3c5720.sql` to revoke anonymous execution of the authorization helper. The original 20261012090000 file was never recorded as applied and is removed in favor of these canonical deployed migrations, preventing duplicate CREATE POLICY/CREATE TRIGGER on fresh installs. Applied migration files remain unchanged. The isolated RLS test executes both deployed files and checks the anonymous function grant.

Both mobile-app-auth and mobile-app-api deployed. Database metadata confirms all restrictive policies and trigger; unsigned/fabricated request probes were rejected. Valid-login and end-to-end message/push checks are still not claimed.
