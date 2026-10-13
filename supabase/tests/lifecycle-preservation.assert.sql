DO $$
DECLARE org uuid := '00000000-0000-0000-0000-000000000001';
 p uuid := '00000000-0000-0000-0000-000000000002';
 product uuid := '00000000-0000-0000-0000-000000000003';
 item uuid := '00000000-0000-0000-0000-000000000004';
 allocation uuid := '00000000-0000-0000-0000-000000000005'; r jsonb;
BEGIN
 INSERT INTO bookings(id,organization_id,status,version) VALUES('booking',org,'CONFIRMED',1);
 INSERT INTO packing_projects(id,organization_id,booking_id) VALUES(p,org,'booking');
 INSERT INTO booking_products VALUES(product,org,'booking','Tent');
 INSERT INTO packing_list_items(id,organization_id,packing_id,booking_product_id,quantity_packed)
 VALUES(item,org,p,product,2);
 INSERT INTO packing_list_item_allocations VALUES(allocation,org,item);
 DELETE FROM booking_products WHERE id=product;
 IF EXISTS(SELECT 1 FROM booking_products WHERE id=product) THEN RAISE EXCEPTION 'commercial deletion blocked'; END IF;
 IF NOT EXISTS(SELECT 1 FROM packing_list_items WHERE id=item AND booking_product_id IS NULL
   AND retired_from_booking_at IS NOT NULL AND manual_name='Tent' AND quantity_packed=2) THEN RAISE EXCEPTION 'physical evidence lost'; END IF;
 IF NOT EXISTS(SELECT 1 FROM packing_list_item_allocations WHERE id=allocation) THEN RAISE EXCEPTION 'allocation lost'; END IF;
 BEGIN
  UPDATE packing_projects SET needs_packing_review=false WHERE id=p;
  RAISE EXCEPTION 'review improperly dismissed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  DELETE FROM packing_projects WHERE id=p;
  RAISE EXCEPTION 'outstanding packing deleted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- A duplicate complete-empty snapshot must remain non-destructive.
 DELETE FROM packing_list_items WHERE id=item;
 IF NOT EXISTS(SELECT 1 FROM packing_list_items WHERE id=item) THEN RAISE EXCEPTION 'retry lost evidence'; END IF;
 BEGIN
  UPDATE packing_list_items SET quantity_to_pack=1 WHERE id=item;
  RAISE EXCEPTION 'progressed target silently changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE packing_list_items SET quantity_packed=3 WHERE id=item;
  RAISE EXCEPTION 'retired row packed again';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE packing_list_item_allocations SET organization_id=org WHERE id=allocation;
  RAISE EXCEPTION 'retired allocation changed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 -- Return resolution permits review approval, preserving historical row.
 DELETE FROM packing_list_item_allocations WHERE id=allocation;
 UPDATE packing_list_items SET quantity_returned=2 WHERE id=item;
 UPDATE packing_projects SET needs_packing_review=false WHERE id=p;
 -- Safe final unstarted row deletion still removes the commercial projection.
 INSERT INTO booking_products VALUES(product,org,'booking','Unpacked tent');
 INSERT INTO packing_list_items(id,organization_id,packing_id,booking_product_id)
 VALUES(allocation,org,p,product);
 DELETE FROM booking_products WHERE id=product;
 IF EXISTS(SELECT 1 FROM packing_list_items WHERE id=allocation) THEN RAISE EXCEPTION 'unstarted row retained'; END IF;
 -- Cancellation retains project and historical physical row, truthful receipt.
 r := apply_booking_cancellation_atomic(org,'booking','CANCELLED',now(),1,'test',null);
 IF (r->'mutations'->>'packing_preserved')::int<>1 OR (r->'mutations'->>'packing_projects')::int<>0 THEN RAISE EXCEPTION 'untruthful cancellation receipt: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM packing_projects WHERE id=p AND needs_packing_review) THEN RAISE EXCEPTION 'cancel review lost'; END IF;
 -- Non-destructive automatic cancellation has its own canonical receipt.
 INSERT INTO booking_products VALUES(product,org,'booking','Retain commercial snapshot');
 INSERT INTO calendar_events VALUES(org,'booking',null,'event','Event');
 INSERT INTO jobs VALUES(org,'booking','completed',now());
 r := record_booking_cancellation_notice_atomic(org,'booking','CANCELLED','2099-01-01',2,'test',null);
 IF r->>'outcome'<>'cancelled' THEN RAISE EXCEPTION 'notice failed: %',r; END IF;
 IF NOT EXISTS(SELECT 1 FROM booking_products WHERE id=product) OR NOT EXISTS(SELECT 1 FROM calendar_events WHERE booking_id='booking') THEN RAISE EXCEPTION 'automatic notice performed cleanup'; END IF;
 IF NOT EXISTS(SELECT 1 FROM calendar_events WHERE title='[AVBOKAD] Event') THEN RAISE EXCEPTION 'calendar cancellation not visible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jobs WHERE status='completed') THEN RAISE EXCEPTION 'completed history overwritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE id='booking' AND status='CANCELLED') THEN RAISE EXCEPTION 'commercial cancellation hidden'; END IF;
 r := record_booking_cancellation_notice_atomic(org,'booking','CANCELLED','2099-01-01',2,'retry',null);
 IF r->>'outcome'<>'already_cancelled' THEN RAISE EXCEPTION 'duplicate notice not idempotent: %',r; END IF;
 r := record_booking_cancellation_notice_atomic(org,'booking','CANCELLED','2098-01-01',1,'stale',null);
 IF r->>'outcome'<>'stale_revision' THEN RAISE EXCEPTION 'old notice accepted: %',r; END IF;
 r := record_booking_cancellation_notice_atomic(org,'never-imported','CANCELLED','2099-01-01',null,'test',null);
 IF r->>'outcome'<>'cancelled' OR NOT EXISTS(SELECT 1 FROM booking_source_state WHERE booking_id='never-imported' AND applied_source_status='CANCELLED') THEN RAISE EXCEPTION 'absent booking tombstone missing'; END IF;
 r := record_booking_cancellation_notice_atomic(org,'never-imported','CANCELLED','2098-01-01',null,'stale',null);
 IF r->>'outcome'<>'stale_revision' THEN RAISE EXCEPTION 'absent booking stale watermark lost'; END IF;
 RAISE NOTICE 'PASS: commercial deletion, operational preservation, allocations, duplicate retry, final row, review fence and cancellation receipt';
END;$$;
