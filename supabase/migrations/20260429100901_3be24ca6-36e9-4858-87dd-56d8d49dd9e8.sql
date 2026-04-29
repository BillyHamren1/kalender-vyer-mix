-- Soft-cancel duplicate packing_projects per (booking_id, organization_id) where large_project_id IS NULL.
-- Keep the canonical row: most packing_list_items, tie-break by oldest created_at.
-- Duplicates get status='cancelled' and warehouse_project_id=NULL so they stop appearing in inbox/active flows
-- but are preserved for audit. Idempotent.

WITH ranked AS (
  SELECT
    pp.id,
    pp.booking_id,
    pp.organization_id,
    pp.created_at,
    (SELECT COUNT(*) FROM public.packing_list_items pli WHERE pli.packing_id = pp.id) AS item_count,
    ROW_NUMBER() OVER (
      PARTITION BY pp.booking_id, pp.organization_id
      ORDER BY
        (SELECT COUNT(*) FROM public.packing_list_items pli WHERE pli.packing_id = pp.id) DESC,
        pp.created_at ASC
    ) AS rn
  FROM public.packing_projects pp
  WHERE pp.large_project_id IS NULL
    AND pp.booking_id IS NOT NULL
    AND COALESCE(pp.status, '') <> 'cancelled'
)
UPDATE public.packing_projects pp
SET status = 'cancelled',
    warehouse_project_id = NULL
FROM ranked r
WHERE pp.id = r.id
  AND r.rn > 1;

-- Same dedupe for consolidated (large project) packings
WITH ranked AS (
  SELECT
    pp.id,
    pp.large_project_id,
    pp.organization_id,
    pp.created_at,
    (SELECT COUNT(*) FROM public.packing_list_items pli WHERE pli.packing_id = pp.id) AS item_count,
    ROW_NUMBER() OVER (
      PARTITION BY pp.large_project_id, pp.organization_id
      ORDER BY
        (SELECT COUNT(*) FROM public.packing_list_items pli WHERE pli.packing_id = pp.id) DESC,
        pp.created_at ASC
    ) AS rn
  FROM public.packing_projects pp
  WHERE pp.large_project_id IS NOT NULL
    AND COALESCE(pp.status, '') <> 'cancelled'
)
UPDATE public.packing_projects pp
SET status = 'cancelled',
    warehouse_project_id = NULL
FROM ranked r
WHERE pp.id = r.id
  AND r.rn > 1;