
-- Skapa packlista för befintlig bekräftad bokning
INSERT INTO packing_projects (booking_id, name, status)
VALUES (
  '190895cc-b4ee-43a9-be69-200eac620087',
  'Testkund eventflow skall ej faktureras - 2026-01-30',
  'planning'
);

-- Skapa standard-uppgifter för packlistan
INSERT INTO packing_tasks (packing_id, title, deadline, sort_order, is_info_only)
SELECT 
  pp.id,
  task.title,
  task.deadline,
  task.sort_order,
  false
FROM packing_projects pp
CROSS JOIN (
  VALUES 
    ('Packning påbörjad', '2026-01-25'::date, 1),
    ('Packlista klar', '2026-01-27'::date, 2),
    ('Utrustning packad', '2026-01-28'::date, 3),
    ('Utleverans klarmarkerad', '2026-01-29'::date, 4),
    ('Inventering efter event', '2026-02-01'::date, 5),
    ('Upppackning klar', '2026-02-02'::date, 6)
) AS task(title, deadline, sort_order)
WHERE pp.booking_id = '190895cc-b4ee-43a9-be69-200eac620087';
