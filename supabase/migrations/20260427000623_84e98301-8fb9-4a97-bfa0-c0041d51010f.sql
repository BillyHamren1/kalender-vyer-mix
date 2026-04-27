-- Cleanup: Billy Hamréns felaktiga "ghost"-restid och autostartad workday 2026-04-26.
-- Restiden startade från privat adress (Upplandsgatan 15) innan dagens första
-- jobb-incheckning, vilket den nya pre_workday_commute-spärren förhindrar framåt.
-- Workday autostartades av travel_start, vilket inte längre är tillåtet.

DELETE FROM public.travel_time_logs
WHERE id = 'aef4239f-4ff2-4b17-adc8-ee6eab7bdbaa';

DELETE FROM public.workdays
WHERE id = '982a3fb4-2fe8-4ceb-8d36-5e60eb864b57';