UPDATE public.large_projects
SET deleted_at = now()
WHERE id = '4baca052-3c57-46b2-886a-5cc92105387c'
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.large_project_id = '4baca052-3c57-46b2-886a-5cc92105387c'
       OR b.assigned_project_id = '4baca052-3c57-46b2-886a-5cc92105387c'
  );