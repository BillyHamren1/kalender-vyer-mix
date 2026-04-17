-- Ta bort alla kalenderhändelser på Live-kolumnen (team-11). 
-- Bokningarnas eventdate ligger kvar i bookings-tabellen och påverkas inte.
DELETE FROM public.calendar_events WHERE resource_id = 'team-11';