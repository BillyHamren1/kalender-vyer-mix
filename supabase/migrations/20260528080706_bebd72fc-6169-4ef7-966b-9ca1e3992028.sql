
-- Rollback av Almedalenveckan-konsolideringen 2026-05-28 09:00
-- Steg 1.1: Återväck mediumprojektet d75279e7
UPDATE projects
SET deleted_at = NULL,
    planning_status = 'planned',
    updated_at = NOW()
WHERE id = 'd75279e7-1e41-4576-80f2-a950e444d83f';

-- Steg 1.2: Flytta mediumprojektets booking tillbaka
UPDATE bookings
SET assigned_project_id = 'd75279e7-1e41-4576-80f2-a950e444d83f',
    assigned_to_project = true,
    large_project_id = NULL,
    updated_at = NOW()
WHERE id = '72ff457e-06be-4ae4-b400-6219729a2c38';

DELETE FROM large_project_bookings
WHERE booking_id = '72ff457e-06be-4ae4-b400-6219729a2c38'
  AND large_project_id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c';

-- Steg 1.3 (optimerat): Markera storprojektet som planerat så det
-- försvinner från "Nya bokningar"-listan. Behåller alla 21 övriga
-- bokningar kopplade — de var redan i 5c94ebcc innan.
UPDATE large_projects
SET planning_status = 'planned',
    updated_at = NOW()
WHERE id = 'a5d3f31b-13dd-4850-b091-3f6f83fa753c';

-- Steg 1.5: Audit-spår
INSERT INTO project_audit_log (project_id, project_type, action, organization_id, details, performed_by)
VALUES (
  'a5d3f31b-13dd-4850-b091-3f6f83fa753c',
  'large',
  'rollback_consolidation',
  'f5e5cade-f08b-4833-a105-56461f15b191',
  jsonb_build_object(
    'reason', 'User reported accidental consolidation at 09:00; restored medium project d75279e7 and lifted its booking out',
    'restored_medium_project_id', 'd75279e7-1e41-4576-80f2-a950e444d83f',
    'lifted_booking_id', '72ff457e-06be-4ae4-b400-6219729a2c38',
    'large_project_kept', 'a5d3f31b-13dd-4850-b091-3f6f83fa753c',
    'large_project_renamed_to_planned', true,
    'original_hard_deleted_large_project_id', '5c94ebcc-f797-442a-9ec8-cb53105574bb',
    'note', 'Original 5c94ebcc was hard-deleted during consolidation; cannot fully restore its name/notes/attachments. a5d3f31b is reused as replacement (same booking set minus the medium one).'
  ),
  NULL
);
