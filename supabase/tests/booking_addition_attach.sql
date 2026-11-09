-- Rollback-only behavior test for public.attach_booking_addition (synthetic tenants/bookings).
-- Run with service role. It always ends with RAISE 'ALL_PASS_ROLLBACK ...', so nothing persists;
-- any other error message names the failing assertion.
DO $t$
DECLARE
  oa uuid; ob uuid; p uuid; q uuid; lp uuid; pc uuid; pu uuid; r jsonb; n int; s text;
BEGIN
  INSERT INTO public.organizations(name, slug) VALUES ('zz-test-a','zz-test-a-'||gen_random_uuid()) RETURNING id INTO oa;
  INSERT INTO public.organizations(name, slug) VALUES ('zz-test-b','zz-test-b-'||gen_random_uuid()) RETURNING id INTO ob;
  INSERT INTO public.bookings(id, client, status, organization_id) VALUES
    ('zzt-root','T','CONFIRMED',oa), ('zzt-c1','T','CONFIRMED',oa), ('zzt-c2','T','CONFIRMED',oa),
    ('zzt-c3','T','CONFIRMED',oa), ('zzt-c5','T','OFFER',oa), ('zzt-rootb','T','CONFIRMED',ob),
    ('zzt-root2','T','CONFIRMED',oa), ('zzt-0c4','T','CONFIRMED',oa), ('zzt-plain','T','CONFIRMED',oa);
  INSERT INTO public.projects(name, booking_id, organization_id) VALUES ('P','zzt-root',oa) RETURNING id INTO p;
  INSERT INTO public.projects(name, organization_id) VALUES ('Q',oa) RETURNING id INTO q;
  UPDATE public.bookings SET assigned_to_project=true, assigned_project_id=p WHERE id='zzt-root';
  UPDATE public.bookings SET assigned_to_project=true, assigned_project_id=q WHERE id='zzt-c3';
  INSERT INTO public.large_projects(name, organization_id) VALUES ('L',oa) RETURNING id INTO lp;
  INSERT INTO public.large_project_bookings(large_project_id, booking_id, organization_id, sort_order) VALUES (lp,'zzt-root2',oa,1);
  UPDATE public.bookings SET large_project_id=lp WHERE id='zzt-root2';

  r := public.attach_booking_addition(oa,'zzt-c1','zzt-root',1);
  IF r->>'outcome' <> 'attached' OR (r->>'target_id')::uuid <> p THEN RAISE EXCEPTION 'T1 %', r; END IF;
  r := public.attach_booking_addition(oa,'zzt-c1','zzt-root',1);
  IF r->>'outcome' <> 'already_attached' THEN RAISE EXCEPTION 'T2 retry %', r; END IF;
  SELECT count(*) INTO n FROM public.projects WHERE organization_id=oa AND booking_id IN ('zzt-root','zzt-c1');
  IF n <> 1 THEN RAISE EXCEPTION 'T3 dup projects %', n; END IF;
  SELECT count(*) INTO n FROM public.calendar_events WHERE booking_id='zzt-c1';
  IF n <> 0 THEN RAISE EXCEPTION 'T4 calendar copies %', n; END IF;
  r := public.attach_booking_addition(oa,'zzt-c2','zzt-rootb',1);
  IF r->>'outcome' <> 'root_unavailable' THEN RAISE EXCEPTION 'T5 cross-org %', r; END IF;
  r := public.attach_booking_addition(oa,'zzt-c2','zzt-missing',1);
  IF r->>'outcome' <> 'root_unavailable' OR (r->>'retryable')::bool IS NOT TRUE THEN RAISE EXCEPTION 'T6 %', r; END IF;
  SELECT count(*) INTO n FROM public.bookings WHERE id='zzt-c2' AND (assigned_project_id IS NOT NULL OR parent_booking_id IS NOT NULL);
  IF n <> 0 THEN RAISE EXCEPTION 'T6b refused child mutated'; END IF;
  r := public.attach_booking_addition(oa,'zzt-root','zzt-root',1);
  IF r->>'outcome' <> 'invalid_group' THEN RAISE EXCEPTION 'T7 %', r; END IF;
  r := public.attach_booking_addition(oa,'zzt-c3','zzt-root',1);
  IF r->>'outcome' <> 'explicit_assignment_conflict' THEN RAISE EXCEPTION 'T8 %', r; END IF;
  SELECT assigned_project_id::text INTO s FROM public.bookings WHERE id='zzt-c3';
  IF s <> q::text THEN RAISE EXCEPTION 'T8b reassigned'; END IF;
  r := public.attach_booking_addition(oa,'zzt-c5','zzt-root',2);
  IF r->>'outcome' <> 'linked_not_confirmed' THEN RAISE EXCEPTION 'T9 %', r; END IF;
  SELECT count(*) INTO n FROM public.bookings WHERE id='zzt-c5' AND assigned_project_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'T9b draft entered flow'; END IF;
  r := public.attach_booking_addition(oa,'zzt-0c4','zzt-root2',1);
  IF r->>'outcome' <> 'attached' OR r->>'target' <> 'large_project' THEN RAISE EXCEPTION 'T10 %', r; END IF;
  IF public.lp_rep_booking_id(lp) <> 'zzt-root2' THEN RAISE EXCEPTION 'T11 rep moved to %', public.lp_rep_booking_id(lp); END IF;
  r := public.attach_booking_addition(oa,'zzt-0c4','zzt-root2',1);
  SELECT count(*) INTO n FROM public.large_project_bookings WHERE large_project_id=lp;
  IF r->>'outcome' <> 'already_attached' OR n <> 2 THEN RAISE EXCEPTION 'T12 %, %', r, n; END IF;
  SELECT count(*) INTO n FROM public.bookings WHERE id='zzt-plain' AND parent_booking_id IS NULL AND assigned_project_id IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'T13 ordinary booking changed'; END IF;
  r := public.apply_booking_cancellation_atomic(oa,'zzt-c1','CANCELLED',NULL,1,'test');
  SELECT status INTO s FROM public.projects WHERE id=p;
  IF s = 'cancelled' THEN RAISE EXCEPTION 'T14 root project cancelled (%)', r; END IF;
  SELECT status INTO s FROM public.bookings WHERE id='zzt-root';
  IF s <> 'CONFIRMED' THEN RAISE EXCEPTION 'T15 root status %', s; END IF;
  -- Completed (slutfakturerad) root: addition joins the SAME completed project, root stays completed.
  INSERT INTO public.bookings(id, client, status, organization_id) VALUES
    ('zzt-rootc','T','CONFIRMED',oa), ('zzt-cc','T','CONFIRMED',oa),
    ('zzt-rootu','T','CONFIRMED',oa), ('zzt-cu','T','CONFIRMED',oa);
  INSERT INTO public.projects(name, booking_id, organization_id, status) VALUES ('PC','zzt-rootc',oa,'completed') RETURNING id INTO pc;
  r := public.attach_booking_addition(oa,'zzt-cc','zzt-rootc',1);
  IF r->>'outcome' <> 'attached' OR (r->>'target_id')::uuid <> pc THEN RAISE EXCEPTION 'C1 completed root %', r; END IF;
  r := public.attach_booking_addition(oa,'zzt-cc','zzt-rootc',1);
  IF r->>'outcome' <> 'already_attached' THEN RAISE EXCEPTION 'C2 %', r; END IF;
  SELECT status INTO s FROM public.projects WHERE id=pc;
  IF s <> 'completed' THEN RAISE EXCEPTION 'C3 root status changed to %', s; END IF;
  SELECT count(*) INTO n FROM public.projects WHERE organization_id=oa AND booking_id IN ('zzt-rootc','zzt-cc');
  IF n <> 1 THEN RAISE EXCEPTION 'C4 dup projects %', n; END IF;
  SELECT count(*) INTO n FROM public.bookings WHERE assigned_project_id=pc::text AND id='zzt-cc';
  IF n <> 1 THEN RAISE EXCEPTION 'C5 child link %', n; END IF;

  -- Root unassigned -> retryable; root later assigned -> addition re-queued and then attached once.
  r := public.attach_booking_addition(oa,'zzt-cu','zzt-rootu',1);
  IF r->>'outcome' <> 'root_unassigned' OR (r->>'retryable')::bool IS NOT TRUE THEN RAISE EXCEPTION 'U1 %', r; END IF;
  SELECT count(*) INTO n FROM public.booking_sync_jobs WHERE booking_id='zzt-cu' AND status IN ('pending','retryable','processing');
  IF n <> 0 THEN RAISE EXCEPTION 'U2 premature job %', n; END IF;
  INSERT INTO public.projects(name, booking_id, organization_id) VALUES ('PU','zzt-rootu',oa) RETURNING id INTO pu;
  SELECT count(*) INTO n FROM public.booking_sync_jobs WHERE booking_id='zzt-cu' AND organization_id::text=oa::text;
  IF n <> 1 THEN RAISE EXCEPTION 'U3 retry job not enqueued on root assignment (%)', n; END IF;
  r := public.attach_booking_addition(oa,'zzt-cu','zzt-rootu',1);
  IF r->>'outcome' <> 'attached' OR (r->>'target_id')::uuid <> pu THEN RAISE EXCEPTION 'U4 %', r; END IF;
  SELECT count(*) INTO n FROM public.projects WHERE organization_id=oa AND booking_id IN ('zzt-rootu','zzt-cu');
  IF n <> 1 THEN RAISE EXCEPTION 'U5 dup projects %', n; END IF;
  UPDATE public.projects SET name='PU2' WHERE id=pu;
  UPDATE public.projects SET status='completed' WHERE id=pu;
  SELECT count(*) INTO n FROM public.booking_sync_jobs WHERE booking_id='zzt-cu' AND organization_id::text=oa::text;
  IF n <> 1 THEN RAISE EXCEPTION 'U6 attached addition re-queued (%)', n; END IF;

  RAISE EXCEPTION 'ALL_PASS_ROLLBACK cancel_outcome=%', r->>'outcome';
END $t$;
