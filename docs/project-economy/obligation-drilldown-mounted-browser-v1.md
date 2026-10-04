# Mounted one-obligation browser proof

This is a new, isolated test boundary. It uses the actual application route,
AuthProvider, user-role/profile hooks, ProjectLayout, ProjectEconomyPage,
ProjectEconomyTab, saved-scope panel and selected-obligation child. It never
substitutes a test component or fabricated successful cost response.

The route is `/project/00000000-0000-4000-8000-000000001017/economy`.
The bare `/project/:id` index redirects to `project-next`, whose current simple
workspace does not contain the economy panel. The explicit economy route is
therefore required. Existing route/product sources remain root-owned.

The original 15-case authenticated proof and the new 18-case HTTP proof remain
separate. This browser stack must be fresh: the 18-case journey revokes actor199
at its end, so its already-mutated database cannot be reused or silently repaired.

## Owned artifacts

- `scripts/project-economy/operations-obligation-mounted-browser-bootstrap.sql`
- `scripts/project-economy/operations-obligation-mounted-browser.mjs`
- `scripts/project-economy/operations-obligation-mounted-browser-contract.test.mjs`
- this document

Root owns the isolated launcher, static controller, source pins, canonical DDL
closure and CI workflow. No product migration, live gate, provider request,
approval, official invoice or customer billing operation is part of this test.

## Genuine database and browser prerequisites

Use exact disposable PostgreSQL15.19 / PostgREST12.2.3, database
`eventflow_project_evidence_http_runtime`, established empty-cluster isolation
guard and pinned canonical DDL closure including 044751 and 054010. Prepare the
original fixture/journey and the drilldown extension fixture, with actor199 still
live, in this separate stack. Do not run the destructive end of HTTP18 here.

The new bootstrap requires the exact database, session flag
`test.project_evidence_fixture=true`, real actor199/org001 administrator and an
unused1017 namespace. It fails when any UI auxiliary table already exists. Its
canonical UI column shapes were audited from generated schema blob
`521b6de161276af85e0181cc2e0e109c1cdd8c3e`; actual route dependencies were read
through GitHub rather than inferred from incomplete local copies.

The bootstrap adds the projects→bookings relationship and exact fields consumed
by the real route. It creates the real local legacy read tables required by that
route, with authenticated SELECT only, live profile organization/role RLS and
live project membership. It grants no browser write or service credential.
Profiles/user_roles expose only the actual caller's identity/organization roles.

New project1017 has no Booking link **before** enrollment/composition, so genuine
scope membership remains consistent and no provider/planning proxy is needed.
Do not clear a link from an already-captured root as a shortcut.

The actual service receiver stores a synthetic immutable invoice1020 for180000
minor units. Actual authenticated commands append manual baseline1018, bind that
received allocation, append a second completely unknown manual baseline1028,
enroll scope1021 and compose the saved evidence. The incoming route enrollment
is disabled after the genuine fixture commit. Existing HTTP18 selectors are
unchanged. A real isolated legacy purchase700SEK remains separate, allowing a
before/after check that opening copied shadow evidence cannot double its cost.
No operating budget or source coverage is invented from those commercial facts.

The bootstrap emits `MOUNTED_BROWSER_SELECTORS=<JSON>` with actual immutable
composition/baseline IDs and their actual saved display row indexes. Composition
sorts random baseline UUIDs, so tests must not assume the known row is index1.
Root must capture the single exact metadata record privately and pass it as
`OPERATIONS_MOUNTED_BROWSER_SELECTORS` after successful guarded setup.

Build the exact reviewed source under test; do not substitute Lovable/main.
Serve the actual built App on bare loopback55612. Use canonical Playwright1.55.0
with Chromium installed by root's isolated job, not a local-browser claim.
Other cost evidence flags stay off. Exercise independent builds:

| Mode | Scope flag | Leaf flag | Expected proof cases |
|---|---|---|---|
| `disabled` | unset/false | unset/false | 2 |
| `scope_only` | true | unset/false | 3 |
| `enabled` | true | true | 11 |

Scope flag is `VITE_OPERATIONS_SCOPE_OBLIGATION_EVIDENCE_ENABLED`; leaf flag is
`VITE_OPERATIONS_OBLIGATION_DRILLDOWN_ENABLED`. Set
`OPERATIONS_MOUNTED_BROWSER_GATE_MODE` to the corresponding mode. This variable
declares the expected built artifact; observed DOM/network gates prove behavior.

## Actual authenticated transport binding

The current generated Supabase client hardcodes
`https://pihrhltinhewhoxefjxv.supabase.co`, so a VITE_SUPABASE_URL variable cannot
rebind it. The browser intercepts that exact origin before network access and
forwards **only** the audited native read paths to bare loopback55610. Original
signed actor JWT, RPC body/query and response bytes/status are preserved. No
cost response is fulfilled from an in-memory fixture or a computed substitute.
Replays/parsers/currentness are production reader behavior, not a proxy shim.

Allowed GET tables: profiles, user_roles, projects, bookings, large_projects,
project_budget, project_purchases, project_labor_costs,
project_staff_time_cost_lines, product_cost_overrides, project_billing,
project_tasks, project_files and project_activity_log. These are genuine native
queries under RLS. Only the exact scope read and selected-obligation read may
use POST; their parameter keys and saved immutable selector tuple are checked.
OPTIONS is transport-only for those same paths. Unknown write/RPC/function paths
are refused and fail the journey. Realtime and outside origins are blocked.

The browser loads a synthetic signed actor session into the actual
`eventflow-planning-auth` storage key. Production AuthProvider/getSession and
profile/role hooks run normally. The JWT really authenticates each native
PostgREST request; no decorative organization claim or service-role read header
is used. This proves signed fixture JWT behavior, **not** hosted GoTrue login,
HUB SSO, a human account/device or production provider-currentness.

Exact guard: CI=true, ISOLATED_PROJECT_EVIDENCE_HTTP=true and the named database.
Bare loopback endpoints are validated before credentials: UI55612,
PostgREST55610, private control55611. JWT and control secrets must be distinct
and at least32 UTF8 bytes. The controller remains root's fixed private interface;
the browser receives only its signed authenticated JWT.

## Enabled proof assertions

1. Actual route reads the genuine saved manual scope and retains unavailable
   prognosis/budget/margin.
2. The displayed saved row passes its exact composition/baseline/obligation IDs;
   its copied invoice180000 appears, while the genuine legacy cost headline700
   is unchanged.
3. Actual App persistence has successfully saved its ordinary project query but
   excludes both loaded private economic queries through `meta.persist:false`.
4. Collapse removes the selected child.
5. The unknown captured obligation has no invoice source and no manufactured
   zero or whole-project total.
6. A genuine native30-second scope poll removes selection and requires another
   explicit opening, even for the same immutable capture.
7. A fixed actual profile organization change causes native403 on the old tuple
   and removes private copied money; the fixed controller restores the profile.
8. A separately signed actual foreign actor cannot mount another tenant's scope.
9. A real same-organization project user reaches the route but receives native403
   for the administrative scope, with no selected detail or private copy.
10. Actual administrator role revocation causes native403 and hides old details.
11. No financial write was attempted; genuine evidence counts before/after are
    identical. All response bodies come from native PostgREST.

The controller mutation acknowledgement is exactly
`{ "status": "accepted", "operation": "drilldown/<operation>" }`, matching
its normalized path. HTTP request paths still start `/drilldown/`. No arbitrary
control SQL, target, actor or invoice body is accepted.

## Evidence limits

The pure Node boundary tests can run without any network or browser. A separate
embedded full-DDL fixture-body rehearsal verifies actual receiver/command/read
compatibility; its native database guard is deliberately excluded and it cannot
certify authentication, Chromium, HTTP or locking. Native guarded bootstrap,
exact mounted canonical browser execution and independent review are required
before this test boundary is reported passed. All hosted release/source gates
remain unchanged; received data does not certify upstream completeness.
