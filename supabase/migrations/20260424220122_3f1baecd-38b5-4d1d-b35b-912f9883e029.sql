-- Migrera project_comments → projects.internalnotes
WITH grouped AS (
  SELECT 
    project_id,
    string_agg(
      to_char(created_at AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') 
        || ' ' || COALESCE(author_name, 'Okänd') || ': ' || content,
      E'\n'
      ORDER BY created_at
    ) AS comment_block
  FROM public.project_comments
  GROUP BY project_id
)
UPDATE public.projects p
SET internalnotes = 
  CASE 
    WHEN COALESCE(NULLIF(trim(p.internalnotes), ''), '') = '' 
      THEN '--- Tidigare kommentarer ---' || E'\n' || g.comment_block
    ELSE p.internalnotes || E'\n\n' || '--- Tidigare kommentarer ---' || E'\n' || g.comment_block
  END,
  updated_at = now()
FROM grouped g
WHERE p.id = g.project_id;