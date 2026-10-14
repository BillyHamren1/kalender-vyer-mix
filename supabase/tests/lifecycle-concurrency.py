"""Disposable Docker fixture only; no Supabase or production connection."""
import concurrent.futures
import json
import subprocess
import sys
import time

container = sys.argv[1]


def sql(statement):
    return subprocess.check_output(
        ['docker', 'exec', container, 'psql', '-U', 'postgres', '-d', 'postgres',
         '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement], text=True)


def wait_for_sleep(name):
    for _ in range(200):
        if sql("select count(*) from pg_stat_activity where application_name='" + name +
               "' and wait_event='PgSleep'").strip() == '1':
            return
        time.sleep(0.02)
    raise AssertionError('First transaction did not reach the concurrency barrier')


org = '10000000-0000-0000-0000-000000000001'
packing = '10000000-0000-0000-0000-000000000002'
product = '10000000-0000-0000-0000-000000000003'
item = '10000000-0000-0000-0000-000000000004'
allocation = '10000000-0000-0000-0000-000000000005'
sql(f"""
insert into bookings(id,organization_id,status,version) values('concurrent-notice','{org}','CONFIRMED',1);
insert into packing_projects(id,organization_id,booking_id) values('{packing}','{org}','concurrent-packing');
insert into booking_products values('{product}','{org}','concurrent-packing','Keep allocated equipment');
insert into packing_list_items(id,organization_id,packing_id,booking_product_id) values('{item}','{org}','{packing}','{product}');
""")

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    newer = pool.submit(sql, f"""begin; set application_name='ops-newer';
      select record_booking_cancellation_notice_atomic('{org}','concurrent-notice','CANCELLED','2099-01-02',null);
      select pg_sleep(2); commit;""")
    wait_for_sleep('ops-newer')
    older = pool.submit(sql, f"select record_booking_cancellation_notice_atomic('{org}','concurrent-notice','CANCELLED','2099-01-01',null);")
    newer_result = [json.loads(line) for line in newer.result().splitlines() if line.startswith('{')][0]
    older_result = json.loads(older.result().strip())
    assert newer_result['outcome'] == 'cancelled', newer_result
    assert older_result['outcome'] == 'stale_revision', older_result
    assert sql(f"select applied_source_updated_at='2099-01-02'::timestamptz from booking_source_state where organization_id='{org}' and booking_id='concurrent-notice'").strip() == 't'
    print('PASS concurrent cancellation notices preserve the newer watermark')

    scanner = pool.submit(sql, f"""begin; set application_name='ops-scanner';
      insert into packing_list_item_allocations values('{allocation}','{org}','{item}');
      select pg_sleep(2); commit;""")
    wait_for_sleep('ops-scanner')
    removal = pool.submit(sql, f"delete from booking_products where id='{product}';")
    scanner.result()
    removal.result()
    assert sql(f"select count(*) from packing_list_items where id='{item}' and retired_from_booking_at is not null and booking_product_id is null").strip() == '1'
    assert sql(f"select count(*) from packing_list_item_allocations where id='{allocation}' and packing_list_item_id='{item}'").strip() == '1'
    print('PASS commercial deletion racing a scan retains the item and allocation')
