# Credit capacity native concurrency verification

This separate disposable harness verifies actual local capacity RPC concurrency.
It does not prove an upstream provider is current, a credit is eligible for project
costs, or operational EAC is complete.

Use a fresh database named `eventflow_own_credit_capacity_<suffix>` with the exact
foundation/review/scope/inverse-v1/local-obligation/inverse-v2/barrier/own-credit/
capacity migrations. First run unchanged `operations-own-credit-native-setup.sql`
with the generated authority `fixture` and setup GUC
`eventflow.own_credit_isolated=synthetic-disposable`. Do not run its concurrency
script. Then run `operations-credit-capacity-native-setup.sql` with setup GUC
`eventflow.credit_capacity_isolated=synthetic-disposable`. Both setup transactions
reject a nondedicated database, missing explicit guard or foreign fixture state
before creating records.

Unset PGOPTIONS and run `operations-credit-capacity-native-concurrency.sh` with
CI=true, EVENTFLOW_CREDIT_CAPACITY_ISOLATED_DB=true, PGHOST=127.0.0.1,
PGPORT=5432, PGUSER=postgres and that exact dedicated database. The runner rejects
libpq host-address/service/options overrides before its first psql call, verifies
superuser plus exact synthetic scope/admin/source/assignment state, and uses
private logs with owned-child kill/wait cleanup.

The seed creates two actual saved negative credits and authenticated own-source
assignments to one real positive original allocation: 50000 and 500000 against
540000. A real authenticated first capacity transaction holds its organization
barrier; the second distinct credit must be observed waiting and then fail with
exact SQLSTATE22023/actual_original_credit_capacity_exceeded. Only one 50000
reservation/head may commit. This is different from two commands competing for
the same own-credit assignment CAS.

A second actual capacity transaction holds its original source barriers while a
real service receiver submits a newer 400000 original source. The receiver must
be observed waiting before the original head advances. After commits, the old
capacity read is unresolved and its 50000 reservation remains retained. No status
or source change automatically releases reserved capacity.

Writer transactions have bounded statement deadlines. Seed-only in-memory
rehearsal, source review, syntax and pre-connection refusal checks are distinct
from actual PostgreSQL two-session results. Only the exact native CI head/run can
close these concurrency gates; authenticated PostgREST/JWT, actual v2 HTTP,
all-credit completeness, kernel mapping, source/category coverage and release
remain separate gates. Tenant capacity defaults off and credit_eligible stays
false/EACnull throughout this contract.
