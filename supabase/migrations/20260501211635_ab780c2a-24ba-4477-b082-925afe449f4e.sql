DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN SELECT id FROM establishment_tasks WHERE source = 'default' LOOP
    BEGIN
      DELETE FROM establishment_tasks WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      -- ignore single row failure to avoid abort
      NULL;
    END;
  END LOOP;
END $$;