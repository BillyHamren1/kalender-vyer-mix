# Equipment work reference v1 — dormant proposal

Status: pure validator and identity-binding tests only, not accepted/deployed across owners. Module: `supabase/functions/_shared/equipmentWorkReferenceV1.ts`. No runtime endpoint imports it. No migrations or stock writes.

## Why existing contracts cannot be reused unchanged

Reviewed authoritative files on 2026-10-12:

- WMS `BillyHamren1/bundle-builder-base/supabase/functions/create-reservation/index.ts`, blob `ffae55d54d770a7198d602303802fa21158fa5e5`: external references accepted, server API key and organization header required. No project-authorized Operations browser writer established.
- Scanner `BillyHamren1/datacapture-hub/src/lib/outbound.transport.ts`, blob `993338bbd3e8f9b8d3838389d77ff4d3a5a7a8a2`: query and receipt bind booking/reservation, server actor/organization, operation/fingerprint, WMS revision and lifecycle.
- Scanner `src/lib/retur.transport.ts`, blob `254e04cdea9bb76c8576e6f3a8135fc6899335ce`: additionally binds exact return order and session.
- Operations existing `scannerReadContractV1.ts` remains booking-specific.

Changing a project's UUID into `booking_id` would falsify source provenance and invalidate these guarantees. A reservation external reference alone is insufficient to authorize or verify Scanner commands/returns.

## Proposed strict identity

`equipment_work_reference.v1` is a discriminated object:

| Field | Booking | Internal project |
|---|---|---|
| kind | booking | project |
| source_system | booking | operations |
| ID field | booking_id | project_id |
| source_organization_id | Exact owner tenant UUID | Exact owner tenant UUID |
| source_version | Owner-issued opaque version | Owner-issued opaque version |

Both ID fields together are rejected, as are omitted/malformed IDs, unknown fields/version, wrong source owner and inferred identifiers. Project and tenant IDs remain UUID strings. Booking IDs follow the existing Scanner `idSchema` (string length 1–200), preserved exactly, including leading zeros and any whitespace the owner accepted; the validator performs no trimming, numeric conversion or UUID coercion. Booking revision serialization must be explicitly agreed with its owner; do not substitute local `updated_at`.

`equipment_receipt_binding.v1` adds the complete work reference, mapped WMS organization UUID, exact actor/reservation IDs (strings 1–200), operation ID (string 8–200), canonical command fingerprint and explicit nullable session ID (string 1–200). Outbound and return are separate variants; return additionally requires exact return_order_id (string 1–200). Source and WMS tenant IDs are distinct fields because they may require an explicit server mapping. Payload equality does not establish that mapping or authorize the actor.

`matchesEquipmentReceiptBindingV1` validates both inputs and compares exact identity. It proves only an identity match. It must NEVER be used alone to label stock APPLIED or a command definitively REJECTED. Existing HTTP, authoritative WMS projection, revision progression, status transition, packer/session and quantity checks remain mandatory. Fingerprints bind envelopes; they are not signatures.

## Backward compatibility and activation ownership

| Owner | Required implementation before activation |
|---|---|
| Operations | Authenticated source-project authorization, source version, explicit tenant mapping, idempotent equipment request outbox; introduce optional negotiated work-reference transport without changing Booking v1. |
| WMS/Bundle | Persist immutable source work reference with reservation, verify server envelope and tenant, echo reference in projection/operation-status/outbound/return receipts. Retain sole stock/allocation authority. |
| Scanner | Negotiate work-reference capability, parse matching projection and receipt variant, retain all existing proof gates, include reference in canonical fingerprint, preserve pending-operation/reconcile identity. |
| Operations + WMS | Agree project lookup/authorization API and signed credential scope. Existing pricelist key endpoint alone does not prove project actor authority. |

No automatic adapter converts legacy receipts. Legacy booking v1 continues on its existing path. Internal-project flow remains disabled unless all three deployed owners advertise/support the negotiated protocol. Rollback disables the new capability; unresolved operation IDs retain their original version and are reconciled through that version, never replayed through v1 Booking.

## Acceptance before a real equipment test

1. Source owner verifies an active same-organization project and records an immutable request version.
2. Reservation create/replay/replace preserves provenance and idempotency without double reservation; conflicts remain visible.
3. Outbound and partial/full return preserve source work reference through command, projection and operation-status. Wrong actor/tenant/source/ID/version/fingerprint/session/return-order must remain unknown/rejected as appropriate, never projected locally.
4. Existing booking flows remain green and incapable clients never receive project commands.
5. Authorized disposable equipment scenario is verified signed-in against deployed WMS and Scanner. No production mutation is authorized by the presence of this dormant contract.

Current tests: 30 pure unit cases under declared Vitest 4.1.11. They establish parsing and identity comparisons only, not server authorization, RLS, integration, stock behavior or release readiness.


Booking/receipt syntax review: Scanner `src/lib/outbound.contract.ts` blob `154c9ff56f24316b12bbaea72c00168ee2f29008` and `src/lib/retur.contract.ts` blob `ab76b4a4bbe5764d3938269705c6e4ac85d4e03d` define `idSchema = z.string().min(1).max(200)` and `opIdSchema = z.string().min(8).max(200)`. Their domain brands do not impose UUIDs. The dormant contract now preserves those owner strings and tests legacy zero-padded and prefixed Booking IDs. This accepts syntax only; authorization and owner-record resolution remain separate mandatory server checks.
