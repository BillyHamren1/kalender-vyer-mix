# WMS packability contract v1

WMS owns packability. Packability affects only physical packing, scanner
eligibility and packing progress. It does not change the commercial order,
price, invoice, reserved quantity or product hierarchy.

## Naming and precedence

- Item-type master: `item_types.is_packable_default boolean not null default true`.
- Reservation/packing line snapshot: `product_packable_default`.
- Booking choice: `booking_packability_override boolean null`.
- Warehouse choice: `warehouse_packability_override boolean null`.
- Effective value: `is_packable boolean`.
- Provenance: `packability_source` = `product_default`, `booking_override` or
  `warehouse_override`.
- Concurrency: `packability_revision bigint`.

Precedence is warehouse override, Booking override, product default, then the
backwards-compatible fallback `true`. A product-master change is copied to new
reservation lines; it does not silently rewrite an existing order snapshot.

## WMS HTTP contract

Item types use `is_packable_default` only:

- `GET /item-types?include_packability=true`
- `PATCH /item-types/{id}/packability`
  `{ "is_packable_default": boolean, "expected_revision": number }`
- `POST /item-types/packability/bulk`
  `{ "items": [{ "id": uuid, "is_packable_default": boolean,
  "expected_revision": number }] }`

Booking writes through to WMS, never directly to Planning's projection:

- `PATCH /reservation-lines/{line_id}/packability`
- Headers: `Authorization`, `x-organization-id`, `Idempotency-Key`
- Body: `{ "booking_packability_override": boolean|null,
  "expected_revision": number }`

The success payload returns the complete reservation-line snapshot and
`meta.operation_id` plus `meta.changed`. Stable errors are `unauthorized` (401),
`forbidden` (403), `line_not_found` (404), `revision_conflict` or
`idempotency_conflict` (409), and `invalid_packability` (422).

Manual Booking rows are reservation lines of `type: manual`, with stable
`source_line_id`, null item/package ids and default-effective packability true.
WMS assigns and returns their `line_id`; consumers never infer it from a local
UUID, name or SKU.

`get-packing-list` returns the reservation-line field names above. Older
responses without packability fields are interpreted as packable/product
default/revision 1.

## Warehouse mutation

`POST edit-packing-list` accepts:

```json
{
  "packing_id": "uuid",
  "item_id": "uuid",
  "mode": "set_packable | set_non_packable | reset_packability",
  "operation_id": "uuid",
  "expected_revision": 1
}
```

The authenticated boundary derives organization and actor server-side, requires
an `admin` or `lager` role in that organization, and writes only
`warehouse_packability_override`. The operation id is idempotent. Disabling a
row with physical packing/verification/allocation already recorded returns
`row_touched` and rolls back.

The receipt contains `operation_id`, affected ids/count, changed count,
warehouse override, effective value/source, revision and
`booking_unchanged: true`.

