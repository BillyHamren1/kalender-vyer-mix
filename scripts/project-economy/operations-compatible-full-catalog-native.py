#!/usr/bin/env python3
"""Fresh complete finite metadata inventory; never a hosted certificate."""
import hashlib,importlib.util,json,os,pathlib,re,shutil,sys,tempfile
ROOT=pathlib.Path(__file__).resolve().parent.parent.parent
PREFIX='scripts/project-economy/operations-compatible-full-catalog-'
ATOMIC='scripts/project-economy/operations-compatible-install-native-closure.json'
ATOMIC_SHA='caf53d0527d3576df6287fba79e1b6161c34cc7a095f656a37a8d83507987ed1'
RUNNER='scripts/project-economy/operations-compatible-install-native.py'
RUNNER_SHA='412c00cdd54a772137fe23d85400fcd4c4cf6b3c9709acc78764921b9e318461'
DATABASE='operations_compatible_install_runtime'
PHASES={'guard','closure','fresh','schema','setup','capture','first','six','negative','restore','cleanup'}
CODES={'unclassified','22023','42501','42P01','42710','42723','55000','P0001','55P03','57014','40P01','25P02'}
OWNED={PREFIX+x for x in ('read.sql','setup.sql','negativecases.sql','native.py','native.guard.test.py','verify.py','verify.test.py')}|{'docs/project-economy/operations-compatible-full-catalog-native-contract.md'}
CASES=('same_count_range_semantics','same_count_sql_standard_body','same_count_index_replica_identity','same_count_column_storage','same_count_domain_not_null','same_count_procedure_body','same_count_view_definition','same_count_owner','same_count_config','same_count_security','old_core_public_bypass','old_core_inherited_bypass','same_count_schema_usage','same_count_extension_membership','unknown_outside_namespace','default_acl_drift')

class ClosedFailure(Exception):
    def __init__(self,phase,code='unclassified'):
        self.phase=phase if type(phase) is str and phase in PHASES else 'guard';self.code=code if type(code) is str and code in CODES else 'unclassified';super().__init__('closed_full_catalog_failure')

def module(path,name):
    spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value

def validate_environment(env):
    fixed={'CI':'true','EVENTFLOW_COMPATIBLE_FULL_CATALOG_ISOLATED_DB':'true','PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE,'PYTHONDONTWRITEBYTECODE':'1','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix'}
    if any(env.get(k)!=v for k,v in fixed.items()) or not re.fullmatch(r'[1-9][0-9]*',env.get('GITHUB_RUN_ID','')):raise ClosedFailure('guard')
    for key,value in env.items():
        if not value:continue
        if (key.startswith('PG') and key not in {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}) or key.lower().endswith('_proxy') or key.startswith(('LD_','DYLD_','BASH_FUNC_')) or key in {'BASH_ENV','ENV','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP','PYTHONINSPECT','NODE_OPTIONS','GCONV_PATH','LOCPATH','OPENSSL_CONF','OPENSSL_MODULES'}:raise ClosedFailure('guard')

def load_source(root=ROOT):
    try:
        p=root/ATOMIC
        if p.resolve()!=p or hashlib.sha256(p.read_bytes()).hexdigest()!=ATOMIC_SHA:raise ValueError()
        old=json.loads(p.read_text());p=root/(PREFIX+'native-closure.json')
        if p.resolve()!=p or p.stat().st_size>1024*1024:raise ValueError()
        new=json.loads(p.read_text())
        if set(new)!={'schema','database','baseline_schema_paths','install_paths','files'} or new['schema']!='operations-compatible-full-catalog-closure.v1' or new['database']!=DATABASE or new['baseline_schema_paths']!=old['baseline_schema_paths'] or new['install_paths']!=old['install_paths'] or len(old['baseline_schema_paths'])!=24 or len(old['files'])!=92 or set(new['files'])!=set(old['files'])|OWNED|{ATOMIC}:raise ValueError()
        for rel,sha in new['files'].items():
            p=root/rel
            if type(rel) is not str or not re.fullmatch(r'[A-Za-z0-9_./-]+',rel) or '..' in pathlib.PurePosixPath(rel).parts or p.resolve()!=p or not p.is_file() or p.stat().st_size>32*1024*1024 or type(sha) is not str or not re.fullmatch(r'[0-9a-f]{64}',sha) or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise ValueError()
            if rel in old['files'] and sha!=old['files'][rel]:raise ValueError()
        if new['files'][RUNNER]!=RUNNER_SHA:raise ValueError()
        return new
    except Exception:raise ClosedFailure('closure') from None

def options():
    return "set standard_conforming_strings=on;set statement_timeout='45s';set lock_timeout='10s';set idle_in_transaction_session_timeout='50s';set eventflow.compatible_install_isolated='synthetic-disposable';set eventflow.compatible_install_fault_target='none';set eventflow.compatible_full_catalog_isolated='synthetic-disposable';\n"

def run_native(env):
    validate_environment(env);closure=load_source();atomic=module(ROOT/RUNNER,'full_catalog_frozen_atomic');shared=atomic.shared_module();v=module(ROOT/(PREFIX+'verify.py'),'full_catalog_verifier')
    private=pathlib.Path(tempfile.mkdtemp(prefix='operations-compatible-full-catalog-',dir='/tmp'));private.chmod(0o700);retain=True;serial=0
    pg_env=dict(env,PGCONNECT_TIMEOUT='5',LC_ALL='C');psql=['psql','-X','--no-password','--set','ON_ERROR_STOP=1','--set','VERBOSITY=verbose','-Atq']
    def call(phase,sql):
        nonlocal serial
        serial+=1;where=private/(str(serial)+'-'+phase);where.mkdir(mode=0o700)
        try:return shared.run_private('authority_sql',psql,pg_env,ROOT,where,90,sql.encode())
        except Exception as error:
            code=error.code if type(error) is shared.ClosedFailure else 'unclassified'
            raise ClosedFailure(phase,code) from None
    read=(ROOT/(PREFIX+'read.sql')).read_text()
    def capture_sql(tables,mutation=''):
        statements=["select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\"),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and c.relkind in ('r','p');",read]
        for name in tables:
            schema,table=name.split('.')
            statements.append("select jsonb_build_object('identity',"+atomic.sql_string(name)+",'count',count(*),'sha256',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text collate \"C\"),'[]'::jsonb)::text,'UTF8')),'hex')) from \""+schema+'"."'+table+'" t;')
        return options()+('begin isolation level repeatable read;\n'+mutation+'\n' if mutation else 'begin isolation level repeatable read read only;\n')+'\n'.join(statements)+('\nrollback;' if mutation else '\ncommit;')
    table_sql="select coalesce(jsonb_agg(n.nspname||'.'||c.relname order by n.nspname collate \"C\",c.relname collate \"C\"),'[]'::jsonb) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_(toast|temp)' and c.relkind in ('r','p');"
    def capture(mutation=''):
        path=call('negative' if mutation else 'capture',capture_sql(tables,mutation))
        if path.stat().st_size>v.LIMIT:raise ClosedFailure('capture')
        lines=path.read_text().splitlines()
        if len(lines)!=len(tables)+2 or json.loads(lines[0])!=tables:raise ClosedFailure('capture')
        metadata=v.parse(lines[1]);business=[json.loads(x) for x in lines[2:]]
        if [r.get('identity') for r in business]!=tables or any(set(r)!={'identity','count','sha256'} or type(r['count']) is not int or not 0<=r['count']<=10000 or type(r['sha256']) is not str or not re.fullmatch(r'[0-9a-f]{64}',r['sha256']) for r in business):raise ClosedFailure('capture')
        return metadata,business
    try:
        fresh="set statement_timeout='10s';select current_database()='"+DATABASE+"' and current_user='postgres' and session_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') and not exists(select 1 from pg_roles where rolname<>'postgres' and rolname !~ '^pg_') and not exists(select 1 from pg_extension where extname<>'plpgsql') and not exists(select 1 from pg_event_trigger);"
        if call('fresh',fresh).read_text().splitlines()!=['t']:raise ClosedFailure('fresh')
        for rel in closure['baseline_schema_paths']:call('schema',(ROOT/rel).read_text())
        call('setup',options()+(ROOT/'scripts/project-economy/operations-compatible-install-native-setup.sql').read_text())
        call('setup',options()+(ROOT/(PREFIX+'setup.sql')).read_text())
        names=call('capture',options()+'begin isolation level repeatable read read only;'+table_sql+'commit;').read_text().splitlines()
        if len(names)!=1:raise ClosedFailure('capture')
        tables=json.loads(names[0])
        if type(tables) is not list or not tables or len(tables)>256 or len(set(tables))!=len(tables) or any(type(x) is not str or not re.fullmatch(r'[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*',x) for x in tables):raise ClosedFailure('capture')
        before,business=capture()
        baseline_sources=[(ROOT/path).read_text() for path in closure['baseline_schema_paths']]+[(ROOT/'scripts/project-economy/operations-compatible-install-native-setup.sql').read_text(),(ROOT/(PREFIX+'setup.sql')).read_text()]
        provenance=v.known_source_provenance(before,v.source_bodies(baseline_sources))
        first=(ROOT/closure['install_paths'][0]).read_text();call('first',options()+'begin;'+first+'commit;');after_first,b=capture();v.unchanged(business,b)
        specs=atomic.function_specs(first);roles={k:('service_role' if 'read_scope_invoice_kernel_compatible_v1(' in k else 'authenticated' if 'read_scope_invoice_capture_admin_compatible_v1(' in k else None) for k in specs}
        roles.update({'public.read_operations_scope_invoice_kernel_evidence_v1(jsonb)':'service_role','public.read_operations_scope_invoice_capture_admin_v1(jsonb)':'authenticated'})
        v.allowed_install(before,after_first,specs,None,{'operations_economy_private.read_scope_invoice_kernel_v1(jsonb)','operations_economy_private.read_scope_invoice_capture_admin_v1(jsonb)'},roles,v.source_attributes(first))
        six=(ROOT/closure['install_paths'][1]).read_text();call('six',options()+six);final,b=capture();v.unchanged(business,b)
        specs=atomic.function_specs(six);roles={k:('authenticated' if any('.'+name+'(' in k for name in ('parent_entry_v1','drilldown_entry_v1','read_operations_scope_obligation_evidence_v1','read_operations_scope_obligation_drilldown_v1')) else 'service_role' if any('.'+name+'(' in k for name in ('composition_entry_v1','kernel_entry_v1','original_entry_v1','policy_entry_v1')) or k.startswith('public.') else None) for k in specs}
        cores={'operations_economy_private.read_scope_obligation_evidence_v1(uuid,text,uuid)','operations_economy_private.read_scope_obligation_drilldown_v1(jsonb)','operations_economy_private.read_scope_composition_v1(uuid,uuid)','operations_economy_private.read_invoice_obligation_kernel_v1(jsonb)','operations_economy_private.read_obligation_original_v1(uuid,uuid,uuid,text)','operations_economy_private.read_source_policy_v1(uuid,uuid,uuid,text)'}
        v.allowed_install(after_first,final,specs,'operations_remaining_reader_private',cores,roles,v.source_attributes(six))
        paths=call('negative',options()+(ROOT/(PREFIX+'negativecases.sql')).read_text()).read_text().splitlines()
        if len(paths)!=1:raise ClosedFailure('negative')
        cases=json.loads(paths[0])
        if type(cases) is not list or tuple(r.get('label') for r in cases)!=CASES:raise ClosedFailure('negative')
        for case in cases:
            if set(case)!={'label','mutation','section','identity','field'} or type(case['mutation']) is not str:raise ClosedFailure('negative')
            changed,rows=capture(case['mutation']);v.unchanged(business,rows)
            if case['label'] in {'unknown_outside_namespace','default_acl_drift'}:
                a=v.indexed(final[case['section']]);b=v.indexed(changed[case['section']])
                if set(b)-set(a)!={case['identity']} or set(a)-set(b):raise ClosedFailure('negative')
            else:v.changed(final,changed,case['section'],case['identity'],case['field'])
            if case['label']=='same_count_view_definition' and final['dependencies']==changed['dependencies']:raise ClosedFailure('negative')
            if case['label']=='same_count_sql_standard_body' and (final['dependencies']!=changed['dependencies'] or v.indexed(final['functions'])[case['identity']]['body_sha256']!=v.indexed(changed['functions'])[case['identity']]['body_sha256']):raise ClosedFailure('negative')
            restored,rows=capture();v.unchanged(final,restored);v.unchanged(business,rows)
        inventory={key:len(final[key]) for key in v.SECTIONS}
        fingerprint=v.digest(final)
        retain=False
    finally:
        if not retain:
            try:shutil.rmtree(private)
            except Exception:raise ClosedFailure('cleanup') from None
    return ['operations-compatible-full-catalog-native INVENTORY sections='+str(len(inventory))+' routines='+str(inventory['functions'])+' roles='+str(inventory['roles'])+' known_source_bodies='+str(provenance['verified_source_bodies'])+' unresolved_bodies='+str(provenance['unresolved_installed_bodies'])+' sha256='+fingerprint,
            'operations-compatible-full-catalog-native PASS complete_finite_inventory_exact24_and_target2',
            'operations-compatible-full-catalog-native PASS rollback16_same_count_drift_effective_capabilities_restored',
            'operations-compatible-full-catalog-native PASS cleanup_no_hosted_provider_certificate_source_admission']

def main(env=None):
    try:
        for line in run_native(dict(os.environ if env is None else env)):print(line)
        return 0
    except Exception as error:
        if type(error) is ClosedFailure:
            phase=error.phase if type(error.phase) is str and error.phase in PHASES else 'guard'
            code=error.code if type(error.code) is str and error.code in CODES else 'unclassified'
        else:phase='guard';code='unclassified'
        print('operations-compatible-full-catalog-native FAIL '+phase+' SQLSTATE='+code);return 1

if __name__=='__main__':sys.exit(main())
