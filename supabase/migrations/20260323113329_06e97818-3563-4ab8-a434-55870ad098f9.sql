-- Manually insert calendar events for the standalone project Saluhall Uppsala
INSERT INTO public.calendar_events (title, start_time, end_time, resource_id, event_type, booking_id, booking_number, delivery_address, organization_id)
VALUES
  ('Saluhall Uppsala', '2026-03-02T08:00:00', '2026-03-02T14:00:00', 'team-1', 'rig', 'project-f7de4297-dd07-4e43-9fc9-fabce32ace21', 'P-f7de42', 'S:t Eriks torg 8, 753 10 Uppsala, Uppsala', 'f5e5cade-f08b-4833-a105-56461f15b191'),
  ('Saluhall Uppsala', '2026-03-03T08:00:00', '2026-03-03T14:00:00', 'team-11', 'event', 'project-f7de4297-dd07-4e43-9fc9-fabce32ace21', 'P-f7de42', 'S:t Eriks torg 8, 753 10 Uppsala, Uppsala', 'f5e5cade-f08b-4833-a105-56461f15b191'),
  ('Saluhall Uppsala', '2026-03-24T08:00:00', '2026-03-24T14:00:00', 'team-1', 'rigDown', 'project-f7de4297-dd07-4e43-9fc9-fabce32ace21', 'P-f7de42', 'S:t Eriks torg 8, 753 10 Uppsala, Uppsala', 'f5e5cade-f08b-4833-a105-56461f15b191');