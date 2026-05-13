-- Sanera felaktigt inferred "home" som hamnat inom radien på en känd
-- arbetsplats (t.ex. FA Warehouse). Personer bor inte på lagret.
-- Vi raderar raderna helt så att infer-home-location får en ren start;
-- nästa körning av cron-funktionen kommer (med ny exclusion-logik) inte
-- återskapa dem.
DELETE FROM public.staff_inferred_home_locations h
USING public.organization_locations ol
WHERE ol.organization_id = h.organization_id
  AND ol.is_active = true
  AND COALESCE(ol.location_type, '') NOT IN ('private_residence')
  AND ol.latitude IS NOT NULL
  AND ol.longitude IS NOT NULL
  AND (
    2 * 6371000 * asin(
      sqrt(
        power(sin(radians(h.lat - ol.latitude) / 2), 2)
        + cos(radians(h.lat)) * cos(radians(ol.latitude))
          * power(sin(radians(h.lng - ol.longitude) / 2), 2)
      )
    )
  ) < (COALESCE(ol.radius_meters, 200) + 50);

-- Rensa även observations som ligger inom samma radie så att de inte
-- direkt bygger upp samma felaktiga "hem" igen vid nästa cron-körning.
DELETE FROM public.staff_home_observations o
USING public.organization_locations ol
WHERE ol.organization_id = o.organization_id
  AND ol.is_active = true
  AND COALESCE(ol.location_type, '') NOT IN ('private_residence')
  AND ol.latitude IS NOT NULL
  AND ol.longitude IS NOT NULL
  AND (
    2 * 6371000 * asin(
      sqrt(
        power(sin(radians(o.lat - ol.latitude) / 2), 2)
        + cos(radians(o.lat)) * cos(radians(ol.latitude))
          * power(sin(radians(o.lng - ol.longitude) / 2), 2)
      )
    )
  ) < (COALESCE(ol.radius_meters, 200) + 50);