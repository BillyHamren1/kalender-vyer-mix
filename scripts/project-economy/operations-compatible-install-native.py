#!/usr/bin/env python3
"""Fresh-disposable, per-migration atomicity proof. No hosted installation."""
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
DATABASE = 'operations_compatible_install_runtime'
BASE = 'scripts/project-economy/operations-scope-compatible-read-native-closure.json'
BASE_SHA = '7afa5082e3c118ffe318e7699a55b1e70d3561b00da006525c35828e0f9a95cb'
SHARED = 'scripts/project-economy/operations-hired-personnel-native.py'
SHARED_SHA = 'cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
ADMIN = 'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql'
FIRST = 'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql'
SIX = 'supabase/migrations/20261002145349_operations_remaining_six_compatible_read_entries.sql'
EXTRA = (BASE, SIX,
 'scripts/project-economy/operations-compatible-install-native-setup.sql',
 'scripts/project-economy/operations-compatible-install-native.py',
 'scripts/project-economy/operations-compatible-install-native.guard.test.py',
 'docs/project-economy/operations-compatible-atomic-install-native-contract.md')
PHASES = {'guard','closure','fresh_database','schema','setup','capture','failure_first','success_first','failure_six','success_six','delta','cleanup'}
CODES = {'unclassified','22023','42501','42P01','42710','42723','55000','P0001','55P03','57014','40P01','25P02'}
CLIENTS = ('anon','authenticated','service_role')
LIMIT = 8 * 1024 * 1024
SNAPSHOT_KEYS = {'schema','functions','schemas','relations','indices','constraints','types','triggers','policies','roles','memberships','events'}
scope_sql = "(n.nspname in ('public','auth') or n.nspname ~ '^operations_[a-z0-9_]+$')"

class ClosedFailure(Exception):
    def __init__(self, phase, code='unclassified'):
        self.phase = phase if phase in PHASES else 'guard'
        self.code = code if code in CODES else 'unclassified'
        super().__init__('closed_install_failure')

def validate_environment(env):
    fixed = {'CI':'true','EVENTFLOW_COMPATIBLE_INSTALL_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE,'PYTHONDONTWRITEBYTECODE':'1'}
    if any(env.get(k) != v for k,v in fixed.items()): raise ClosedFailure('guard')
    if env.get('GITHUB_REPOSITORY') != 'BillyHamren1/kalender-vyer-mix' or not re.fullmatch(r'[1-9][0-9]*',env.get('GITHUB_RUN_ID','')): raise ClosedFailure('guard')
    for k,v in env.items():
        if not v: continue
        low=k.lower()
        if (k.startswith('PG') and k not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}) or low.endswith('_proxy'):
            raise ClosedFailure('guard')
        if k.startswith(('LD_','DYLD_','BASH_FUNC_')) or k in {'BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES'}:
            raise ClosedFailure('guard')

def load_json(path,phase):
    try:
        if path.resolve()!=path or not path.is_file() or path.stat().st_size>LIMIT: raise ValueError()
        return json.loads(path.read_text(),parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
    except Exception: raise ClosedFailure(phase) from None

def closure_paths(root=ROOT):
    try:
        base_path=root/BASE
        if hashlib.sha256(base_path.read_bytes()).hexdigest()!=BASE_SHA: raise ValueError()
        base=load_json(base_path,'closure');value=load_json(root/'scripts/project-economy/operations-compatible-install-native-closure.json','closure')
        if set(value)!={'schema','database','baseline_schema_paths','install_paths','files'} or value['schema']!='operations-compatible-atomic-install-native-closure.v1' or value['database']!=DATABASE: raise ValueError()
        if len(base['files'])!=86 or len(base['ordered_schema_paths'])!=23 or value['baseline_schema_paths']!=base['ordered_schema_paths']+[ADMIN] or value['install_paths']!=[FIRST,SIX]: raise ValueError()
        if set(value['files'])!=set(base['files'])|set(EXTRA): raise ValueError()
        for rel,sha in value['files'].items():
            path=root/rel
            if not isinstance(rel,str) or not re.fullmatch(r'[A-Za-z0-9_./-]+',rel) or '..' in pathlib.PurePosixPath(rel).parts or path.resolve()!=path or not path.is_file(): raise ValueError()
            if not re.fullmatch(r'[0-9a-f]{64}',sha) or hashlib.sha256(path.read_bytes()).hexdigest()!=sha: raise ValueError()
            if rel in base['files'] and sha!=base['files'][rel]: raise ValueError()
        return [root/x for x in value['baseline_schema_paths']]
    except ClosedFailure: raise
    except Exception: raise ClosedFailure('closure') from None

def shared_module():
    path=ROOT/SHARED
    if hashlib.sha256(path.read_bytes()).hexdigest()!=SHARED_SHA: raise ClosedFailure('closure')
    spec=importlib.util.spec_from_file_location('install_owned_process',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def options(target='none'):
    if target not in {'none','first_two','remaining_six'}: raise ClosedFailure('guard')
    return "set standard_conforming_strings=on;set statement_timeout='45s';set lock_timeout='10s';set idle_in_transaction_session_timeout='50s';set eventflow.compatible_install_isolated='synthetic-disposable';set eventflow.compatible_install_fault_target='"+target+"';\n"

def sql_string(value): return "'"+value.replace("'","''")+"'"

def function_specs(source):
    pattern=r'\bcreate(?: or replace)? function ([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\((.*?)\)\s+returns(.*?)\bas (\$[a-z_]*\$)(.*?)\4;'
    result={}
    for match in re.finditer(pattern,source,re.S):
        name,args,header,tag,body=match.groups()
        fields=[x.strip().split() for x in args.split(',') if x.strip()]
        if any(len(x)!=2 for x in fields): raise ClosedFailure('delta')
        identity=name+'('+','.join(x[1] for x in fields)+')'
        if identity in result: raise ClosedFailure('delta')
        result[identity]={'body_sha256':hashlib.sha256(body.encode()).hexdigest(),'arg_names':[x[0] for x in fields],
            'result_type':header.split()[0],'security_definer':'security definer' in header,
            'config':['search_path=""']+(['lock_timeout=100ms'] if "set lock_timeout='100ms'" in header else [])}
    return result

def snapshot_sql(statement_only=False):
    # Hashes, semantic identities and effective fixed-client privileges only.
    sql = """with funcs as (
 select n.nspname||'.'||p.proname||'('||replace(pg_catalog.oidvectortypes(p.proargtypes),', ',',')||')' identity,
 pg_catalog.pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.prokind::text kind,l.lanname language,
 p.provolatile::text volatility,p.proisstrict strict,p.proleakproof leakproof,p.proparallel::text parallel,p.proretset set_returning,
 encode(sha256(convert_to(coalesce(p.proargdefaults::text,''),'UTF8')),'hex') defaults_sha256,to_jsonb(p.proargmodes) argument_modes,
 pg_catalog.format_type(p.prorettype,null) result_type,coalesce(to_jsonb(p.proargnames),'[]'::jsonb) arg_names,
 to_jsonb(p.proconfig) config,to_jsonb(p.proacl) acl,
 encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') body_sha256,
 jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service_role',has_function_privilege('service_role',p.oid,'EXECUTE')) client_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where SCOPE
), schemas as (
 select n.nspname identity,pg_get_userbyid(n.nspowner) owner,to_jsonb(n.nspacl) acl,
 jsonb_build_object('anon',has_schema_privilege('anon',n.oid,'USAGE'),'authenticated',has_schema_privilege('authenticated',n.oid,'USAGE'),'service_role',has_schema_privilege('service_role',n.oid,'USAGE')) client_usage,
 jsonb_build_object('anon',has_schema_privilege('anon',n.oid,'CREATE'),'authenticated',has_schema_privilege('authenticated',n.oid,'CREATE'),'service_role',has_schema_privilege('service_role',n.oid,'CREATE')) client_create
 from pg_namespace n where SCOPE
), relations as (
 select n.nspname||'.'||c.relname identity,c.relkind::text kind,pg_get_userbyid(c.relowner) owner,to_jsonb(c.relacl) acl,c.relrowsecurity rls,c.relforcerowsecurity force_rls,c.relpersistence::text persistence,
 encode(sha256(convert_to(coalesce(to_jsonb(c.reloptions),'null'::jsonb)::text,'UTF8')),'hex') options_sha256,
 coalesce((select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'dropped',a.attisdropped,'identity',a.attidentity,'generated',a.attgenerated,
 'default_sha256',encode(sha256(convert_to(coalesce(pg_get_expr(d.adbin,d.adrelid),''),'UTF8')),'hex')) order by a.attnum)
 from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0),'[]'::jsonb) columns
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where SCOPE
), indices as (
 select n.nspname||'.'||c.relname identity,encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex') definition_sha256,i.indisvalid valid,i.indisready ready,i.indisunique unique_index
 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where SCOPE
), constraints as (
 select n.nspname||'.'||c.relname||'.'||k.conname identity,k.convalidated validated,encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex') definition_sha256
 from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where SCOPE
), types as (
 select n.nspname||'.'||t.typname identity,t.typtype::text kind,pg_get_userbyid(t.typowner) owner,to_jsonb(t.typacl) acl,
 coalesce((select jsonb_agg(e.enumlabel order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'[]'::jsonb) enum_labels
 from pg_type t join pg_namespace n on n.oid=t.typnamespace where SCOPE
), triggers as (
 select n.nspname||'.'||c.relname||'.'||t.tgname identity,t.tgenabled::text enabled,t.tgisinternal internal,
 encode(sha256(convert_to(pg_get_triggerdef(t.oid),'UTF8')),'hex') definition_sha256 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where SCOPE
), policies as (
 select n.nspname||'.'||c.relname||'.'||p.polname identity,p.polcmd::text command,p.polpermissive permissive,
 encode(sha256(convert_to(coalesce(p.polqual::text,'')||'\n'||coalesce(p.polwithcheck::text,''),'UTF8')),'hex') expressions_sha256,
 coalesce((select jsonb_agg(case when x=0 then 'PUBLIC' else pg_get_userbyid(x) end order by x) from unnest(p.polroles)x),'[]'::jsonb) roles
 from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where SCOPE
), roles as (
 select r.rolname identity,r.rolsuper superuser,r.rolinherit inherit,r.rolcreaterole create_role,r.rolcreatedb create_db,r.rolcanlogin login,r.rolbypassrls bypass_rls,r.rolconnlimit connection_limit,
 encode(sha256(convert_to(coalesce(to_jsonb(r.rolconfig),'null'::jsonb)::text,'UTF8')),'hex') config_sha256 from pg_roles r
), memberships as (
 select pg_get_userbyid(m.roleid)||':'||pg_get_userbyid(m.member) identity,pg_get_userbyid(m.grantor) grantor,m.admin_option from pg_auth_members m
), events as (
 select e.evtname identity,e.evtevent event,e.evtenabled::text enabled,pg_get_userbyid(e.evtowner) owner,e.evtfoid::regprocedure::text handler,to_jsonb(e.evttags) tags from pg_event_trigger e
)
select jsonb_build_object('schema','operations-compatible-atomic-install-snapshot.v1',
 'functions',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from funcs x),
 'schemas',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from schemas x),
 'relations',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from relations x),
 'indices',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from indices x),
 'constraints',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from constraints x),
 'types',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from types x),
 'triggers',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from triggers x),
 'policies',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from policies x),
 'roles',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from roles x),
 'memberships',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from memberships x),
 'events',(select coalesce(jsonb_agg(to_jsonb(x) order by identity collate "C"),'[]'::jsonb) from events x));
""".replace('SCOPE',scope_sql)
    return sql if statement_only else 'begin isolation level repeatable read read only;\n'+sql+'commit;\n'

def indexed(rows):
    if not isinstance(rows,list) or len(rows)>4096: raise ClosedFailure('capture')
    result={}
    for item in rows:
        if not isinstance(item,dict) or not isinstance(item.get('identity'),str) or item['identity'] in result: raise ClosedFailure('capture')
        result[item['identity']]=item
    return result

def verify_delta(before,after,source,namespace,new_roles,public_roles,old_cores):
    if set(before)!=SNAPSHOT_KEYS|{'business'} or set(after)!=set(before):raise ClosedFailure('delta')
    for key in before:
        if key not in {'functions','schemas'} and before[key]!=after[key]: raise ClosedFailure('delta')
    specs=function_specs(source);old=indexed(before['functions']);new=indexed(after['functions'])
    additions=set(specs)-set(old)
    if set(new)-set(old)!=additions or set(old)-set(new): raise ClosedFailure('delta')
    allowed=set(specs)|set(old_cores)
    for key,item in old.items():
        if key not in allowed and item!=new[key]: raise ClosedFailure('delta')
    for key,spec in specs.items():
        item=new[key]
        if item['owner']!='postgres' or any(item[k]!=v for k,v in spec.items()): raise ClosedFailure('delta')
        role=new_roles.get(key) if key in additions else public_roles.get(key)
        if item['client_execute']!={c:c==role for c in CLIENTS}: raise ClosedFailure('delta')
        if key in old:
            permitted={'body_sha256','config','acl','client_execute'}
            if any(old[key][k]!=item[k] for k in old[key] if k not in permitted): raise ClosedFailure('delta')
    for key in old_cores:
        item=new[key]
        if any(old[key][k]!=item[k] for k in old[key] if k not in {'acl','client_execute'}): raise ClosedFailure('delta')
        if any(item['client_execute'].values()): raise ClosedFailure('delta')
    old_schema=indexed(before['schemas']);new_schema=indexed(after['schemas'])
    if namespace:
        if set(new_schema)-set(old_schema)!={namespace} or set(old_schema)-set(new_schema): raise ClosedFailure('delta')
        item=new_schema[namespace]
        if item['owner']!='postgres' or item['client_usage']!={'anon':False,'authenticated':True,'service_role':True} or any(item['client_create'].values()): raise ClosedFailure('delta')
    elif set(new_schema)!=set(old_schema): raise ClosedFailure('delta')
    if any(new_schema[key]!=item for key,item in old_schema.items()): raise ClosedFailure('delta')

def run_native(env):
    validate_environment(env);ddl=closure_paths();shared=shared_module()
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-install-',dir='/tmp'));private.chmod(0o700);retain=True
    psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
    pg_env=dict(env,PGCONNECT_TIMEOUT='5',LC_ALL='C');serial=0
    def call(phase,sql,expected=None):
        nonlocal serial
        serial+=1;directory=private/(str(serial)+'-'+phase);directory.mkdir(mode=0o700)
        try: out=shared.run_private('authority_sql',psql,pg_env,ROOT,directory,90,sql.encode())
        except shared.ClosedFailure as error:
            if expected:
                err=directory/'authority_sql.stderr'
                if err.stat().st_size<=LIMIT and error.code=='P0001' and re.search(r'^ERROR:\s+P0001: '+re.escape(expected)+r'$',err.read_text(),re.M):return None
            raise ClosedFailure(phase,error.code) from None
        if expected: raise ClosedFailure(phase)
        return out
    def capture():
        table_query="select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\"),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind in ('r','p');"
        names=call('capture',options()+'begin isolation level repeatable read read only;\n'+table_query+'\ncommit;')
        tables=load_json(names,'capture')
        if not isinstance(tables,list) or not tables or len(tables)>256 or len(tables)!=len(set(tables)) or any(not isinstance(name,str) or not re.fullmatch(r'(?:public|auth)\.[a-z_][a-z0-9_]*',name) for name in tables):raise ClosedFailure('capture')
        statements=[]
        for name in tables:
            schema,table=name.split('.')
            statements.append("select jsonb_build_object('identity',"+sql_string(name)+",'count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate \"C\"),'[]'::jsonb)::text,'UTF8')),'hex')) from \""+schema+'"."'+table+'" t')
        # Exact names are rechecked before metadata and every row hash in one RR snapshot.
        raw=call('capture',options()+'begin isolation level repeatable read read only;\n'+table_query+'\n'+snapshot_sql(True)+';\n'.join(statements)+';\ncommit;').read_text().splitlines()
        if len(raw)!=2+len(tables) or json.loads(raw[0])!=tables:raise ClosedFailure('capture')
        value=json.loads(raw[1]);rows=[json.loads(line) for line in raw[2:]]
        if not isinstance(value,dict) or set(value)!=SNAPSHOT_KEYS or value.get('schema')!='operations-compatible-atomic-install-snapshot.v1':raise ClosedFailure('capture')
        for key in value:
            if key!='schema': indexed(value[key])
        if [x.get('identity') for x in rows]!=tables or any(set(x)!={'identity','count','sha256'} or type(x.get('count')) is not int or not 0<=x['count']<=10000 or not isinstance(x.get('sha256'),str) or not re.fullmatch(r'[0-9a-f]{64}',x['sha256']) for x in rows):raise ClosedFailure('capture')
        value['business']=rows;return value
    try:
        fresh="set statement_timeout='10s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and current_setting('client_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f'));"
        if call('fresh_database',fresh).read_text().splitlines()!=['t']:raise ClosedFailure('fresh_database')
        call('schema',options()+'\n'.join(path.read_text() for path in ddl))
        call('setup',options()+(HERE/'operations-compatible-install-native-setup.sql').read_text())
        first=(ROOT/FIRST).read_text();six=(ROOT/SIX).read_text();base=capture()
        if len(function_specs(first))!=7 or len(function_specs(six))!=19:raise ClosedFailure('delta')
        call('failure_first',options('first_two')+'begin;\n'+first+'\ncommit;','atomic_install_fault_130228')
        if capture()!=base:raise ClosedFailure('failure_first')
        call('success_first',options()+'begin;\n'+first+'\ncommit;');after_first=capture()
        first_specs=function_specs(first);new_first=set(first_specs)-set(indexed(base['functions']))
        if len(new_first)!=5:raise ClosedFailure('delta')
        first_roles={key:('service_role' if '.read_scope_invoice_kernel_compatible_v1(' in key else 'authenticated' if '.read_scope_invoice_capture_admin_compatible_v1(' in key else None) for key in new_first}
        first_public={'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)':'service_role','public.read_operations_scope_invoice_capture_admin_v1(jsonb)':'authenticated'}
        first_cores={'operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)'}
        verify_delta(base,after_first,first,None,first_roles,first_public,first_cores)
        call('failure_six',options('remaining_six')+six,'atomic_install_fault_145349')
        if capture()!=after_first:raise ClosedFailure('failure_six')
        call('success_six',options()+six);final=capture()
        specs=function_specs(six);additions=set(specs)-set(indexed(after_first['functions']))
        if len(additions)!=13:raise ClosedFailure('delta')
        six_roles={key:('authenticated' if any('.'+name+'(' in key for name in ('parent_entry_v1','drilldown_entry_v1')) else 'service_role' if any('.'+name+'(' in key for name in ('composition_entry_v1','kernel_entry_v1','original_entry_v1','policy_entry_v1')) else None) for key in additions}
        six_public={key:('authenticated' if any('.'+name+'(' in key for name in ('read_operations_scope_obligation_evidence_v1','read_operations_scope_obligation_drilldown_v1')) else 'service_role') for key in specs if key.startswith('public.')}
        old_cores={'operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid)','operations_economy_private.read_scope_obligation_drilldown_v1(jsonb)','operations_economy_private.read_scope_composition_v1(uuid,uuid)','operations_economy_private.read_invoice_obligation_kernel_v1(jsonb)','operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text)','operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text)'}
        verify_delta(after_first,final,six,'operations_remaining_reader_private',six_roles,six_public,old_cores)
        retain=False
    finally:
        if not retain:
            try:shutil.rmtree(private)
            except Exception:raise ClosedFailure('cleanup') from None
    return ['operations-compatible-install-native PASS exact130_external_tx_late_ddl_rollback_full_baseline',
      'operations-compatible-install-native PASS exact145_own_tx_late_ddl_rollback_full_committed130_baseline',
      'operations-compatible-install-native PASS exact_success_deltas_no_business_gate_changes_no_hosted_install']

def main(env=None):
    try:
        for line in run_native(dict(os.environ if env is None else env)):print(line)
        return 0
    except ClosedFailure as error:
        print('operations-compatible-install-native FAIL '+error.phase+' SQLSTATE='+error.code);return 1
    except Exception:
        print('operations-compatible-install-native FAIL guard SQLSTATE=unclassified');return 1

if __name__=='__main__':sys.exit(main())
