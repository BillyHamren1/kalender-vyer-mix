# Read-only audit: Brain ↔ Time direct_messages (no changes made)

Repo: Lovable project d42a96b9 (git HEAD 6c69303318c9bbe5bc8ba68a106af95b3c14ef04), Supabase pihrhltinhewhoxefjxv. Nothing was changed, deployed or read from message/customer rows.

## Schema (public)

direct_messages (RLS on, not forced)
- id uuid PK default gen_random_uuid()
- sender_id text NOT NULL, sender_name text NOT NULL, sender_type text NOT NULL default 'planner'
- recipient_id text NOT NULL, recipient_name text NOT NULL
- content text NOT NULL, is_read bool NOT NULL default false
- organization_id uuid NOT NULL default get_user_organization_id(auth.uid())
- created_at timestamptz NOT NULL default now()
- file_url, file_name, file_type, booking_id text NULL; delivered_at, read_at timestamptz NULL
- is_archived_by text[] NOT NULL default '{}'
- Constraints: only PK. No FK on sender/recipient (ids are free text: staff_members.id OR auth user id). No organizations FK, no unique/idempotency key.
- Indexes: (organization_id, LEAST(sender,recipient), GREATEST(sender,recipient), created_at); (recipient_id, is_read, created_at); recipient_id WHERE read_at IS NULL; booking_id WHERE NOT NULL.

staff_members (RLS on): id text PK, name text NOT NULL, email text UNIQUE NULL, user_id uuid NULL (no FK, not unique), organization_id uuid NOT NULL FK organizations, is_active bool NOT NULL default true, role/department text, active_mobile_session_id text, active_mobile_session_at timestamptz, plus HR/profile fields.

profiles (RLS on): id uuid PK, user_id uuid NOT NULL UNIQUE, email text, full_name text, organization_id uuid NULL, created_at/updated_at.

staff_accounts (RLS on): id uuid PK, staff_id text NOT NULL FK staff_members ON DELETE CASCADE, username text UNIQUE, password_hash text NOT NULL, organization_id uuid NOT NULL FK organizations, timestamps.

planning_brain_read_nonces (RLS on): id uuid PK, nonce text NOT NULL UNIQUE, organization_id uuid NOT NULL, consumed_at/created_at default now(), expires_at timestamptz NOT NULL (indexed). Consumed via RPC consume_planning_brain_read_nonce(_nonce, _organization_id). Not scoped by endpoint — a separate messaging endpoint sharing this ledger would share nonce space.

## RLS on direct_messages
- org_filter_direct_messages — PERMISSIVE, ALL, role public, USING and WITH CHECK organization_id = get_user_organization_id(auth.uid()).
- No per-participant restriction: any same-org authenticated user can read/write any DM in the org. No RESTRICTIVE policy.
- planning_brain_read_nonces: service_role_only (ALL, true).

## Realtime and triggers
- supabase_realtime publication: direct_messages yes; staff_members/profiles/staff_accounts no.
- direct_messages has no triggers (no push trigger, no DB webhook). Push is sent in application code: mobile-app-api send path (around line 5218–5277) resolves recipient as staff_members.id or profiles.user_id and looks up device_tokens directly and via staff_members.user_id, then calls send-push-notification. A Brain insert directly into the table would NOT push.
- Other triggers: staff_members set_org_id, trg_sync_new_staff_to_location_projects; staff_accounts set_org_id, update_staff_accounts_updated_at; profiles update_profiles_updated_at.

## Secrets (presence only)
- PLANNING_BRAIN_READ_SIGNING_SECRET: present (used by planning-brain-read with x-planning-timestamp/nonce/signature HMAC).
- Also present: PLANNING_WMS_HMAC_SECRET, SCANNER_TOKEN_SIGNING_SECRET, TIME_ADAPTER_SIGNING_SEED, SSO_SECRET, WEBHOOK_SECRET.
- No dedicated messaging signing secret exists. Reusing the read secret would grant write capability to any holder of the read key — recommend a distinct secret for the messaging endpoint.

## Identity mapping contract (HUB → Planning)
- verify-sso-token / receive-user-sync upsert profiles(user_id, email, full_name, organization_id) and upsert user_roles(user_id, organization_id, role).
- planning-brain-read authorizes actor by profiles.organization_id plus user_roles in the same org.
- Staff link: staff_members.user_id (nullable, non-unique) or email match (mobile-app-api uses ilike email). Mobile login uses staff_accounts.username → staff_id.
- DM dual identity: a person can appear as staff_members.id or auth user id in sender_id/recipient_id; readers query both ids.

## Gaps to handle in the PR
1. No idempotency column on direct_messages — Brain retries can duplicate unless a client-side dedupe key is added (schema change, needs approval).
2. RLS is org-wide, so participant checks must be enforced in the endpoint.
3. Push must be invoked explicitly (reuse mobile-app-api send path logic).
4. Nonce ledger is shared/unscoped by endpoint.
5. staff_members.user_id is non-unique; map actor deterministically and fail closed on 0 or >1 matches.

Runtime verification to follow when the Git PR is provided.
