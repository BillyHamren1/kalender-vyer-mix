#!/usr/bin/env python3
"""Disposable faithful role and packing-policy proof; no product entry authority."""
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
FIXED_ENV={'CI':'true','EVENTFLOW_SCOPE_READER_PERMISSION_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
ALLOWED_PG={'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}
PUBLIC_SQLSTATES={'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES={'guard','paths','source_closure','fresh_database','schema','obligation_fixture','setup','try_setup','permission_setup','permission_direct','native_sessions','proof'}
NATIVE_MARKER='whole-scope-reader-permission-native PASS actual_role_and_packing_queues_unknown_cost_no_product_authority'
DIRECT_MARKER='whole-scope-reader-permission-direct PASS constraints3_denials5_unknown_saved1_rollback'
HERE=pathlib.Path(__file__).absolute().parent
ROOT=HERE.parent.parent
CLOSURE=HERE/'whole-scope-reader-permission-native-closure.json'
BASE_CLOSURE=HERE/'whole-scope-publication-try-native-closure.json'
SHARED=HERE/'operations-hired-personnel-native.py'
SHARED_SHA256='cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
BASE_RUNNER=HERE/'operations-whole-scope-publication-try-native.py'
BASE_RUNNER_SHA256='14194e3c6f99333aaaee247fed02c417ce13a80f3092ef6e2a1d47a4fa1014db'
EXTRA=('scripts/project-economy/whole-scope-publication-try-native-closure.json','scripts/project-economy/whole-scope-reader-permission-native-setup.sql','scripts/project-economy/whole-scope-reader-permission-native-postgres-test.sql','docs/project-economy/whole-scope-reader-permission-native-contract.md','scripts/project-economy/whole-scope-reader-permission-native-concurrency.sh','scripts/project-economy/operations-whole-scope-reader-permission-native.py','scripts/project-economy/operations-whole-scope-reader-permission-native.guard.test.py')

CHECKPOINTS={'none','guard','role_writer','role_reader','direct_packing','compound_packing','compound_held','vectors','terminal'}
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
        if key.startswith('PG') and key not in ALLOWED_PG or key.startswith(('SUPABASE_','PGRST_','DOCKER_','COMPOSE_','BASH_FUNC_','DYLD_')) or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','NODE_OPTIONS','SHELLOPTS','BASHOPTS','PS4','PYTHONSTARTUP','PYTHONINSPECT','LD_PRELOAD','LD_LIBRARY_PATH'}:raise ClosedFailure('guard')
        if key.startswith(('EVENTFLOW_SCOPE_PUBLICATION_','EVENTFLOW_SCOPE_READER_PERMISSION_')) and key not in {'EVENTFLOW_SCOPE_READER_PERMISSION_ISOLATED_DB','EVENTFLOW_SCOPE_READER_PERMISSION_DENO_BIN'}:raise ClosedFailure('guard')
    deno=env.get('EVENTFLOW_SCOPE_READER_PERMISSION_DENO_BIN','deno')
    if deno!='deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve()!=pathlib.Path(deno) or not pathlib.Path(deno).is_file()):raise ClosedFailure('guard')
    return deno

def load_module(path,name,expected):
    if path.resolve()!=path or not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=expected:raise ClosedFailure('paths')
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def load_shared():return load_module(SHARED,'publication_owned_cleanup',SHARED_SHA256)

def closure_paths(root=ROOT,manifest=CLOSURE):
    try:
        if not manifest.is_file() or manifest.resolve()!=manifest:raise ValueError()
        value=json.loads(manifest.read_text());base=json.loads((root/'scripts/project-economy/whole-scope-publication-try-native-closure.json').read_text())
        if set(value)!={'schema','database','ordered_schema_paths','files'} or value['schema']!='operations-whole-scope-reader-permission-native-closure.v1' or value['database']!=DATABASE or not isinstance(value['files'],dict):raise ValueError()
        if base['schema']!='operations-whole-scope-publication-try-native-closure.v1' or len(base['files'])!=58 or value['ordered_schema_paths']!=base['ordered_schema_paths'] or len(value['ordered_schema_paths'])!=23 or set(value['files'])!=set(base['files'])|set(EXTRA):raise ValueError()
        for name,digest in value['files'].items():
            if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not isinstance(digest,str) or not re.fullmatch(r'[0-9a-f]{64}',digest):raise ValueError()
            path=root/name
            if not path.is_file() or path.resolve()!=path or not path.is_relative_to(root) or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError()
        if any(value['files'][name]!=digest for name,digest in base['files'].items()):raise ValueError()
        # Pinned existing runner verifies the exact 23 DDL order against its
        # frozen HTTP closure and shared SCHEMA_PATHS; no caller DDL selection.
        original=load_module(BASE_RUNNER,'publication_frozen_transaction_closure',BASE_RUNNER_SHA256)
        original.closure_paths(root,root/'scripts/project-economy/whole-scope-publication-try-native-closure.json')
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
                matches=re.findall(r'^TRY_NATIVE_CHECKPOINT ([a-z_]+)$',log.read_text(),re.M)
                if matches and matches[-1] in CHECKPOINTS:checkpoint=matches[-1]
                matches=re.findall(r'^TRY_NATIVE_REASON ([a-z_]+)$',log.read_text(),re.M)
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

def options():return "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';set idle_in_transaction_session_timeout='35s';set eventflow.scope_publication_isolated='synthetic-disposable';set eventflow.scope_publication_try_isolated='synthetic-disposable';\n"

def terminal_proof(lines):
    if not isinstance(lines,list) or len(lines)!=3 or lines[2]!=NATIVE_MARKER:raise ClosedFailure('proof')
    vector=re.fullmatch(r'whole-scope-publication-transaction-vectors PASS ([56]) actual_saved_sql_to_unchanged_kernel',lines[0])
    branch=re.fullmatch(r'whole-scope-reader-permission-branches PASS compound_as_of=([01]) saved=([56])',lines[1])
    if not vector or not branch or int(vector[1])!=int(branch[2]) or int(branch[2])!=5+int(branch[1]):raise ClosedFailure('proof')
    return lines

def execute(env):
    deno=validate_environment(env)
    if HERE.parts[-2:]!=('scripts','project-economy') or pathlib.Path(__file__).resolve()!=pathlib.Path(__file__).absolute():raise ClosedFailure('paths')
    ddl=closure_paths();shared=load_shared()
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-reader-permission-native-',dir='/tmp'));private.chmod(0o700);retain=False
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
        private_run(shared,'try_setup',psql,pg_env,private,30,(options()+(HERE/'whole-scope-publication-try-native-setup.sql').read_text()).encode())
        private_run(shared,'permission_setup',psql,pg_env,private,45,(options()+(HERE/'whole-scope-reader-permission-native-setup.sql').read_text()).encode())
        direct=options()+'\n'.join((HERE/name).read_text() for name in ('whole-scope-projection-sql-prototype.sql','whole-scope-publication-transaction-prototype.sql','whole-scope-publication-try-native-wrapper.sql','whole-scope-reader-permission-native-postgres-test.sql'))
        output=private_run(shared,'permission_direct',psql,pg_env,private,45,direct.encode())
        if [line for line in output.read_text().splitlines() if line.startswith('whole-scope-')]!=[DIRECT_MARKER]:raise ClosedFailure('permission_direct')
        # This separately fresh job never runs the older three-project TRY shell.
        output=private_run(shared,'native_sessions',['bash',str(HERE/'whole-scope-reader-permission-native-concurrency.sh')],env,private,120)
        verified=[DIRECT_MARKER]+terminal_proof(output.read_text().splitlines())
    except ClosedFailure as error:retain=error.retain_private;raise
    finally:
        if not retain:shutil.rmtree(private)
    for marker in verified:print(marker)

def interrupted(_signal,_frame):raise ClosedFailure('guard')

def main():
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:execute(dict(os.environ))
    except ClosedFailure as error:
        print('whole-scope-reader-permission-native FAIL '+error.phase+' SQLSTATE='+error.code+' CHECKPOINT='+error.checkpoint+' REASON='+error.reason,file=sys.stderr);return 1
    except Exception:
        print('whole-scope-reader-permission-native FAIL guard SQLSTATE=unclassified CHECKPOINT=none REASON=none',file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
