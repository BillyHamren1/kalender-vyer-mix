#!/usr/bin/env python3
"""Test-only native PostgreSQL projection parity; closed public proof protocol."""
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

DATABASE = 'operations_scope_projection_runtime'
FIXED_ENV = {'CI':'true','EVENTFLOW_SCOPE_PROJECTION_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
ALLOWED_PG = {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}
PUBLIC_SQLSTATES = {'22023','23505','23503','23514','42501','40001','55000','55P03','57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES = {'guard','paths','source_closure','fresh_database','synthetic_vectors','synthetic_parity','schema','obligation_fixture','invoice_catalog','scope_catalog','combined_vectors','combined_parity','proof'}
EXPECTED = ['whole-scope-projection-native PASS synthetic41','whole-scope-projection-native PASS actual_reader11','whole-scope-projection-native PASS combined52']
HERE = pathlib.Path(__file__).absolute().parent
ROOT = HERE.parent.parent
CLOSURE = HERE / 'whole-scope-projection-native-closure.json'
SHARED = HERE / 'operations-hired-personnel-native.py'
PROTOTYPE = HERE / 'whole-scope-projection-sql-prototype.sql'
GENERATOR = HERE / 'whole-scope-projection-parity-vectors.ts'
LABEL_SOURCE = HERE / 'whole-scope-projection-parity-pglite.mjs'
SHARED_SHA256 = 'cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
EXTRA_PATHS = ('scripts/project-economy/operations-hired-personnel-native.py','scripts/project-economy/operations-invoice-kernel-vector-test.ts','scripts/project-economy/operations-invoice-obligation-kernel-postgres-test.sql','scripts/project-economy/operations-obligation-fixture.ts','scripts/project-economy/operations-scope-invoice-kernel-postgres-test.sql','scripts/project-economy/operations-scope-invoice-kernel-vector-test.ts','scripts/project-economy/project-evidence-http-runtime/schema-closure.json','scripts/project-economy/whole-scope-projection-parity-pglite.mjs','scripts/project-economy/whole-scope-projection-parity-vectors.ts','scripts/project-economy/whole-scope-projection-sql-prototype.sql','supabase/functions/_shared/finance-project-invoice-destination.ts','supabase/functions/_shared/finance-project-invoice.ts','supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts','supabase/functions/_shared/project-cost-obligation-authority.ts','supabase/functions/_shared/project-cost-obligations.ts','supabase/functions/_shared/project-operational-eac.ts','supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts')
SQL_TESTS = {'invoice_catalog':('operations-invoice-obligation-kernel-postgres-test.sql','kernel_vectors',6), 'scope_catalog':('operations-scope-invoice-kernel-postgres-test.sql','scope_invoice_vectors',5)}

class ClosedFailure(Exception):
    def __init__(self, phase, code='unclassified', retain_private=False):
        self.phase = phase if phase in PHASES else 'guard'
        self.code = code if code in PUBLIC_SQLSTATES else 'unclassified'
        self.retain_private = retain_private
        super().__init__('closed_parity_failure')


def validate_environment(env):
    if any(env.get(k)!=v for k,v in FIXED_ENV.items()) or env.get('GITHUB_REPOSITORY')!='BillyHamren1/kalender-vyer-mix' or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):
        raise ClosedFailure('guard')
    for key,value in env.items():
        if not value: continue
        if key.startswith('PG') and key not in ALLOWED_PG or key.startswith(('SUPABASE_','PGRST_','COMPOSE_','DOCKER_')) or key in {'DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP'}:
            raise ClosedFailure('guard')
        if key.startswith('EVENTFLOW_SCOPE_PROJECTION_') and key not in {'EVENTFLOW_SCOPE_PROJECTION_ISOLATED_DB','EVENTFLOW_SCOPE_PROJECTION_DENO_BIN'}: raise ClosedFailure('guard')
    deno=env.get('EVENTFLOW_SCOPE_PROJECTION_DENO_BIN','deno')
    if deno!='deno' and (not pathlib.Path(deno).is_absolute() or pathlib.Path(deno).resolve()!=pathlib.Path(deno) or not pathlib.Path(deno).is_file()): raise ClosedFailure('guard')
    return deno


def closure_paths(root=ROOT, manifest=CLOSURE):
    try:
        if not manifest.is_file() or manifest.resolve()!=manifest: raise ValueError()
        value=json.loads(manifest.read_text())
        if set(value)!={'schema','database','ordered_schema_paths','files'} or value['schema']!='operations-whole-scope-projection-native-closure.v1' or value['database']!=DATABASE or not isinstance(value['files'],dict): raise ValueError()
        # Exact ordered owned DDL is fixed in this script, not supplied by a request.
        http=json.loads((root/'scripts/project-economy/project-evidence-http-runtime/schema-closure.json').read_text())
        if http['schema']!='operations-project-evidence-http-schema-closure.v1' or http['database']!='eventflow_project_evidence_http_runtime' or len(http['ordered_paths'])!=21 or http['ordered_paths']!=list(load_shared().SCHEMA_PATHS): raise ValueError()
        ordered=list(http['ordered_paths'])
        index=ordered.index('supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql')
        ordered.insert(index,'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql')
        ordered.append('scripts/project-economy/operations-transport-seed.sql')
        if value['ordered_schema_paths']!=ordered or len(ordered)!=23 or set(value['files'])!=set(ordered)|set(EXTRA_PATHS): raise ValueError()
        required={str(path.relative_to(ROOT)) for path in [SHARED,PROTOTYPE,GENERATOR,LABEL_SOURCE]}
        required.update('scripts/project-economy/'+item[0] for item in SQL_TESTS.values())
        required.update({'scripts/project-economy/operations-obligation-fixture.ts','scripts/project-economy/project-evidence-http-runtime/schema-closure.json'})
        if not required.issubset(value['files']): raise ValueError()
        for name,digest in value['files'].items():
            path=root/name
            if not isinstance(name,str) or pathlib.PurePosixPath(name).is_absolute() or '..' in pathlib.PurePosixPath(name).parts or not re.fullmatch(r'[0-9a-f]{64}',digest) or not path.is_file() or path.resolve()!=path or not path.is_relative_to(root): raise ValueError()
            if hashlib.sha256(path.read_bytes()).hexdigest()!=digest: raise ValueError()
        return [root/name for name in ordered]
    except (OSError,ValueError,TypeError,KeyError): raise ClosedFailure('source_closure') from None


def load_shared():
    if SHARED.resolve()!=SHARED or hashlib.sha256(SHARED.read_bytes()).hexdigest()!=SHARED_SHA256: raise ClosedFailure('paths')
    spec=importlib.util.spec_from_file_location('projection_owned_child_cleanup',SHARED)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def private_run(shared,phase,command,env,private,timeout,stdin=None):
    directory=private/phase;directory.mkdir(mode=0o700)
    try: return shared.run_private('authority_sql',command,env,ROOT,directory,timeout,stdin)
    except shared.ClosedFailure as failure: raise ClosedFailure(phase,failure.code,failure.retain_private) from None


def read_json(path,phase):
    try:
        if path.resolve()!=path or not path.is_file() or path.stat().st_size>8*1024*1024: raise ValueError()
        return json.loads(path.read_text(encoding='utf-8'),parse_constant=lambda _v: (_ for _ in ()).throw(ValueError()))
    except (OSError,UnicodeError,ValueError): raise ClosedFailure(phase) from None


def copy_json(value,table):
    if table not in {'prototype_vectors','fixture_input'}: raise ClosedFailure('proof')
    stream=io.StringIO();writer=csv.writer(stream,lineterminator='\n',quoting=csv.QUOTE_ALL)
    writer.writerow([json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)])
    return 'create temporary table '+table+'(data jsonb not null);\nCOPY pg_temp.'+table+'(data) FROM STDIN WITH (FORMAT csv);\n'+stream.getvalue()+'\\.\n'


def fixed_labels():
    source=LABEL_SOURCE.read_text()
    result=[]
    for name in ['baseLabels','actualCatalogLabels']:
        match=re.search(r'const '+name+r' = \[(.*?)\];',source,re.S)
        if not match: raise ClosedFailure('source_closure')
        labels=re.findall(r'"([a-z0-9_]{1,96})"',match.group(1))
        if len(labels)!=(41 if name=='baseLabels' else 11) or len(labels)!=len(set(labels)): raise ClosedFailure('source_closure')
        result.append(set(labels))
    return result


def validate_vectors(value,combined=False):
    base,actual=fixed_labels();required=base|actual if combined else base
    if not isinstance(value,dict) or set(value)!={'schema','vectors','ts_only_source_version_denials'} or value['schema']!='whole-scope-projection-prototype-vectors.v1' or value['ts_only_source_version_denials']!=5 or not isinstance(value['vectors'],list) or len(value['vectors'])!=len(required): raise ClosedFailure('proof')
    seen=set()
    for vector in value['vectors']:
        if not isinstance(vector,dict) or set(vector)!={'label','function','input','expected','error'} or vector['label'] not in required or vector['label'] in seen or vector['function'] not in {'obligation','leaf','scope'} or not (vector['error'] is None or isinstance(vector['error'],str) and len(vector['error'])<=200): raise ClosedFailure('proof')
        seen.add(vector['label'])
    if seen!=required: raise ClosedFailure('proof')
    return value


def parity_sql(catalog,marker):
    if marker not in {'synthetic41','combined52'}: raise ClosedFailure('proof')
    expected=41 if marker=='synthetic41' else 52
    return "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';\n"+PROTOTYPE.read_text()+'\n'+copy_json(catalog,'prototype_vectors')+'''
do $$declare vector jsonb;actual jsonb;actual_error text;count int:=0;begin
 for vector in select value from pg_temp.prototype_vectors,jsonb_array_elements(data->'vectors') loop
 actual:=null;actual_error:=null;
 begin
 case vector->>'function'
 when 'obligation' then actual:=pg_temp.prototype_obligation(vector->'input');
 when 'leaf' then actual:=pg_temp.prototype_leaf(vector->'input');
 when 'scope' then actual:=pg_temp.prototype_scope(vector->'input');
 else raise exception 'closed_invalid_function';end case;
 exception when others then actual_error:=sqlerrm;end;
 if actual_error is distinct from vector->>'error' then raise exception 'closed_prototype_error_mismatch';end if;
 if actual_error is null and actual is distinct from vector->'expected' then raise exception 'closed_prototype_result_mismatch';end if;
 count:=count+1;end loop;
 if count<>'''+str(expected)+''' then raise exception 'closed_prototype_count_mismatch';end if;
end;$$;
select 'whole-scope-projection-native PASS '''+marker+"';\n"


def fixture_sql(source,fixture,phase):
    name,table,count=SQL_TESTS[phase]
    if source.count(":'fixture'")!=1: raise ClosedFailure(phase)
    selector=re.compile(r'^select label,evidence::text(?: as evidence)? from '+table+r' order by label;$',re.M)
    if len(selector.findall(source))!=1: raise ClosedFailure(phase)
    source=re.sub(r'^\\set ON_ERROR_STOP on\n','',source,count=1)
    source=source.replace(":'fixture'",'(select data from pg_temp.fixture_input)')
    # Actual fixed SQL fixture remains unchanged except its one data binding and
    # private output capture; ALL original assertions and rollback are retained.
    aggregate="\\o\nselect jsonb_agg(jsonb_build_object('label',label,'evidence',evidence::text) order by label)::text from "+table+";\n\\o /dev/null"
    source=selector.sub(lambda _m:aggregate,source)
    return "set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';\n"+copy_json(fixture,'fixture_input')+'\\o /dev/null\n'+source


def execute(env):
    deno=validate_environment(env)
    if HERE.parts[-2:]!=('scripts','project-economy') or pathlib.Path(__file__).resolve()!=pathlib.Path(__file__).absolute(): raise ClosedFailure('paths')
    ddl=closure_paths();base_labels,_=fixed_labels();shared=load_shared()
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-projection-native-',dir='/tmp'));private.chmod(0o700);retain=False
    pg_env=dict(env);pg_env['PGCONNECT_TIMEOUT']='5'
    deno_env={k:v for k,v in env.items() if not k.startswith('PG')}
    psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
    try:
        fresh="set statement_timeout='15s';select current_database()='"+DATABASE+"' and current_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'));\n"
        output=private_run(shared,'fresh_database',psql,pg_env,private,30,fresh.encode())
        if output.read_text().splitlines()!=['t']: raise ClosedFailure('fresh_database')
        synthetic=private/'synthetic.json'
        private_run(shared,'synthetic_vectors',[deno,'run','--allow-read='+str(private),'--allow-write='+str(private),str(GENERATOR),str(synthetic)],deno_env,private,90)
        value=validate_vectors(read_json(synthetic,'synthetic_vectors'))
        proof=private_run(shared,'synthetic_parity',psql,pg_env,private,90,parity_sql(value,'synthetic41').encode())
        if proof.read_text().splitlines()!=[EXPECTED[0]]: raise ClosedFailure('proof')
        sql="set standard_conforming_strings=on;set statement_timeout='30s';set lock_timeout='10s';\n"+'\n'.join(path.read_text() for path in ddl)
        private_run(shared,'schema',psql,pg_env,private,90,sql.encode())
        obligation=private_run(shared,'obligation_fixture',[deno,'run',str(HERE/'operations-obligation-fixture.ts')],deno_env,private,90)
        fixture=read_json(obligation,'obligation_fixture')
        catalogs=[]
        for phase,(name,_table,count) in SQL_TESTS.items():
            output=private_run(shared,phase,psql,pg_env,private,90,fixture_sql((HERE/name).read_text(),fixture,phase).encode())
            rows=read_json(output,phase)
            if not isinstance(rows,list) or len(rows)!=count: raise ClosedFailure(phase)
            catalog=private/(phase+'.json');catalog.write_text(json.dumps(rows,ensure_ascii=False,allow_nan=False));catalog.chmod(0o600);catalogs.append(catalog)
        combined=private/'combined.json'
        private_run(shared,'combined_vectors',[deno,'run','--allow-read='+str(private),'--allow-write='+str(private),str(GENERATOR),str(combined),*[str(path) for path in catalogs]],deno_env,private,90)
        value=validate_vectors(read_json(combined,'combined_vectors'),True)
        proof=private_run(shared,'combined_parity',psql,pg_env,private,90,parity_sql(value,'combined52').encode())
        if proof.read_text().splitlines()!=[EXPECTED[2]]: raise ClosedFailure('proof')
    except ClosedFailure as failure:
        retain=failure.retain_private;raise
    finally:
        if not retain: shutil.rmtree(private)
    for line in EXPECTED:print(line)


def interrupted(_signal,_frame):
    raise ClosedFailure('guard')

def main():
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try: execute(dict(os.environ))
    except ClosedFailure as failure:
        print('whole-scope-projection-native FAIL '+failure.phase+' SQLSTATE='+failure.code,file=sys.stderr);return 1
    except Exception:
        print('whole-scope-projection-native FAIL guard SQLSTATE=unclassified',file=sys.stderr);return 1
    return 0

if __name__=='__main__':sys.exit(main())
