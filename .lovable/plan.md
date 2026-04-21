

## Korrigera Jānis tider — resa och Westmans

### Vad som är fel

1. **Resa → Holmträskvägen 19** slutar kl 10:05 (UTC 08:05) — ska sluta **08:22 svensk tid** (UTC 06:22)
2. **Westmans booking-timer** startar kl 08:24 (UTC 06:24) — ska starta **08:22 svensk tid** (UTC 06:22)

### Åtgärder (två UPDATE-satser)

**1. Korrigera resans sluttid**
```sql
UPDATE travel_time_logs
SET end_time = '2026-04-21 06:22:00+00'::timestamptz,
    hours_worked = EXTRACT(EPOCH FROM ('2026-04-21 06:22:00+00'::timestamptz - start_time)) / 3600.0
WHERE id = '1b680bf3-2aea-4753-a70f-2d0765cdff32';
```
Ändrar sluttid från 10:05 → 08:22 (svensk tid). Resan blir ca 1h 6min istället för 2h 49min.

**2. Korrigera Westmans starttid**
```sql
UPDATE location_time_entries
SET entered_at = '2026-04-21 06:22:00+00'::timestamptz
WHERE id = '97fe14f4-70ae-4a77-9edd-f3789895e59c';
```
Ändrar start från 08:24 → 08:22 (svensk tid). `total_minutes` räknas om automatiskt (genererad kolumn).

### Resultat efter korrigering

| Rad | Tid (svensk) | Duration |
|---|---|---|
| Lager | 06:58 → 07:15 | 17 min |
| Resa → Holmträskvägen 19 | 07:15 → 08:22 | ~1h 7min |
| 2603-31R1 · Westmans | 08:22 → 10:16 | ~1h 54min |
| Resa | 10:16 → 12:07 | ~1h 51min |
| Lager | 11:03 → 12:07 | ~1h 3min |

