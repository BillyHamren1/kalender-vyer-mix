-- Prevent duplicate Booking product projections when legacy `booking:<id>`
-- rows meet the canonical `src:<id>` identity format.

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA internal TO service_role;

CREATE TABLE IF NOT EXISTS internal.booking_product_sync_prefix_repair_audit (
  repair_id uuid NOT NULL,
  backup_role text NOT NULL,
  row_data jsonb NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (repair_id, backup_role)
);

REVOKE ALL ON internal.booking_product_sync_prefix_repair_audit
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON internal.booking_product_sync_prefix_repair_audit
  TO service_role;

CREATE TEMPORARY TABLE _booking_product_prefix_pairs ON COMMIT DROP AS
SELECT
  organization_id,
  booking_id,
  substring(sync_key FROM '^(?:booking|src):(.*)$') AS source_id,
  ((array_agg(id) FILTER (WHERE sync_key LIKE 'booking:%'))[1]) AS legacy_id,
  ((array_agg(id) FILTER (WHERE sync_key LIKE 'src:%'))[1]) AS canonical_id
FROM public.booking_products
WHERE source_missing_since IS NULL
  AND sync_key ~ '^(booking|src):'
GROUP BY organization_id, booking_id,
         substring(sync_key FROM '^(?:booking|src):(.*)$')
HAVING bool_or(sync_key LIKE 'booking:%')
   AND bool_or(sync_key LIKE 'src:%');

INSERT INTO internal.booking_product_sync_prefix_repair_audit (
  repair_id, backup_role, row_data
)
SELECT
  row.id,
  CASE
    WHEN row.id = pair.legacy_id THEN 'survivor_preimage'
    ELSE 'duplicate_preimage'
  END,
  to_jsonb(row)
FROM _booking_product_prefix_pairs pair
JOIN public.booking_products row
  ON row.id IN (pair.legacy_id, pair.canonical_id)
ON CONFLICT (repair_id, backup_role) DO NOTHING;

-- Keep the established UUID and local metadata, while copying the fields the
-- Booking importer itself owns from the newest canonical projection.
UPDATE public.booking_products legacy
SET name = canonical.name,
    quantity = canonical.quantity,
    notes = canonical.notes,
    unit_price = canonical.unit_price,
    total_price = canonical.total_price,
    parent_product_id = COALESCE(parent_pair.legacy_id, canonical.parent_product_id),
    is_package_component = canonical.is_package_component,
    parent_package_id = canonical.parent_package_id,
    sku = canonical.sku,
    labor_cost = canonical.labor_cost,
    material_cost = canonical.material_cost,
    setup_hours = canonical.setup_hours,
    external_cost = canonical.external_cost,
    cost_notes = canonical.cost_notes,
    sort_index = canonical.sort_index,
    inventory_item_type_id = canonical.inventory_item_type_id,
    inventory_package_id = canonical.inventory_package_id,
    assembly_cost = canonical.assembly_cost,
    handling_cost = canonical.handling_cost,
    purchase_cost = canonical.purchase_cost,
    package_components = canonical.package_components,
    discount = canonical.discount,
    vat_rate = canonical.vat_rate,
    tags = canonical.tags,
    tags_en = canonical.tags_en,
    source_missing_since = canonical.source_missing_since
FROM _booking_product_prefix_pairs pair
JOIN public.booking_products canonical ON canonical.id = pair.canonical_id
LEFT JOIN _booking_product_prefix_pairs parent_pair
  ON parent_pair.canonical_id = canonical.parent_product_id
WHERE legacy.id = pair.legacy_id;

UPDATE public.booking_products child
SET parent_product_id = pair.legacy_id
FROM _booking_product_prefix_pairs pair
WHERE child.parent_product_id = pair.canonical_id;

UPDATE public.establishment_tasks child
SET source_product_id = pair.legacy_id
FROM _booking_product_prefix_pairs pair
WHERE child.source_product_id = pair.canonical_id;

UPDATE public.large_project_booking_plan_items child
SET booking_product_id = pair.legacy_id
FROM _booking_product_prefix_pairs pair
WHERE child.booking_product_id = pair.canonical_id;

UPDATE public.packing_list_items child
SET booking_product_id = pair.legacy_id
FROM _booking_product_prefix_pairs pair
WHERE child.booking_product_id = pair.canonical_id;

DELETE FROM public.booking_products duplicate
USING _booking_product_prefix_pairs pair
WHERE duplicate.id = pair.canonical_id;

UPDATE public.booking_products survivor
SET sync_key = 'src:' || pair.source_id
FROM _booking_product_prefix_pairs pair
WHERE survivor.id = pair.legacy_id;

-- Database-level last line of defence: both prefixes resolve to the same
-- identity, even if an older function version is accidentally redeployed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_products_canonical_source_identity
  ON public.booking_products (
    organization_id,
    booking_id,
    (regexp_replace(sync_key, '^booking:', 'src:'))
  )
  WHERE sync_key ~ '^(booking|src):';
