-- Rensa exakt-dubblett-pings (cachad GPS-bug på iOS-klienten).
-- Behåll första pingen per (staff_id, lat, lng, accuracy, speed)-grupp om
-- gruppen har fler än 1 rad inom samma 6-timmars-fönster.
-- Vi tar bort sena dubbletter (samma byte-värden) per dag.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        staff_id,
        lat,
        lng,
        COALESCE(accuracy, -1),
        COALESCE(speed, -1),
        date_trunc('day', recorded_at)
      ORDER BY recorded_at ASC
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY
        staff_id,
        lat,
        lng,
        COALESCE(accuracy, -1),
        COALESCE(speed, -1),
        date_trunc('day', recorded_at)
    ) AS grp_size
  FROM public.staff_location_history
)
DELETE FROM public.staff_location_history h
USING ranked r
WHERE h.id = r.id
  AND r.rn > 1
  AND r.grp_size >= 3;
