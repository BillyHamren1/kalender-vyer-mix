# Independent Operations SQL receipt

2026-10-12. Executed full candidate migration `20261012124216_internal_project_classification.sql` SHA256 `4826ee2838437cfcc8d9ee0dac3ebdbe8fecba6195b6e3064e21d13975e1750f` against embedded PostgreSQL @electric-sql/pglite 0.5.8 with a minimal prior schema and synthetic tenant RLS/auth helper fixture. Node v24.19.0. Result: 10 tests passed, zero failed.

Command: `PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js OPERATIONS_MIGRATION=/absolute/path/to/20261012124216_internal_project_classification.sql node --test operations-internal-sql.test.mjs`.

Cases: internal no-booking constraint; supported currency; all billing discriminators for internal identity; customer billing and blocked internal relabel; completed INSERT requiring explicit zero remainder; open-task closure failure then success; anonymous warehouse denied; foreign organization warehouse denied; tenant RLS hide/insert deny; own-tenant billing pointing to foreign internal project rejected.

The last test initially failed on the preceding migration: SECURITY INVOKER lookup could not see a foreign project and passed the insert. Operations owner fixed canonical medium-target lookup to require matching organization and fail closed when inaccessible. Independent rerun passed. Earlier review findings for UUID/text mismatch, insert completion and anonymous grants are also covered by passing behavior above.

Not proved: full production migration replay, deployed database, actual auth tokens, authenticated browser, real staff/mobile behavior, two-session PostgreSQL lock ordering or release. Fixture RLS reflects the tenant boundary but does not prove all historical production policies. No production data or external side effects were used.
