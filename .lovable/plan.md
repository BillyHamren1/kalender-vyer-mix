## Mål

Rensa det auto-skapade projektet för bokning **2605-22** (Nordic Stretch Tents AB) så att bokningen åter dyker upp som oplacerad i triagen och kan placeras på nytt.

## Vad jag hittade i DB

- Bokning: `407a1196-0d1f-4c74-9cbd-3c80e308c8f1` (`2605-22`)
- Projekt: `9f8e3321-ca87-4c07-a273-975ee3f60b90`, namn `Nordic Stretch Tents AB #2605-22`, status `planning`
- `calendar_events` med denna `booking_id`: **0**
- `large_project_id`: NULL (inte del av stort projekt)

Säkert att radera — inga kalenderhändelser eller LP-koppling finns.

## Migration som körs

Allt i en transaktion, hårt scopat till exakt detta projekt + denna bokning:

```sql
-- 1. Koppla loss bokningen
UPDATE public.bookings
SET assigned_project_id = NULL,
    updated_at = now()
WHERE id = '407a1196-0d1f-4c74-9cbd-3c80e308c8f1';

-- 2. Rensa beroende rader (inga FK:er kaskaderar)
DELETE FROM public.project_activity_log     WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_budget           WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_purchases        WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_quotes           WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_invoices         WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_labor_costs      WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_tasks            WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_files            WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_suppliers        WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.project_supplier_links   WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.pickup_stops             WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
DELETE FROM public.job_completion_analytics WHERE project_id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';

-- 3. Radera projektraden
DELETE FROM public.projects WHERE id = '9f8e3321-ca87-4c07-a273-975ee3f60b90';
```

## Förväntat resultat

- Bokning 2605-22 syns igen i "oplacerade"-listan.
- Projektet `Nordic Stretch Tents AB #2605-22` finns inte längre.
- Inget annat projekt/bokning påverkas.

## Notering

Detta är en engångs-cleanup i DB — ingen kodlogik ändras. Vill du också att jag lägger till en safeguard som förhindrar att samma situation uppstår igen (projekt utan kalenderhändelser sitter kvar som "aktivt") får du säga till efter att rensningen är gjord.