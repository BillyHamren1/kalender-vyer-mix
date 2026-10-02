#!/usr/bin/env python3
"""Disposable real PRODUCT read, strict ACL/parity, signed JWT and queued writers."""
import csv
import hashlib
import importlib.util
import io
import json
import os
import pathlib
import re
import shutil
import signal
import sys
import tempfile
import secrets
import socket
import time
import urllib.request

DATABASE='eventflow_scope_publication_runtime'
FIXED_ENV={'CI':'true','EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
ALLOWED_PG={'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}
PUBLIC_SQLSTATES={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES={'guard','paths','source_closure','fresh_database','schema','obligation_fixture','setup','try_setup','permission_setup','preflight','product_migration','product_direct','product_vectors','product_setup','http_roles','http_budget','http_inventory','http_create','http_start','http_health','http_health_probe','http_requests','http_cleanup_inventory','http_cleanup','native_sessions','proof'}
NATIVE_MARKER='operations-scope-compatible-read-native PASS product_role_packing_project_baseline_compound_source_queues_copied_null_evidence_no_read_writes_authored_matrix'
DIRECT_MARKER='operations-scope-compatible-read-direct PASS copied_parity_roles_bypass_priority_denials_no_cost_writes_rollback'
HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
CLOSURE=HERE/'operations-scope-compatible-read-native-closure.json'
BASE_CLOSURE=HERE/'whole-scope-reader-permission-native-closure.json'
SHARED=HERE/'operations-hired-personnel-native.py'
SHARED_SHA256='cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
BASE_RUNNER=HERE/'operations-whole-scope-reader-permission-native.py'
BASE_RUNNER_SHA256='89aff46264b47d709dd77f1129a82622ac1ba178dc33d06c56f4549147b415b2'
EXTRA=(
 'scripts/project-economy/whole-scope-reader-permission-native-closure.json',
 'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql',
 'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql',
 'scripts/project-economy/operations-scope-compatible-read-preflight-postgres-test.sql',
 'scripts/project-economy/operations-scope-compatible-read-postgres-test.sql',
 'scripts/project-economy/operations-scope-compatible-read-vector-test.ts',
 'scripts/project-economy/operations-scope-compatible-read-native-setup.sql',
 'scripts/project-economy/operations-scope-compatible-read-refresh-vectors.sql',
 'scripts/project-economy/operations-scope-compatible-read-native-concurrency.sh',
 'scripts/project-economy/operations-scope-compatible-read-http-role.sql',
 'scripts/project-economy/operations-scope-compatible-read-http-journey.ts',
 'scripts/project-economy/operations-scope-compatible-read-http-health.py',
 'scripts/project-economy/operations-scope-compatible-read-http-budget-test.ts',
 'scripts/project-economy/operations-scope-compatible-read-native.py',
 'scripts/project-economy/operations-scope-compatible-read-native.guard.test.py',
 'src/lib/economy/projectScopeInvoiceCapture.ts',
 'supabase/functions/_shared/project-scope-invoice-capture-admin.ts',
 'supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts',
 'docs/project-economy/whole-scope-compatible-reader-entry-v1-implementation.md',
 'docs/project-economy/whole-scope-compatible-reader-native-contract.md',
 'docs/project-economy/whole-scope-compatible-reader-source-audit.json',
 'docs/project-economy/whole-scope-compatible-reader-caller-audit.md')


CHECKPOINTS={'none','guard','role_acquired','role_read_first','compose_acquired','packing_acquired','packing_read_first','project_acquired','project_read_first','source_acquired','source_read_first','baseline_queue','compound_queue','terminal'}
FAILURE_REASONS={'none','unexpected_success','denial_mismatch'}

class ClosedFailure(Exception):
    def __init__(self,phase,code='unclassified',retain_private=False,checkpoint='none',reason='none'):
        self.phase=phase if phase in PHASES else 'guard'
        self.code=code if code in PUBLIC_SQLSTATES else 'unclassified'
        self.retain_private=retain_private
        self.checkpoint=checkpoint if checkpoint in CHECKPOINTS else 'none'
        self.reason=reason if reason in FAILURE_REASONS else 'none'
        super().__init__('closed_publication_failure')

def validate_environment(env):
    if any(env.get(k)!=v for k,v in FIXED_ENV.items()) or env.get('GITHUB_REPOSITORY')!='BillyHamren1/kalender-vyer-mix' or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise ClosedFailure('guard')
    for key,value in env.items():
        if not value:continue
        if key.lower() in {'http_proxy','https_proxy','all_proxy','no_proxy'}:raise ClosedFailure('guard')
        if key.startswith('PG') and key not in ALLOWED_PG or key.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_')) or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','NODE_OPTIONS','SHELLOPTS','BASHOPTS','PS4','PYTHONSTARTUP','PYTHONINSPECT','LD_PRELOAD','LD_LIBRARY_PATH'}:raise ClosedFailure('guard')
        if key.startswith(('EVENTFLOW_SCOPE_PUBLICATION_','EVENTFLOW_SCOPE_READER_PERMISSION_','EVENTFLOW_SCOPE_COMPATIBLE_READ_')) and key not in {'EVENTFLOW_SCOPE_COMPATIBLE_READ_ISOLATED_DB','EVENTFLOW_SCOPE_COMPATIBLE_READ_DENO_BIN'}:raise ClosedFailure('guard')
    deno=env.get('EVENTFLOW_SCOPE_COMPATIBLE_READ_DENO_BIN','deno')
    if deno!='deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve()!=pathlib.Path(deno) or not pathlib.Path(deno).is_file()):raise ClosedFailure('guard')
    return deno

def load_module(path,name,expected):
    if path.resolve()!=path or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ClosedFailure('paths')
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def load_shared():return load_module(SHARED,'publication_owned_cleanup',SHARED_SHA256)

def closure_paths(root=ROOT,manifest=CLOSURE):
    try:
        if not manifest.is_file() or manifest.resolve()!=manifest:raise ValueError()
        value=json.loads(manifest.read_text());base=json.loads((root/'scripts/project-economy/whole-scope-reader-permission-native-closure.json').read_text())
        if set(value)!={'schema','database','ordered_schema_paths','files'} or value['schema']!='operations-scope-compatible-read-native-closure.v1' or value['database']!=DATABASE or not isinstance(value['files'],dict):raise ValueError()
        if base['schema']!='operations-whole-scope-reader-permission-native-closure.v1' or len(base['files'])!=65 or value['ordered_schema_paths']!=base['ordered_schema_paths'] or len(value['ordered_schema_paths'])!=23 or set(value['files'])!=set(base['files'])|set(EXTRA):raise ValueError()
        for name,digest in value['files'].items():
            if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):raise ValueError()
            path=root/name
            if not path.is_file() or path.resolve()!=path or not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError()
        if any(value['files'][name]!=digest for name,digest in base['files'].items()):raise ValueError()
        # Pinned existing runner verifies the exact 23 DDL order against its
        # frozen HTTP closure and shared SCHEMA_PATHS; no caller DDL selection.
        original=load_module(BASE_RUNNER,'publication_frozen_transaction_closure',BASE_RUNNER_SHA256)
        original.closure_paths(root,root/'scripts/project-economy/whole-scope-reader-permission-native-closure.json')
        return [root/name for name in value['ordered_schema_paths']]
    except ClosedFailure:raise
    except Exception:raise ClosedFailure('source_closure') from None

def private_run(shared,phase,command,env,private,timeout,stdin=None):
    directory=private/phase;directory.mkdir(mode=0o700)
    try:return shared.run_private('authority_sql',command,env,ROOT,directory,timeout,stdin)
    except shared.ClosedFailure as error:
        checkpoint='none';reason='none'
        if phase=='native_sessions':
            try:
                log=directory/'authority_sql.stderr'
                if log.resolve()!=log or log.stat().st_size>8*1024*1024:raise ValueError()
                matches=re.findall(r'^COMPATIBLE_READ_CHECKPOINT ([a-z_]+)$',log.read_text(),re.M)
                if matches and matches[-1] in CHECKPOINTS:checkpoint=matches[-1]
                matches=re.findall(r'^COMPATIBLE_READ_REASON ([a-z_]+)$',log.read_text(),re.M)
                if matches and matches[-1] in FAILURE_REASONS:reason=matches[-1]
            except Exception:pass
        raise ClosedFailure(phase,error.code,error.retain_private,checkpoint,reason) from None

def read_json(path,phase):
    try:
        if path.resolve()!=path or not path.is_file() or path.stat().st_size>8*1024*1024:raise ValueError()
        return json.loads(path.read_text(encoding='utf-8'),parse_constant=lambda _v:(_ for _ in ()).throw(ValueError()))
    except Exception:raise ClosedFailure(phase) from None

def copy_json(value):
    try:
        stream=io.StringIO();writer=csv.writer(stream,lineterminator='\n',quoting=csv.QUOTE_ALL)
        writer.writerow([json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)])
        return 'create temporary table fixture_input(data jsonb not null);\nCOPY pg_temp.fixture_input(data) FROM STDIN WITH (FORMAT csv);\n'+stream.getvalue()+'\\.\n'
    except Exception:raise ClosedFailure('setup') from None

def setup_sql(source,fixture):
    if source.count(":'fixture'")!=1:raise ClosedFailure('setup')
    source=source.replace(":'fixture'",'(select data from pg_temp.fixture_input)')
    return options()+copy_json(fixture)+source

def options():return "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';set idle_in_transaction_session_timeout='35s';set eventflow.scope_publication_isolated='synthetic-disposable';set eventflow.scope_publication_try_isolated='synthetic-disposable';set eventflow.scope_compatible_read_isolated='synthetic-disposable';\n"

HTTP_CASES=(
 'real_default_fetch_loader_parser_frozen_projection_541000_partial',
 'exact_source_free_request_and_captured_session','caller_organization_rejected',
 'caller_source_selector_rejected','nonstring_identity_rejected','foreign_actual_project_denied',
 'displayed_token_conflict_and_actual_loader_discard','signed_missing_actor_denied',
 'anonymous_denied','service_role_app_boundary_denied','genuine_wrong_signature_denied',
 'same_jwt_changed_view_actor_discards_actual_reply','final_current_capture_unchanged',
 'actual_dedicated_db_and_full_seed_state_fingerprint_unchanged',
 'actual_signed_service_same_copied_projection','authenticated_service_entry_denied',
 'service_strict_numeric_revision_denied','private_schema_not_exposed_and_core_role_acl_denied',
 'actual_leaf_actor_no_whole_scope_escalation','actual_foreign_admin_no_scope_disclosure')

def http(shared,psql,pg_env,env,deno,private):
    with socket.socket() as port:
        try:port.bind(('127.0.0.1',55407))
        except OSError:raise ClosedFailure('http_inventory') from None
    name='scope-compatible-read-http-'+env['GITHUB_RUN_ID'];attempted=False;owner=secrets.token_hex(32)
    output=private_run(shared,'http_inventory',['docker','--host','unix:///var/run/docker.sock','ps','-a','--format','{{.Names}}'],env,private,15)
    if name in output.read_text().splitlines():raise ClosedFailure('http_inventory')
    private_run(shared,'http_roles',psql,pg_env,private,30,(options()+(HERE/'operations-scope-compatible-read-http-role.sql').read_text()).encode())
    selector="select jsonb_build_object('request',service_request,'composition',admin_request->'expected_composition_snapshot_id') from operations_scope_compatible_read_native.requests where case_id='known';"
    output=private_run(shared,'http_health',psql,pg_env,private,15,(options()+selector).encode())
    value=read_json(output,'http_health')
    if not isinstance(value,dict) or set(value)!={'request','composition'} or not isinstance(value['request'],dict) or not isinstance(value['composition'],str) or not re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',value['composition']):raise ClosedFailure('http_health')
    secret=secrets.token_hex(32);config=private/'postgrest.env'
    config.write_text('PGRST_DB_URI=postgres://scope_compatible_read_http_authenticator:synthetic-compatible-read-http-only@127.0.0.1:5432/'+DATABASE+'\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET='+secret+'\nPGRST_DB_CONFIG=false\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT=55407\n');config.chmod(0o600)
    try:
        attempted=True
        private_run(shared,'http_create',['docker','--host','unix:///var/run/docker.sock','create','--name',name,'--label','eventflow.scope.compatible-read-owner='+owner,'--network','host','--env-file',str(config),'postgrest/postgrest:v12.2.3'],env,private,60)
        private_run(shared,'http_start',['docker','--host','unix:///var/run/docker.sock','start',name],env,private,20)
        probe_env={key:value for key,value in env.items() if not key.startswith('PG') or key=='PGDATABASE'}
        output=private_run(shared,'http_health_probe',[sys.executable,str(HERE/'operations-scope-compatible-read-http-health.py')],probe_env,private,35)
        if output.read_text().splitlines()!=['operations-scope-compatible-read-http-health PASS fixed_loopback_no_redirect']:raise ClosedFailure('http_health')
        child=dict(env,EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_ISOLATED='true',EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_BASE_URL='http://127.0.0.1:55407/',EVENTFLOW_SCOPE_COMPATIBLE_READ_HTTP_JWT_SECRET=secret,EVENTFLOW_SCOPE_COMPATIBLE_READ_COMPOSITION_SNAPSHOT_ID=value['composition'],EVENTFLOW_SCOPE_COMPATIBLE_READ_SERVICE_REQUEST=json.dumps(value['request'],separators=(',',':')))
        child={k:v for k,v in child.items() if not k.startswith('PG') or k=='PGDATABASE'}
        output=private_run(shared,'http_requests',[deno,'run','--unstable-sloppy-imports','--allow-env','--allow-net=127.0.0.1:55407',str(HERE/'operations-scope-compatible-read-http-journey.ts')],child,240)
        wanted=['operations-scope-compatible-read-http PASS '+case for case in HTTP_CASES]+['operations-scope-compatible-read-http PASS TOTAL 20']
        if output.read_text().splitlines()!=wanted:raise ClosedFailure('http_requests')
        return wanted
    finally:
        if attempted:
            try:
                output=private_run(shared,'http_cleanup_inventory',['docker','--host','unix:///var/run/docker.sock','ps','-a','--filter','name=^/'+name+'$','--format','{{.ID}}\t{{.Label "eventflow.scope.compatible-read-owner"}}'],env,private,15)
                rows=output.read_text().splitlines()
                if rows:
                    if len(rows)!=1:raise ClosedFailure('http_cleanup',retain_private=True)
                    fields=rows[0].split('\t')
                    if len(fields)!=2 or not re.fullmatch(r'[0-9a-f]{12,64}',fields[0]) or fields[1]!=owner:raise ClosedFailure('http_cleanup',retain_private=True)
                    private_run(shared,'http_cleanup',['docker','--host','unix:///var/run/docker.sock','rm','-f',fields[0]],env,private,20)
            except ClosedFailure as error:raise ClosedFailure('http_cleanup',error.code,retain_private=True) from None
            except Exception:raise ClosedFailure('http_cleanup',retain_private=True) from None

def terminal_proof(lines):
    if not isinstance(lines,list) or len(lines)!=2 or lines[1]!=NATIVE_MARKER:raise ClosedFailure('proof')
    match=re.fullmatch(r'operations-scope-compatible-read-branches PASS baseline_as_of=([01]) compound_as_of=([01]) reads=([456])',lines[0])
    if not match or int(match[3])!=4+int(match[1])+int(match[2]):raise ClosedFailure('proof')
    return lines

def execute(env):
    deno=validate_environment(env);ddl=closure_paths();shared=load_shared()
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-reader-native-',dir='/tmp'));private.chmod(0o700);retain=False
    pg_env=dict(env,PGCONNECT_TIMEOUT='5');deno_env={k:v for k,v in env.items() if not k.startswith('PG')}
    psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
    try:
        fresh="set statement_timeout='15s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'));"
        output=private_run(shared,'fresh_database',psql,pg_env,private,30,fresh.encode())
        if output.read_text().splitlines()!=['t']:raise ClosedFailure('fresh_database')
        private_run(shared,'schema',psql,pg_env,private,90,(options()+'\n'.join(p.read_text() for p in ddl)).encode())
        output=private_run(shared,'obligation_fixture',[deno,'run',str(HERE/'operations-obligation-fixture.ts')],deno_env,private,90);fixture=read_json(output,'obligation_fixture')
        private_run(shared,'setup',psql,pg_env,private,90,setup_sql((HERE/'whole-scope-publication-transaction-native-setup.sql').read_text(),fixture).encode())
        private_run(shared,'try_setup',psql,pg_env,private,30,(options()+(HERE/'whole-scope-publication-try-native-setup.sql').read_text()).encode())
        private_run(shared,'permission_setup',psql,pg_env,private,45,(options()+(HERE/'whole-scope-reader-permission-native-setup.sql').read_text()).encode())
        admin=ROOT/'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql';migration=ROOT/'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql'
        # Fixed genuine admin source is a prerequisite, not a test implementation.
        private_run(shared,'product_migration',psql,pg_env,private,30,(options()+admin.read_text()).encode())
        pre=(HERE/'operations-scope-compatible-read-preflight-postgres-test.sql').read_text()
        if pre.count(":'migration'")!=1:raise ClosedFailure('preflight')
        pre=pre.replace(":'migration'",'(select data->>\'migration\' from pg_temp.fixture_input)')
        output=private_run(shared,'preflight',psql,pg_env,private,45,(options()+copy_json({'migration':migration.read_text()})+pre).encode())
        if [line for line in output.read_text().splitlines() if line]!=['operations-scope-compatible-read-preflight PASS unexpected_caller_security_search_path_exact_migration_rollback']:raise ClosedFailure('preflight')
        # Use a separate session: no TEST pg_temp publisher or preflight caller survives.
        private_run(shared,'product_setup',psql,pg_env,private,45,(options()+migration.read_text()+(HERE/'operations-scope-compatible-read-native-setup.sql').read_text()).encode())
        direct=(HERE/'operations-scope-compatible-read-postgres-test.sql').read_text();output=private_run(shared,'product_direct',psql,pg_env,private,45,(options()+direct).encode())
        lines=output.read_text().splitlines();markers=[s for s in lines if s==DIRECT_MARKER]
        if markers!=[DIRECT_MARKER]:raise ClosedFailure('product_direct')
        rows=[]
        for line in lines:
            try:value=json.loads(line)
            except ValueError:continue
            if isinstance(value,list) and len(value)==8:rows.append(value)
        if len(rows)!=1:raise ClosedFailure('product_direct')
        vectors=private/'baseline-vectors.json';vectors.write_text(json.dumps(rows[0],ensure_ascii=False));vectors.chmod(0o600)
        output=private_run(shared,'product_vectors',[deno,'run','--allow-read',str(HERE/'operations-scope-compatible-read-vector-test.ts'),str(vectors)],deno_env,private,90)
        vector_marker='operations-scope-compatible-read-vectors PASS 8 actual_sql_same_frozen_models_null_costs'
        if output.read_text().splitlines()!=[vector_marker]:raise ClosedFailure('product_vectors')
        output=private_run(shared,'http_budget',[deno,'test','--unstable-sloppy-imports',str(HERE/'operations-scope-compatible-read-http-budget-test.ts')],deno_env,private,30)
        report=re.sub(r'\x1b\[[0-9;]*m','',output.read_text())
        if not re.search(r'ok\s*\|\s*5 passed\s*\|\s*0 failed',report):raise ClosedFailure('http_budget')
        budget_marker='operations-scope-compatible-read-http-budget PASS 5 isolated_ignored_abort_resources'
        http_markers=http(shared,psql,pg_env,env,deno,private)
        output=private_run(shared,'native_sessions',['bash',str(HERE/'operations-scope-compatible-read-native-concurrency.sh'),str(vectors)],env,private,240)
        terminal=terminal_proof(output.read_text().splitlines())
        verified=[DIRECT_MARKER,vector_marker,budget_marker]+http_markers+terminal
    except ClosedFailure as error:retain=error.retain_private;raise
    finally:
        if not retain:shutil.rmtree(private)
    for marker in verified:print(marker)

def main():
    def stop(_signal,_frame):raise ClosedFailure('guard')
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:execute(dict(os.environ))
    except ClosedFailure as error:
        print('operations-scope-compatible-read-native FAIL '+error.phase+' SQLSTATE='+error.code+' CHECKPOINT='+error.checkpoint,file=sys.stderr);return 1
    except Exception:
        print('operations-scope-compatible-read-native FAIL guard SQLSTATE=unclassified CHECKPOINT=none',file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
