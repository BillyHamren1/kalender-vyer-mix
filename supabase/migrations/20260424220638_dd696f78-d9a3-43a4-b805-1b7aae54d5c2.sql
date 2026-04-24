ALTER TABLE public.large_projects ADD COLUMN IF NOT EXISTS internalnotes text;

WITH grouped AS (
  SELECT 
    large_project_id,
    string_agg(
      to_char(created_at AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD HH24:MI') 
        || ' ' || COALESCE(author_name, 'Okänd') || ': ' || content,
      E'\n'
      ORDER BY created_at
    ) AS comment_block
  FROM public.large_project_comments
  GROUP BY large_project_id
)
UPDATE public.large_projects p
SET internalnotes = '--- Tidigare kommentarer ---' || E'\n' || g.comment_block,
    updated_at = now()
FROM grouped g
WHERE p.id = g.large_project_id;