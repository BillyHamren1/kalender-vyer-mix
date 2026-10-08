# Explicit Operations source-bound consumption policy

This additive layer captures a deliberate Operations decision about replacing
an estimate and consuming a commitment. It does not supply, price or approve
the underlying invoice cost. Only a live authenticated organization admin for
the actual nondeleted local project can append a decision; the database derives
organization, actor, currency, source anchor and economic fingerprint.

The initial authority is explicitly `local_project_only`. It does not enroll a
whole canonical large/packing economic scope or authorize combined leaf and
whole-project baselines. A future complete-scope source projection must dedup
actual source anchors and capture current membership/revision before aggregation.

The exact ten-field command is `schema_version:
operations-obligation-source-policy.v1`, `project_id`, `obligation_id`,
`baseline_event_id`, `binding_event_id`, `expected_policy_revision`,
`replaces_estimate_minor`, `consumes_commitment_minor`, `idempotency_key`, `reason`.
Both monetary policy fields are independently nonnegative safe integers or null.
An unknown corresponding baseline permits only null. Zero is explicitly entered,
not a default. The current obligation baseline and latest binding must match
both immutable references; the current invoice economic revision/fingerprint
must still match the binding. A stale source, old baseline or old binding fails
closed before any decision is saved.

Decision revisions are monotonic for one organization/obligation/source anchor.
The organization advisory lock shared with baseline/binding commands, saved-head
CAS and source row lock serialize policy, baseline and source changes. Immutable
events capture the selected baseline/binding/economic fingerprint, actor/reason,
currency and both policy amounts. Exact retry returns the original event;
changed idempotency conflicts. Update/delete/truncate and head rewinds fail.

Aggregate bounds use the latest policy per anchor for the same immutable
baseline, including retained stale policy reservations. They never sum repeated
policy revisions or release a reservation just because source status/metadata
changed. The new decision replaces that anchor's previous policy only through
an explicit reviewed revision. Known replacement/consumption sums must remain
within their respective known baseline. Credits cannot use this positive-original
policy API, restore already-consumed budget or silently change the original's
policy. A baseline/source correction makes saved policy stale and requires
an explicit decision bound to the new immutable evidence.

The initial projection is shadow source-policy evidence, receiver-v1-only. A
known policy does not prove complete source/category inventories, whole-project
remaining costs or current v2 original/credit eligibility. EAC stays null and
credit eligibility false. The unified real v1/v2 source resolver and complete
project aggregation remain separate activation gates. The frozen obligation
calculator, isolated forecast contract, invoice source engine and existing
policy-less original reader remain unchanged.

Migration `20261002025617_operations_obligation_source_policy.sql` implements
authenticated `append_operations_obligation_source_policy_v1(p_command)` and
service-only `read_operations_obligation_source_policy_v1(organization, project,
obligation, source_anchor)` through private definer/public invoker boundaries.
The projection locks the saved policy head and returns only the exact current
immutable decision with its saved evidence. It retains `local_project_only`,
`receiver_v1_only`, `credit_eligible: false`, unavailable remaining and null EAC.
Caller-supplied baseline/binding references are selectors which the database
rechecks; they are not trusted proof. Freshness locks last only for that SQL
transaction. Future credit/forecast writes must perform their source/ledger
checks atomically, not reuse a previous HTTP read as authorization.

Three focused command cases and Deno source checks passed. The generated
rollback-only SQL journey passed PGlite using actual receiver, baseline, binding
and policy RPCs under real database roles. It proves explicit unknown commitment,
malformed/injected fields, CAS/replay/conflict, atomic injected-failure rollback,
retained rejected-source reservations, aggregate estimate and commitment bounds,
explicit replacement different from observed invoice cost, baseline/source
invalidation, revocation and immutable head/history. Native PostgreSQL,
cross-session policy/source concurrency, real authenticated PostgREST and the
unified actual v2 source resolver remain separate gates.
