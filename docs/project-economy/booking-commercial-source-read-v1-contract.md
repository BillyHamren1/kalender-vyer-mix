# Operations caller for immutable Booking commercial evidence

Implemented in new Operations shared modules only. Evidence: 21 focused synthetic cases and Deno 2.8.1 source checks passed; response validator independently reviewed/tested. Finance endpoint/storage native proof, authenticated default-fetch HTTP chain and source-mapping persistence are separate open gates. No production read, release or economic activation is claimed.

## Locked wire and source boundary

POST to the exact server-enrolled HTTPS URL ending `/functions/v1/finance-booking-commercial-evidence-read`. Requests contain exactly nine keys: `schema_version='operations-booking-commercial-read.v1'`, `operations_organization_id`, `economic_scope_id`, `scope_revision`, `finance_organization_id`, `finance_project_id`, `booking_source_organization_id`, `booking_source_id`, `requested_source_sequence`. Scope/source revisions are positive safe integers; source selection is a positive safe integer or explicit null for latest **received**. UUID spelling normalizes only valid UUID identities. Local Operations text booking IDs never become canonical IDs by resemblance.

The Operations source configuration must be server-resolved and enabled explicitly, with matching Operations/Finance/source Booking organizations, exact trusted HTTPS URL and dedicated read key. This client checks those labels but **does not authorize a scope/member**: the reachable backend must first resolve live Operations scope and explicit source authority, and Finance independently enforces its exact allowlist. There is no browser/caller-provided key/configuration or shared Finance service key.

Headers are `x-eventflow-key-id`, `x-eventflow-timestamp` (integer epoch seconds), `x-eventflow-nonce` (fresh base64url 16–128), `x-eventflow-signature` (`v1=` + HMAC-SHA256 lowercase hex). Key ID is `[A-Za-z0-9_-]{4,64}` and secret at least 32 UTF8 bytes. Sign exact newline-joined values:

```text
POST
finance-booking-commercial-evidence-read
operations-booking-commercial-read.v1
<key_id>
<timestamp>
<nonce>
<exact UTF8 raw request body>
```

Finance's receiver allows ±120 seconds and uses dedicated `FINANCE_BOOKING_COMMERCIAL_READ_ENABLED` and `FINANCE_BOOKING_COMMERCIAL_READ_HMAC_KEYS_JSON`. A read signature does not authorize personnel ingestion, invoice operations or payments. Network redirects are rejected.

## Copied immutable response

Exactly 27 keys: `schema_version='finance-booking-commercial-evidence-read.v1'`; the eight request identity/selection fields; `state`, `receipt_id`, `source_sequence`, `commercial_snapshot_id`, `commercial_revision`, `currency`, `invoiceable_net_minor`, `invoiceable_vat_minor`, `lifecycle_status`, `source_disappeared`, `rows`, `latest_received_sequence`, `is_latest_received`, `observed_at`, `received_at`, `as_of`, `upstream_currentness`, `evidence_fingerprint`.

Received rows contain exactly `source_row_id`, `source_row_revision`, `net_minor`, `vat_minor`, `quantity`. IDs are unique bounded strings, row revision positive safe integer, net/VAT **signed** safe integers. The approved adjustment row may legitimately be negative. Quantity is an exact bounded signed decimal string (`^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`, max 64); `1.00` is preserved. Do not clamp, normalize decimal scale, multiply prices, compute tax, or infer an operating-cost budget.

BigInt sums verify copied row net/VAT totals equal copied nonnegative header amounts. This is a consistency check, not commercial recalculation. A disappearance returns a cancelled snapshot while retaining saved money/rows; earlier row revisions need not equal the later disappearance source sequence. Source Booking sequence and Finance commercial revision remain different counters.

`no_evidence` has null selected receipt/snapshot/revisions/currency/money/lifecycle/disappearance/timestamps/fingerprint, empty rows and `is_latest_received=false`. For a latest request, latest received sequence is null. For a missing historical request, latest received sequence may be known. A stored receipt with a missing or malformed commercial snapshot is an explicit source error, not `no_evidence`. Missing money never becomes zero.

Historical evidence may have a newer latest received sequence. Latest selection must return the latest received revision; explicit historical selection must match its requested source sequence. `upstream_currentness` is always `unverified`. Latest **received** consistency does not prove the Booking queue is current or drained.

## Fingerprint

SHA256 over UTF8 compact `JSON.stringify` of the following positional array, using valid canonical UUID spelling and exact row order/text/timestamps:

```text
[
 'finance-booking-commercial-evidence-read.v1',
 operations_organization_id, economic_scope_id, scope_revision,
 finance_organization_id, finance_project_id,
 booking_source_organization_id, booking_source_id,
 receipt_id, source_sequence, commercial_snapshot_id, commercial_revision,
 currency, invoiceable_net_minor, invoiceable_vat_minor,
 lifecycle_status, source_disappeared,
 rows.map(r => [r.source_row_id, r.source_row_revision, r.net_minor, r.vat_minor, r.quantity]),
 observed_at, received_at
]
```

Requested selection, latest received state and read `as_of` are intentionally excluded: the same scoped historical receipt keeps its immutable fingerprint. Missing evidence has a null fingerprint. The exported hashing helper assumes validated input; production ingestion must call the strict full validator. Hashing alone is neither source authentication nor upstream-currentness proof.

## Failures and verification

The caller defaults to a 10-second deadline over the full fetch/body read, at most 15 seconds if server-configured. It enforces 4096-byte request and 256KiB response bounds, JSON/UTF8/schema/proof validation, no truncation. The timeout flag is set before abort/cancellation and checked after EOF/validation, so a cancellation success race cannot accept timed-out evidence. Raw peer failures and secrets are not returned.

Only HTTP 200 carries validated evidence. 401 maps to source authentication failure, 403 to forbidden scope, server failure/network loss to unavailable source; other statuses, malformed body or proof mismatch to invalid source response. Read retry must use fresh nonce; an unavailable source remains unavailable. The caller has no cost/publication/attest/write side effects.

Next exact gates: independent caller review; SQL/manual compact JSON versus both TS fingerprint implementations (Unicode, quote/backslash, signed adjustment, scaled quantity, safe-int limits and saved DB timestamp text); actual Finance handler plus PostgreSQL/PostgREST and default-fetch HTTPS; disabled/revoked enrollment and nonce failures; historical/missing/disappearance paths; immutable Operations source observation and authenticated explicit local-text mapping; upstream-currentness and full-scope Finance ownership before any complete project revenue/margin claim.
