# Accepted caller writer inventory — draft scope decision

Base: `e28414f44068716a798831a9c0acb36bb20d7d61`. No caller activation or product SQL change is implemented by this inventory.

| Reachable writer | Existing caller privilege | Accepted integrity implication |
| --- | --- | --- |
| `public.publish_operations_personnel_cost_v1` | service EXECUTE; security invoker | Can advance canonical head/publication without accepted marker or outbox |
| `public.publish_operations_personnel_cost_outbox_v1` | service EXECUTE; security invoker | Older alternate publisher bypasses current ingress; calls lower publisher |
| `public.publish_operations_personnel_cost_ingress_v1` | service EXECUTE; security invoker | Current canonical source publisher, but no accepted-stream mode fence |
| `operations_economy_private.publish_project_reviews_v1`, exposed public wrapper | authenticated EXECUTE; private implementation security definer | Can append reviewed canonical revision without accepted marker |
| `operations_personnel_cost_streams` | service SELECT/INSERT/UPDATE | Can insert arbitrary day/head or overwrite current revision directly |
| `operations_personnel_cost_publications` | service SELECT/INSERT | Append-only prevents edits/deletes but permits direct forged revision insertion |
| `operations_personnel_cost_outbox` | service SELECT/INSERT/UPDATE | Existing accepted delivery guard protects UPDATE only after marker; direct INSERT before marker remains possible |
| `operations_personnel_project_publication_links/proofs` | service SELECT/INSERT; `record_project_publication_proofs_v1` service EXECUTE | Direct or invoker-helper INSERT can manufacture shadow links/proofs, though issued review predicates still constrain trusted semantics |
| Shadow claim/finish | service EXECUTE | Current exclusion is accepted marker per row, not accepted ownership of whole stream |
| Project grant/review commands | authenticated; issued markers; live actor checks | These authorized decisions are distinct from publishing accepted cost; preserve decisions while fencing legacy publication |
| Rate/source/target/route provisioning | mixed service writes plus issued-rate admin commands | Existing accepted issuer compares exact immutable enrollment source binding and accepted-rate proofs; changes must remain fail-closed, never fallback |

Definitions come from the canonical evidence/outbox/review migrations, latest `20261012165000_operations_personnel_review_issuance.sql`, TEXT compatibility and current accepted transport scripts. No published lower-publisher revoke was found. Append-only is not an INSERT authorization boundary.

A safe connection needs one owner-only canonical mutation implementation behind guarded same-OID legacy façades, not only a new TypeScript branch. Issuer and accepted-review wrappers call the private inner implementations. Avoid renaming public function OIDs as a shortcut that could retain cached/dependent access to unguarded implementations. Legacy façades must reject accepted ownership even when their caller executes as a security definer.

Direct stream/publication/outbox/link/proof DML requires an accepted-ownership guard using a fixed trusted SQL owner, not caller-settable flags. Future accepted worker ownership must be persisted independently of a day's stream enrollment, otherwise first-ever/new-day missing enrollment is indistinguishable from shadow permission. Disabled ownership remains accepted/fail-closed. Current stream enrollment helper deliberately requires an existing canonical stream; do not bootstrap by publishing a shadow row.

Root scope decision requested before this expanded SQL boundary is implemented. Existing explicit Finance actor/period application remains outside transport.
