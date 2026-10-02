# Invoice source entry barriers and missing-head protection

An existing v1/v2 row lock cannot protect an absent counterpart stream. A first
publication of that other protocol can otherwise appear after an original-source
read and before the authority transaction commits. The source-only unified view
remains valid received-as-of evidence; it is not reusable write authorization.

Migration `20261002032702_operations_invoice_economic_source_barriers.sql` adds
one canonical writer/authority barrier for destination Operations organization,
source Finance organization and invoice UUID. Keys are lowercased valid UUIDs,
with domain `invoice-economic-source-v1`, and multiple keys are deduplicated and
acquired in global C order. Original and credit invoice selectors must be derived
from authorized immutable saved source evidence, not guessed from a caller's
original anchor. The helper supplies locking only, never source authorization.

The unchanged public service RPC names/arguments call a new private definer entry
function. That entry parses only the bounded body's scope identities, obtains
the same-invoice barrier before any receiver head row lock, then forwards the
exact original raw bytes and arguments to the unchanged private v1/v2 core.
Existing validation, enrollment, nonce, currentness, raw fingerprint and receipt
semantics remain in the core. The new entry does not reconstruct the body,
infer an original, approve a credit or calculate any money.

Direct service execution of the old private receiver cores and direct stream/
snapshot/receipt mutations are revoked; immutable core functions run as their
owner and retain the rights needed for their actual public RPC path. Service
reads and explicit enrollment/configuration provisioning remain available. The
new private service entry always acquires the barrier, even if directly called.
There are no row triggers which could invert row/advisory acquisition order.

Future authenticated obligation/credit authority takes the existing organization
advisory lock, then sorted original/credit invoice barriers, then baseline and
both protocol head row locks. The receiver takes no organization obligation or
baseline lock and locks only its own invoice, so its order cannot require an
authority lock which is held by an authority waiting on that receiver. Existing
v1-only binders use organization→baseline→v1 head; they do not claim unified
source-currentness or credit eligibility. The actual source must be rederived
and the evidence saved within the same transaction; a prior HTTP response is
not a write authorization token.

The unchanged v1 and source-only v2 SQL journeys passed PGlite after installing
the wrappers. Grant regression checks and actual native concurrency source are
provided separately. The shell runner requires `CI=true`, loopback PostgreSQL with explicit
`PGUSER=postgres`/`PGPORT=5432`, an isolated guard and a dedicated
`eventflow_invoice_barrier_*` database. Host-address/service/options overrides
are rejected before the first database call. A read-only superuser and exact
synthetic fixture-state check precedes all harness mutation. Setup independently
requires `eventflow.invoice_barrier_isolated=synthetic-disposable`, the dedicated
database and the expected synthetic users/projects plus empty source ledgers
before creating records. Private temporary logs use umask 077; cleanup tracks
unreaped owned children and kills/waits before deleting logs. Its setup
uses synthetic actual receiver contracts under real database service/auth roles;
it creates no provider invoices, payments or customer messages. Native cases
observe real advisory waits before first v1/v2 head insertion, reversed original/
credit input ordering, and an actual authenticated local bind serialized before
a source correction. Statement deadlines bound every session.

No native two-session result is claimed until exact PostgreSQL CI executes those
cases. Both old native SQL and real v1 HTTP regressions must remain green after
the permission/path change. Real v2 HTTP, current unified original/own-credit
assignment, cumulative credit reservation, complete source/category coverage,
full-scope budget/EAC and release remain separate gates. EAC and eligibility stay
off; the additive barrier itself cannot complete those authorities.
