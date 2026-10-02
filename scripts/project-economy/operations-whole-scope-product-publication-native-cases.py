"""TEST ONLY causal cases; injected capabilities must be the guarded native runner.

No source calculator, production RPC, grants, writer fault switch or public raw
logging is installed here. Each SQL command selects actual saved fixture data.
"""
import json

ORG = '11111111-1111-4111-8111-111111111111'
SCOPE = '90909090-9090-4909-8909-909090909090'
ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
CLAIMS = '{"sub":"' + ACTOR + '","role":"authenticated"}'
MARKERS = (
    'scope-product-native PASS actual_postgrest_repeatable_read_rc_denied',
    'scope-product-native PASS publisher_first_actual_source_lock',
    'scope-product-native PASS source_first_nowait_no_publication',
    'scope-product-native PASS repeatable_read_serialization_rollback',
    'scope-product-native PASS legacy_graph_phantom_coherent_as_of',
    'scope-product-native PASS fresh_graph_hint_conflict_no_advance',
    'scope-product-native PASS gate_project_actor_revoke_no_advance',
    'scope-product-native PASS immutable_partial_null_export_history',
)


class CaseFailure(Exception):
    def __init__(self, case):
        # Fixed labels only; no exception, command, SQL result or response copy.
        self.case = case if case in range(8) else 7
        super().__init__('closed_product_native_case_failure')


def scalar(result):
    """Runner returns only strict one-cell JSON decoded from private psql output."""
    if not isinstance(result, dict):
        raise CaseFailure(7)
    return result


class Cases:
    """Capabilities: SQL, owned async SQL, observed pg_stat_activity, native HTTP.

    run(sql, expected_code=None) returns a single private JSON object or None.
    start(name, sql) returns an owned process handle; wait(name, kind) observes
    that exact owned PostgreSQL application's real PgSleep or Lock event.
    finish(handle, expected_code=None) verifies bounded process completion.
    http(command, expected_status) returns the private parsed receipt/code.
    No capability may emit private stderr/response/SQL to the parent workflow.
    """
    def __init__(self, run, start, wait, finish, http):
        self.run, self.start, self.wait = run, start, wait
        self.finish, self.http = finish, http
        self.done = []

    def require(self, value, case):
        if value is not True:
            raise CaseFailure(case)

    def state(self):
        return scalar(self.run("""select jsonb_build_object(
          'head',coalesce((select publication_revision from operations_whole_scope_publication_private.heads
           where organization_id='""" + ORG + "' and economic_scope_id='" + SCOPE + """'),0),
          'publications',(select count(*) from operations_whole_scope_publication_private.publications),
          'receipts',(select count(*) from operations_whole_scope_publication_private.receipts),
          'null_exports',not exists(select 1 from operations_whole_scope_publication_private.publications
           where export_grant is not null or destination_raw_body is not null));"""))

    def source_revision(self):
        value=scalar(self.run("select jsonb_build_object('revision',current_revision) from public.operations_finance_invoice_streams where organization_id='" + ORG + "' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='23232323-2323-4232-8232-232323232323';"))
        return value.get('revision')

    def command(self, label):
        # Label belongs to a fixed internal catalog, never environment/request.
        if label not in {'initial', 'publisher_first', 'source_first', 'serialization',
                         'phantom', 'fresh_hint', 'gate', 'project', 'actor'}:
            raise CaseFailure(7)
        value = scalar(self.run("""select command||jsonb_build_object(
          'expected_publication_revision',coalesce((select publication_revision
            from operations_whole_scope_publication_private.heads where
            organization_id='""" + ORG + "' and economic_scope_id='" + SCOPE + """'),0),
          'idempotency_key','product-native-""" + label + """')
          from operations_whole_scope_product_native.commands where label='known';"""))
        return value

    def publisher_sql(self, command, before_sleep=False, after_sleep=False):
        raw = json.dumps(command, ensure_ascii=False, separators=(',', ':'))
        literal = "'" + raw.replace("'", "''") + "'::jsonb"
        # Snapshot is established through actual canonical head before sleep.
        prefix = ("begin isolation level repeatable read;select current_revision from public.operations_project_scope_heads"
                  " where organization_id='" + ORG + "' and economic_scope_id='" + SCOPE + "';")
        if before_sleep:
            prefix += 'select pg_sleep(10);'
        prefix += "select set_config('request.jwt.claims','" + CLAIMS + "',true);set local role authenticated;"
        prefix += 'select public.publish_operations_whole_scope_product_v1(' + literal + ');reset role;'
        if after_sleep:
            prefix += 'select pg_sleep(10);'
        return prefix + 'commit;'

    def producer_sql(self, revision, pause=False):
        # Genuine exact saved correction produced by approved fixed fixture.
        # Later revisions change version/fingerprint only, not caller money.
        if type(revision) is not int or revision not in {2, 3, 4}:
            raise CaseFailure(7)
        fingerprint = {2: 'd', 3: 'e', 4: '9'}[revision] * 64
        sql = """begin;set local role service_role;
          select public.operations_receive_finance_project_invoice_destination_v1(
          'fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,
          'product-native-source-""" + str(revision) + """',
          ((raw_source_correction::jsonb)||jsonb_build_object('source_revision',""" + str(revision) + ", 'source_publication_fingerprint','" + fingerprint + """'))::text)
          from public.operations_scope_invoice_kernel_native_fixture where slot='only';
          reset role;"""
        # The view is owner-private. Service role may not read its source body:
        # resolve actual saved TEST selector before SET ROLE, via a temp table.
        sql = sql.replace('begin;set local role service_role;',
            "begin;create temporary table actual_source(raw_source_correction text) on commit drop;"
            "insert into actual_source select raw_source_correction from operations_whole_scope_product_native.known_fixture where slot='only';"
            "grant select on actual_source to service_role;set local role service_role;")
        sql = sql.replace("from public.operations_scope_invoice_kernel_native_fixture where slot='only';", 'from actual_source;')
        if pause:
            sql += 'select pg_sleep(10);'
        return sql + 'commit;'

    def run_all(self):
        state = self.state()
        self.require(state == {'head': 0, 'publications': 0, 'receipts': 0, 'null_exports': True}, 0)
        command = self.command('initial')
        self.run(self.publisher_sql(command).replace('isolation level repeatable read',
                                                     'isolation level read committed'), '55000')
        self.require(self.state() == state, 0)
        response = scalar(self.http(command, 200))
        self.require(response.get('publication_revision') == 1 and
                     response.get('delivery_state') == 'blocked_missing_export_grant', 0)
        raw_receipt=json.dumps(response,ensure_ascii=False,allow_nan=False,separators=(',',':'))
        saved=scalar(self.run("select jsonb_build_object('bound',count(*)=1) from operations_whole_scope_publication_private.receipts r join operations_whole_scope_publication_private.publications p using(publication_id) join operations_whole_scope_publication_private.heads h on h.publication_id=p.publication_id where r.document='" + raw_receipt.replace("'","''") + "'::jsonb and p.organization_id='" + ORG + "' and p.economic_scope_id='" + SCOPE + "' and p.publication_revision=1 and r.document->>'source_publication_fingerprint'=p.publication_fingerprint and r.document->>'source_evidence_fingerprint'=p.evidence_fingerprint;"))
        self.require(saved == {'bound': True}, 0)
        self.require(self.state() == {'head': 1, 'publications': 1, 'receipts': 1, 'null_exports': True}, 0)
        self.done.append(MARKERS[0])

        # Actual publisher holds source barriers/SHARE row locks AFTER real save.
        holder = self.start('scope_product_publisher_first',
                            self.publisher_sql(self.command('publisher_first'), after_sleep=True))
        self.wait('scope_product_publisher_first', 'PgSleep')
        contender = self.start('scope_product_source_contender', self.producer_sql(2))
        self.wait('scope_product_source_contender', 'Lock')
        self.finish(holder)
        self.finish(contender)
        self.require(self.source_revision() == 2, 1)
        self.require(self.state() == {'head': 2, 'publications': 2, 'receipts': 2, 'null_exports': True}, 1)
        self.done.append(MARKERS[1])

        holder = self.start('scope_product_source_first', self.producer_sql(3, pause=True))
        self.wait('scope_product_source_first', 'PgSleep')
        before = self.state()
        # Product uses TRY/NOWAIT: assert genuine busy denial, not a fake wait.
        self.run(self.publisher_sql(self.command('source_first')), '55P03')
        self.require(self.state() == before, 2)
        self.wait('scope_product_source_first', 'PgSleep')
        self.finish(holder)
        self.require(self.source_revision() == 3, 2)
        self.done.append(MARKERS[2])

        before = self.state()
        holder = self.start('scope_product_old_snapshot',
                            self.publisher_sql(self.command('serialization'), before_sleep=True))
        self.wait('scope_product_old_snapshot', 'PgSleep')
        self.run(self.producer_sql(4))
        # RR row-version lock after real committed correction must abort40001.
        self.finish(holder, '40001')
        self.require(self.source_revision() == 4, 3)
        self.require(self.state() == before, 3)
        self.done.append(MARKERS[3])

        command = self.command('phantom')
        before = self.state()
        holder = self.start('scope_product_graph_snapshot',
                            self.publisher_sql(command, before_sleep=True))
        self.wait('scope_product_graph_snapshot', 'PgSleep')
        self.run("begin;select public.link_booking_to_large_project('cccccccc-cccc-4ccc-8ccc-cccccccccccc','product-native-phantom-order',false);commit;")
        self.finish(holder)
        after = self.state()
        self.require(after['head'] == before['head'] + 1 and after['null_exports'] is True, 4)
        proof = scalar(self.run("""select jsonb_build_object('old_generation',
          document#>'{full_membership,local_booking_ids}' is distinct from null
          and not(document#>'{full_membership,local_booking_ids}' ? 'product-native-phantom-order'),
          'linked_now',exists(select 1 from public.large_project_bookings where booking_id='product-native-phantom-order'))
          from operations_whole_scope_publication_private.publications
          order by publication_revision desc limit 1;"""))
        self.require(proof == {'old_generation': True, 'linked_now': True}, 4)
        self.done.append(MARKERS[4])
        self.run(self.publisher_sql(self.command('fresh_hint')), 'PT409')
        self.require(self.state() == after, 5)
        self.done.append(MARKERS[5])
        for label, disable, restore in (
            ('gate', "update operations_whole_scope_publication_private.gates set enabled=false where organization_id='" + ORG + "' and economic_scope_id='" + SCOPE + "';",
             "update operations_whole_scope_publication_private.gates set enabled=true where organization_id='" + ORG + "' and economic_scope_id='" + SCOPE + "';"),
            ('project', "update public.projects set deleted_at=clock_timestamp() where id='55555555-5555-4555-8555-555555555555';",
             "update public.projects set deleted_at=null where id='55555555-5555-4555-8555-555555555555';"),
            ('actor', "delete from public.user_roles where user_id='" + ACTOR + "' and organization_id='" + ORG + "' and role='admin';",
             "insert into public.user_roles select (jsonb_populate_record(null::public.user_roles,admin_role)).* from operations_whole_scope_product_native.controls where slot='only';"),
        ):
            self.run('begin;' + disable + 'commit;')
            try:
                self.run(self.publisher_sql(self.command(label)), '42501')
                self.require(self.state() == after, 6)
            finally:
                # Restoration is fixed TEST-only data; runner owns cleanup if
                # interruption prevents it. No positive admission is inferred.
                self.run('begin;' + restore + 'commit;')
        self.done.append(MARKERS[6])
        flags = scalar(self.run("""select jsonb_build_object(
          'unknown_coverage',bool_and(projection->'category_coverage'='{"supplier":"unavailable","personnel":"unavailable","catering":"unavailable","other":"unavailable"}'::jsonb
            and projection->>'source_coverage'='unavailable'),
          'null_totals',bool_and(projection->'eac_minor'='null'::jsonb
            and projection->'budget_minor'='null'::jsonb
            and projection->'margin_minor'='null'::jsonb
            and projection->'remaining_minor'='null'::jsonb),
          'as_of_graph',bool_and(capture->>'membership_currentness'='as_of_graph'),
          'received_only',bool_and(capture->>'source_currentness'='saved_receiver_heads_only'),
          'null_exports',bool_and(export_grant is null and destination_raw_body is null),
          'receipts_match',(select count(*) from operations_whole_scope_publication_private.receipts)=count(*))
          from operations_whole_scope_publication_private.publications;"""))
        self.require(set(flags) == {'unknown_coverage', 'null_totals', 'as_of_graph',
                                  'received_only', 'null_exports', 'receipts_match'}
                     and all(v is True for v in flags.values()), 7)
        self.run("""begin;do $$begin
          begin update operations_whole_scope_publication_private.heads set publication_revision=1;
            raise exception 'test_head_rewind_accepted' using errcode='22023';
          exception when sqlstate '55000' then null;end;
          begin delete from operations_whole_scope_publication_private.publications;
            raise exception 'test_history_delete_accepted' using errcode='22023';
          exception when sqlstate '55000' then null;end;
          begin truncate operations_whole_scope_publication_private.receipts;
            raise exception 'test_receipt_truncate_accepted' using errcode='22023';
          exception when sqlstate '55000' then null;end;
          end;$$;rollback;""")
        self.require(self.state() == after, 7)
        self.done.append(MARKERS[7])
        return tuple(self.done)
