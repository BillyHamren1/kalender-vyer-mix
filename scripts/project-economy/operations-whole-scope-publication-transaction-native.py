#!/usr/bin/env python3
"""Disposable native atomic-publication proof; no product publication authority."""
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

DATABASE='eventflow_scope_publication_runtime'
FIXED_ENV={'CI':'true','EVENTFLOW_SCOPE_PUBLICATION_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
ALLOWED_PG={'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}
PUBLIC_SQLSTATES={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES={'guard','paths','source_closure','fresh_database','schema','obligation_fixture','setup','direct_sql','direct_vectors','native_sessions','proof'}
DIRECT_MARKER='whole-scope-publication-transaction-direct PASS actual_sources_atomic_saved_kernel_historical_replay_blocked_delivery'
NATIVE_VECTOR='whole-scope-publication-transaction-vectors PASS 18 actual_saved_sql_to_unchanged_kernel'
NATIVE_MARKER='whole-scope-publication-transaction-native PASS same_transaction_saved_kernel_atomic_history_actual_source_authority_waits_as_of_graph_blocked_delivery'
EXPECTED=['whole-scope-publication-transaction-native PASS direct2',NATIVE_VECTOR,NATIVE_MARKER]
HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
CLOSURE=HERE/'whole-scope-publication-transaction-native-closure.json'
BASE_CLOSURE=HERE/'whole-scope-projection-native-closure.json'
SHARED=HERE/'operations-hired-personnel-native.py'
SHARED_SHA256='cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
BASE_RUNNER=HERE/'operations-whole-scope-projection-native.py'
BASE_RUNNER_SHA256='3001042c4aaa06e2a0c7558818a84920d261a34d55d28101a4b5a84fefa24fdd'
SIX=('scripts/project-economy/whole-scope-publication-transaction-native-concurrency.sh','scripts/project-economy/whole-scope-publication-transaction-native-postgres-test.sql','scripts/project-economy/whole-scope-publication-transaction-native-setup.sql','scripts/project-economy/whole-scope-publication-transaction-native-vector-test.ts','scripts/project-economy/whole-scope-publication-transaction-prototype.sql','docs/project-economy/whole-scope-publication-transaction-native-contract.md')
EXTRA=SIX+('scripts/project-economy/operations-scope-invoice-kernel-native-setup.sql','scripts/project-economy/whole-scope-projection-native-closure.json','scripts/project-economy/operations-whole-scope-projection-native.py','scripts/project-economy/operations-whole-scope-publication-transaction-native.py','scripts/project-economy/operations-whole-scope-publication-transaction-native.guard.test.py')

class ClosedFailure(Exception):
    def __init__(self,phase,code='unclassified',retain_private=False):
        self.phase=phase if phase in PHASES else 'guard'
        self.code=code if code in PUBLIC_SQLSTATES else 'unclassified'
        self.retain_private=retain_private
        super().__init__('closed_publication_failure')

def validate_environment(env):
    if any(env.get(k)!=v for k,v in FIXED_ENV.items()) or env.get('GITHUB_REPOSITORY')!='BillyHamren1/kalender-vyer-mix' or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):raise ClosedFailure('guard')
    for key,value in env.items():
        if not value:continue
        if key.startswith('PG') and key not in ALLOWED_PG or key.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_')) or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP'}:raise ClosedFailure('guard')
        if key.startswith('EVENTFLOW_SCOPE_PUBLICATION_') and key not in {'EVENTFLOW_SCOPE_PUBLICATION_ISOLATED_DB','EVENTFLOW_SCOPE_PUBLICATION_DENO_BIN'}:raise ClosedFailure('guard')
    deno=env.get('EVENTFLOW_SCOPE_PUBLICATION_DENO_BIN','deno')
    if deno!='deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve()!=pathlib.Path(deno) or not pathlib.Path(deno).is_file()):raise ClosedFailure('guard')
    return deno

def load_module(path,name,expected):
    if path.resolve()!=path or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ClosedFailure('paths')
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def load_shared():return load_module(SHARED,'publication_owned_cleanup',SHARED_SHA256)

def closure_paths(root=ROOT,manifest=CLOSURE):
    try:
        if not manifest.is_file() or manifest.resolve()!=manifest:raise ValueError()
        value=json.loads(manifest.read_text());base=json.loads((root/'scripts/project-economy/whole-scope-projection-native-closure.json').read_text())
        if set(value)!={'schema','database','ordered_schema_paths','files'} or value['schema']!='operations-whole-scope-publication-transaction-native-closure.v1' or value['database']!=DATABASE or not isinstance(value['files'],dict):raise ValueError()
        if base['schema']!='operations-whole-scope-projection-native-closure.v1' or len(base['files'])!=40 or value['ordered_schema_paths']!=base['ordered_schema_paths'] or len(value['ordered_schema_paths'])!=23 or set(value['files'])!=set(base['files'])|set(EXTRA):raise ValueError()
        for name,digest in value['files'].items():
            if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):raise ValueError()
            path=root/name
            if not path.is_file() or path.resolve()!=path or not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError()
        if any(value['files'][name]!=digest for name,digest in base['files'].items()):raise ValueError()
        # Pinned existing runner verifies the exact 23 DDL order against its
        # frozen HTTP closure and shared SCHEMA_PATHS; no caller DDL selection.
        original=load_module(BASE_RUNNER,'publication_frozen_projection_closure',BASE_RUNNER_SHA256)
        original.closure_paths(root,root/'scripts/project-economy/whole-scope-projection-native-closure.json')
        return [root/name for name in value['ordered_schema_paths']]
    except ClosedFailure:raise
    except Exception:raise ClosedFailure('source_closure') from None

def private_run(shared,phase,command,env,private,timeout,stdin=None):
    directory=private/phase;directory.mkdir(mode=0o700)
    try:return shared.run_private('authority_sql',command,env,ROOT,directory,timeout,stdin)
    except shared.ClosedFailure as error:raise ClosedFailure(phase,error.code,error.retain_private) from None

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

def options():return "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';set idle_in_transaction_session_timeout='35s';set eventflow.scope_publication_isolated='synthetic-disposable';\n"

def direct_sql():
    source=(HERE/'whole-scope-publication-transaction-native-postgres-test.sql').read_text()
    selector="select jsonb_agg(jsonb_build_object('label','direct_'||publication_revision,'capture',capture::text,'projection',projection::text,'document',document::text,'evidence_fingerprint',evidence_fingerprint,'publication_fingerprint',publication_fingerprint) order by publication_revision)::text as native_publication_vectors\n from operations_scope_publication_native.publications;"
    if source.count(selector)!=1 or source.count("\\echo '"+DIRECT_MARKER+"'")!=1 or not source.rstrip().endswith("\\echo '"+DIRECT_MARKER+"'"):raise ClosedFailure('direct_sql')
    source=source.replace(selector,'\\o\n'+selector+'\n\\o /dev/null')
    return options()+'\\o /dev/null\n'+(HERE/'whole-scope-projection-sql-prototype.sql').read_text()+'\n'+(HERE/'whole-scope-publication-transaction-prototype.sql').read_text()+'\n'+source

def direct_vectors(output):
    try:
        if output.resolve()!=output or output.stat().st_size>8*1024*1024:raise ValueError()
        lines=output.read_text().splitlines()
        if len(lines)!=2 or lines[1]!=DIRECT_MARKER:raise ValueError()
        rows=json.loads(lines[0],parse_constant=lambda _v:(_ for _ in ()).throw(ValueError()))
        if not isinstance(rows,list) or len(rows)!=2 or [r.get('label') for r in rows]!=['direct_1','direct_2']:raise ValueError()
        return rows
    except Exception:raise ClosedFailure('direct_sql') from None

def execute(env):
    deno=validate_environment(env)
    if HERE.parts[-2:]!=('scripts','project-economy') or pathlib.Path(__file__).resolve()!=pathlib.Path(__file__).absolute():raise ClosedFailure('paths')
    ddl=closure_paths();shared=load_shared()
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-publication-native-',dir='/tmp'));private.chmod(0o700);retain=False
    pg_env=dict(env);pg_env['PGCONNECT_TIMEOUT']='5'
    deno_env={k:v for k,v in env.items() if not k.startswith('PG')}
    psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
    try:
        fresh="set statement_timeout='15s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'));\n"
        output=private_run(shared,'fresh_database',psql,pg_env,private,30,fresh.encode())
        if output.read_text().splitlines()!=['t']:raise ClosedFailure('fresh_database')
        private_run(shared,'schema',psql,pg_env,private,90,(options()+'\n'.join(path.read_text() for path in ddl)).encode())
        output=private_run(shared,'obligation_fixture',[deno,'run',str(HERE/'operations-obligation-fixture.ts')],deno_env,private,90)
        fixture=read_json(output,'obligation_fixture')
        private_run(shared,'setup',psql,pg_env,private,90,setup_sql((HERE/'whole-scope-publication-transaction-native-setup.sql').read_text(),fixture).encode())
        output=private_run(shared,'direct_sql',psql,pg_env,private,90,direct_sql().encode())
        rows=direct_vectors(output);vectors=private/'direct-vectors.json';vectors.write_text(json.dumps(rows,ensure_ascii=False,allow_nan=False));vectors.chmod(0o600)
        proof=private_run(shared,'direct_vectors',[deno,'run','--allow-read='+str(vectors),str(HERE/'whole-scope-publication-transaction-native-vector-test.ts'),str(vectors)],deno_env,private,90)
        if proof.read_text().splitlines()!=['whole-scope-publication-transaction-vectors PASS 2 actual_saved_sql_to_unchanged_kernel']:raise ClosedFailure('proof')
        # The shell sets its own bounded PGOPTIONS. Pass original guarded env;
        # never inherit this wrapper's libpq overrides or private output paths.
        output=private_run(shared,'native_sessions',['bash',str(HERE/'whole-scope-publication-transaction-native-concurrency.sh')],env,private,240)
        if output.read_text().splitlines()!=[NATIVE_VECTOR,NATIVE_MARKER]:raise ClosedFailure('proof')
    except ClosedFailure as error:retain=error.retain_private;raise
    finally:
        if not retain:shutil.rmtree(private)
    for marker in EXPECTED:print(marker)

def interrupted(_signal,_frame):raise ClosedFailure('guard')

def main():
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:execute(dict(os.environ))
    except ClosedFailure as error:
        print('whole-scope-publication-transaction-native FAIL '+error.phase+' SQLSTATE='+error.code,file=sys.stderr);return 1
    except Exception:
        print('whole-scope-publication-transaction-native FAIL guard SQLSTATE=unclassified',file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
