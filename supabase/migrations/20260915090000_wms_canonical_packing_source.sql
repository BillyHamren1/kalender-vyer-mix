-- Canonical WMS cutover: every mirrored packing row must be attributable
-- to the Booking/WMS reservation that produced it. This is required for
-- consolidated packing projects where several bookings share one list.
alter table public.packing_list_items
  add column if not exists source_booking_id text;

create index if not exists packing_list_items_source_booking_id_idx
  on public.packing_list_items (source_booking_id)
  where source_booking_id is not null;

comment on column public.packing_list_items.source_booking_id is
  'Booking UUID whose WMS reservation produced this packing row. Canonical WMS projection scope.';
