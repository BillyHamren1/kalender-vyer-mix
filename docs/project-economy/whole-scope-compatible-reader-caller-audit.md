# Exact source caller inventory and installed-state gates

Source repository: `BillyHamren1/kalender-vyer-mix`.
Immutable current audited source: `c0883d33cf995ed6fff8de7a668045392e1fd4bd`.
The GitHub recursive tree contains 4183 entries and reports `truncated=false`.
All 667 SQL blobs were read at that commit, including migration, pending and TEST
SQL. Their complete path/blob/byte inventory is saved in
`whole-scope-compatible-reader-source-audit.json`. Every decoded UTF8 body was
checked against its actual Git blob SHA1, including the exact Git byte header;
667 matched, zero missing or mismatched. The original complete 415bd253 audit has
661 SQL blobs; the newer tree adds six and changes one existing TEST fixture.
Every one of those seven delta bodies is separately read and Git-hash verified;
the three new production migrations are Catering authority/cache/eligibility and
contain no old scope-core reference or runtime dynamic EXECUTE body. This is an exhaustive SQL source inventory
at that pin, not a claim about a partial scratch mirror or a currently hosted DB.

## Named old-core references

| Source | Actual lines | Meaning |
| --- | --- | --- |
| 20261002052436_operations_scope_invoice_kernel_capture.sql | 10,82,83,84 | old private service core definition/ACL and public service invoker |
| 20261002061253_operations_scope_invoice_capture_admin_read.sql | 2,41,65,66,68 | old admin core definition, owner call to service core, ACL and public admin invoker |
| scripts/project-economy/whole-scope-publication-transaction-prototype.sql | 86 | TEST-only pg_temp publisher owner call; removed before product preflight |

No other current audited SQL file has a named call/definition/ACL reference to either
`read_scope_invoice_kernel_v1` or `read_scope_invoice_capture_admin_v1`.
Definitions and grants are not counted as runtime callers: the actual three static
caller edges are public service→private service, private admin→private service and
public admin→private admin. The new migration preflight verifies this exact
installed pre-migration graph, owner/security/search_path and existing public ACL.
An unexpected installed static caller fails before routing or grant changes.

## Privileged dynamic SQL audit

The complete 415bd253 base scan found 87 migrations containing both SECURITY DEFINER and an
EXECUTE token. Most EXECUTE tokens are trigger or GRANT statements outside a
function body. Lexical extraction identified 348 dollar-quoted SQL/plpgsql function
bodies and two fixed DO-generated `track_booking_changes` templates; 204 parsed
bodies explicitly declare SECURITY DEFINER. The only parsed privileged runtime
body containing dynamic EXECUTE is:

`public.sync_all_phase_times()` in
`20260428103857_75ec24c2-94ed-434d-9b83-d75a9afbeecd.sql`, blob
`d40b54a28313ed7f0216a6f095cb0db674e9f6b2`, definition line2, EXECUTE
lines82/94/111/124. It has zero caller arguments. Its four dynamic statements use
fixed bookings/calendar_events SQL and identifier columns chosen from three
literal phase tuples; values use bind parameters. It cannot accept a caller SQL
statement, choose an arbitrary function or dispatch either private cost core.
The later migration `20260818080414_ebbea7a7-9f12-48ca-b9b5-75aeb4d1f124.sql`
lists it in an ACL-hardening block at line154. Its current installed definition and
ACL must still be compared with this source inventory before activation.

The two August DO templates patch the specifically named existing
`public.track_booking_changes` body with fixed replacements and re-create that
same trigger function. They do not expose a runtime caller-supplied SQL dispatcher.
Generated bodies, DROP/ALTER statements and extensions are reasons not to equate
lexical source extraction with an installed PostgreSQL call graph. No generic
runtime caller-SQL definer is established by the audited source, but a currently
installed function not represented by the Git history remains a hard catalog gate.

## Candidate compiled closure and permissions

The current isolated candidate includes all 23 pinned transitive prerequisite
schema files, untouched 61253 and the new 130228 entry. Its actual direct-RPC test
compares old owner calls with new role-public calls for known and unknown source
cases. All eight captured replies match except volatile `as_of`, including saved
IDs/fingerprints, leaf diagnostics, copied amounts and unavailable/null flags.
The actual migration bytes reject an unexpected caller, wrong public definer mode
or changed private search_path; every negative fully rolls back and preserves old
grants. The valid migration then revokes role EXECUTE on old private cores while
retaining genuine old owner chains. This closes supplemental source/parity checks,
not simultaneous native sessions or signed JWT/PostgREST/App proof.

The separately verified hosted Operations environment is still f056 baseline,
ACTIVE_HEALTHY PostgreSQL15.8, with both candidate private schemas absent. It cannot
provide candidate52436/61253/130228 installed ACL evidence. Native PostgreSQL15.19
is the isolated test target; production15.8 identity and compatibility remain
separate release evidence.

Mandatory unresolved activation gates: actual candidate pg_proc/ACL and owner
chain comparison; generated/extension or unknown privileged dispatcher refusal;
all late row/key dependency and actual source/first-absent counterpart queue
families; genuine signed service/admin JWT boundary; complete read-only state
evidence and fourth mounted App admission. Other six public reader families remain
unmodified and separately unresolved. Neither this audit nor the TEST publisher
proves product monetary publication authority or Finance source admission.
