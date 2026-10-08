#!/usr/bin/env python3
"""TEST ONLY genuine PG15/PostgREST product publisher; closed public protocol."""
import base64
import hashlib
import hmac
import http.client
import importlib.util
import json
import os
import pathlib
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).absolute().parent
ROOT = HERE.parent.parent
DATABASE = 'eventflow_scope_product_publication_runtime'
COMMIT = 'd8265818c9a8012539657460a377993dacdce8e6'
SQLSTATES = {'22023','23505','23503','23514','42501','40001','55000','55P03',
             '57014','22003','22P02','42883','42P01','42703','40P01','25P02','PT409'}
PHASES = {'guard','closure','fresh','schema','fixture','role','parity','setup',
          'docker','ready','case','cleanup','proof',*("case_"+str(i) for i in range(8))}
FIXED = {'CI':'true','GITHUB_REPOSITORY':'BillyHamren1/kalender-vyer-mix',
         'EVENTFLOW_WHOLE_SCOPE_PRODUCT_PUBLICATION_ISOLATED_DB':'true',
         'PGHOST':'127.0.0.1','PGPORT':'5432','PGUSER':'postgres','PGDATABASE':DATABASE}
SOURCE_PATHS = ('scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-hired-personnel-native.py', 'scripts/project-economy/operations-invoice-kernel-vector-test.ts', 'scripts/project-economy/operations-invoice-obligation-kernel-postgres-test.sql', 'scripts/project-economy/operations-obligation-fixture.ts', 'scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'scripts/project-economy/operations-scope-invoice-kernel-postgres-test.sql', 'scripts/project-economy/operations-scope-invoice-kernel-vector-test.ts', 'scripts/project-economy/operations-transport-seed.sql', 'scripts/project-economy/operations-whole-scope-product-publication-postgres-test.sql', 'scripts/project-economy/operations-whole-scope-product-publication-vector-test.ts', 'scripts/project-economy/operations-whole-scope-projection-native.py', 'scripts/project-economy/project-evidence-http-runtime/schema-closure.json', 'scripts/project-economy/whole-scope-projection-parity-pglite.mjs', 'scripts/project-economy/whole-scope-projection-parity-vectors.ts', 'scripts/project-economy/whole-scope-projection-sql-prototype.sql', 'scripts/project-economy/whole-scope-publication-transaction-native-setup.sql', 'scripts/project-economy/whole-scope-reader-permission-native-setup.sql', 'supabase/functions/_shared/finance-project-invoice-destination.ts', 'supabase/functions/_shared/finance-project-invoice.ts', 'supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts', 'supabase/functions/_shared/project-cost-obligation-authority.ts', 'supabase/functions/_shared/project-cost-obligations.ts', 'supabase/functions/_shared/project-operational-eac.ts', 'supabase/functions/_shared/project-scope-invoice-kernel-evidence.ts', 'supabase/functions/_shared/whole-scope-product-source-proof.ts', 'supabase/migrations/20260925103906_4b61bf34-4afa-4e77-9eed-933e2872da1f.sql', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql', 'supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql', 'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql', 'supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql')
SCHEMA_PATHS = ('scripts/project-economy/operations-postgres-bootstrap.sql', 'scripts/project-economy/operations-project-review-bootstrap.sql', 'scripts/project-economy/operations-catering-bootstrap.sql', 'scripts/project-economy/operations-scope-bootstrap.sql', 'supabase/migrations/20261001220652_operations_personnel_cost_evidence.sql', 'supabase/migrations/20261001225724_operations_personnel_cost_outbox.sql', 'supabase/migrations/20261001232438_operations_personnel_project_reviews.sql', 'supabase/migrations/20261001233744_operations_finance_project_invoice_destination.sql', 'supabase/migrations/20261001235558_operations_catering_project_evidence.sql', 'supabase/migrations/20261002001842_operations_project_cost_read.sql', 'supabase/migrations/20261002014937_operations_project_scope_enrollment.sql', 'supabase/migrations/20261002023731_operations_project_obligation_authority.sql', 'supabase/migrations/20261002023809_operations_project_cost_native_read_v2.sql', 'supabase/migrations/20261002024700_operations_finance_credit_v2_receiver.sql', 'supabase/migrations/20261002025617_operations_obligation_source_policy.sql', 'supabase/migrations/20261002030747_operations_scope_obligation_composition.sql', 'supabase/migrations/20261002032702_operations_invoice_economic_source_barriers.sql', 'supabase/migrations/20261002035730_operations_catering_project_read_v3.sql', 'supabase/migrations/20261002042934_operations_scope_obligation_evidence_read_v1.sql', 'supabase/migrations/20261002044751_operations_invoice_obligation_kernel_read.sql', 'supabase/migrations/20261002052436_operations_scope_invoice_kernel_capture.sql', 'supabase/migrations/20261002054010_operations_scope_obligation_drilldown_read_v1.sql', 'scripts/project-economy/operations-transport-seed.sql')
OWNED_PATHS = ('scripts/project-economy/operations-whole-scope-product-publication-native-bootstrap.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native-cases-setup.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native-cases.py', 'scripts/project-economy/operations-whole-scope-product-publication-native-setup.sql', 'scripts/project-economy/operations-whole-scope-product-publication-native.guard-test.py', 'scripts/project-economy/operations-whole-scope-product-publication-native.py')
SHARED = 'operations-hired-personnel-native.py'
SHARED_SHA = 'cf09748e2796085ffde8577efda560df1aaa70e02bafce239982cde09ffbcd76'
PROLOGUE = "set standard_conforming_strings=on;set statement_timeout='25s';set lock_timeout='15s';set idle_in_transaction_session_timeout='25s';set eventflow.whole_scope_product_publication_isolated='synthetic-disposable';\n"


class Failure(Exception):
    def __init__(self, phase, code='unclassified', retain=False):
        self.phase = phase if phase in PHASES else 'guard'
        self.code = code if code in SQLSTATES else 'unclassified'
        self.retain = retain
        super().__init__('closed_product_native_failure')


def guard(env):
    if any(env.get(k) != v for k,v in FIXED.items()) or not re.fullmatch(r'[0-9]{1,20}',env.get('GITHUB_RUN_ID','')):
        raise Failure('guard')
    allowed_pg = {'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD'}
    for key,value in env.items():
        if not value:
            continue
        if (key.startswith('PG') and key not in allowed_pg) or key.startswith(('PGRST_','SUPABASE_','COMPOSE_','DOCKER_')):
            raise Failure('guard')
        if key.upper() in {'HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','DATABASE_URL','DB_URL','TMPDIR','TMP','TEMP','NODE_OPTIONS','PYTHONPATH','PYTHONHOME','PYTHONSTARTUP'}:
            raise Failure('guard')
        if key.startswith(('LD_','DYLD_','BASH_FUNC_')) or key in {'BASH_ENV','ENV','SHELLOPTS','BASHOPTS','PS4','PYTHONINSPECT'}:raise Failure('guard')
        if key.startswith('DENO_') or (key.startswith('EVENTFLOW_WHOLE_SCOPE_PRODUCT_') and key != 'EVENTFLOW_WHOLE_SCOPE_PRODUCT_PUBLICATION_ISOLATED_DB'):
            raise Failure('guard')
    if not isinstance(env.get('PGPASSWORD'),str) or not re.fullmatch(r'[A-Za-z0-9_\-]{16,128}',env['PGPASSWORD']):
        raise Failure('guard')
    return 'scope-product-' + env['GITHUB_RUN_ID']


def load(path):
    spec=importlib.util.spec_from_file_location('scope_product_'+path.stem.replace('-','_'),path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


def closure():
    path=HERE/'operations-whole-scope-product-publication-native-closure.json'
    try:
        if ROOT.resolve()!=ROOT or path.resolve()!=path or not path.is_file():
            raise ValueError()
        value=json.loads(path.read_text())
        if set(value)!={'schema','database','commit','ordered_schema_paths','files','owned_paths','provenance'} or value['schema']!='operations-whole-scope-product-publication-native-closure.v1' or value['database']!=DATABASE or value['commit']!=COMMIT:
            raise ValueError()
        if not isinstance(value['files'],dict) or tuple(sorted(value['files']))!=SOURCE_PATHS or not isinstance(value['owned_paths'],dict) or tuple(sorted(value['owned_paths']))!=OWNED_PATHS or set(value['files']) & set(value['owned_paths']):
            raise ValueError()
        for relative,expected in (value['files']|value['owned_paths']).items():
            p=ROOT/relative
            if not isinstance(relative,str) or relative.startswith('/') or '..' in pathlib.PurePosixPath(relative).parts or p.resolve()!=p or not p.is_file():
                raise ValueError()
            data=p.read_bytes()
            if not isinstance(expected,dict) or set(expected)!={'sha256','git_blob','size'} or expected['size']!=len(data) or hashlib.sha256(data).hexdigest()!=expected['sha256']:
                raise ValueError()
            blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            if expected['git_blob'] is not None and blob!=expected['git_blob']:
                raise ValueError()
        ddl=value['ordered_schema_paths']
        if not isinstance(ddl,list) or tuple(ddl)!=SCHEMA_PATHS or len(set(ddl))!=23 or not all(p in value['files'] for p in ddl):
            raise ValueError()
        shared=HERE/SHARED
        if hashlib.sha256(shared.read_bytes()).hexdigest()!=SHARED_SHA:
            raise ValueError()
        original=(ROOT/'supabase/migrations/20260925103906_4b61bf34-4afa-4e77-9eed-933e2872da1f.sql').read_text()
        extracted=original[original.index('CREATE OR REPLACE FUNCTION'):original.index('GRANT EXECUTE')].strip()
        bootstrap=(HERE/'operations-whole-scope-product-publication-native-bootstrap.sql').read_text()
        actual=bootstrap[bootstrap.index('CREATE OR REPLACE FUNCTION'):bootstrap.index('revoke all on function public.link_booking_to_large_project')].strip()
        if actual!=extracted:raise ValueError()
        return value,load(shared)
    except (ValueError,TypeError,KeyError,OSError,ImportError):
        raise Failure('closure') from None


class Native:
    def __init__(self,env,private,shared):
        self.env=dict(env);self.env['PGCONNECT_TIMEOUT']='5'
        self.private=private;self.shared=shared;self.counter=0;self.children={}
        self.psql=['psql','-X','--no-password','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq']
        self.jwt=None

    def start_process(self,command,stdin=b'',name=None):
        self.counter+=1;stem=str(self.counter)
        out=self.private/(stem+'.out');err=self.private/(stem+'.err');input_path=self.private/(stem+'.in')
        if not isinstance(stdin,bytes) or len(stdin)>8*1024*1024:raise Failure('case')
        fd=os.open(input_path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(fd,'wb') as source:source.write(stdin)
        for p in (out,err):
            fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600);os.close(fd)
        with input_path.open('rb') as source,out.open('wb') as stdout,err.open('wb') as stderr:
            child=subprocess.Popen(command,cwd=ROOT,env=self.env,stdin=source,
                stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=self.shared.restrict_child)
        self.children[child]=(out,err,time.monotonic(),name)
        return child

    def terminate(self,child):
        if child not in self.children:
            raise Failure('cleanup',retain=True)
        group=child.pid
        # While the leader is unreaped, PID reuse cannot transfer this session.
        # Validate kernel session/group immediately before each group signal.
        def group_signal(sig):
            if child.poll() is None:
                try:
                    if os.getpgid(group)!=group or os.getsid(group)!=group:
                        raise Failure('cleanup',retain=True)
                    os.killpg(group,sig)
                except ProcessLookupError:
                    pass
            self.shared.signal_owned_members(group,sig)
        group_signal(signal.SIGTERM)
        try:child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            group_signal(signal.SIGKILL)
            try:child.wait(timeout=3)
            except subprocess.TimeoutExpired:raise Failure('cleanup',retain=True) from None
        # Reap the actual owned leader BEFORE group terminal-state observation.
        # Its virtualized /proc row may otherwise refer to unrelated host data.
        deadline=time.monotonic()+5
        while self.shared.live_owned_group(group):
            if time.monotonic()>=deadline:raise Failure('cleanup',retain=True)
            self.shared.signal_owned_members(group,signal.SIGKILL)
            time.sleep(.02)

    def finish(self,child,expected_code=None,timeout=35):
        if child not in self.children:
            raise Failure('case')
        out,err,started,_name=self.children[child]
        try:
            child.wait(timeout=max(.1,timeout-(time.monotonic()-started)))
            code=self.shared.sqlstate(err)
            if expected_code is None:
                if child.returncode!=0:
                    raise Failure('case',code)
            elif child.returncode==0 or code!=expected_code:
                raise Failure('case',code)
            if out.stat().st_size>8*1024*1024 or err.stat().st_size>8*1024*1024:
                raise Failure('case')
            return out
        except subprocess.TimeoutExpired:
            raise Failure('case') from None
        finally:
            try:self.terminate(child)
            except Exception:raise Failure('cleanup',retain=True) from None
            self.children.pop(child,None)

    def process(self,command,stdin=b'',timeout=90):
        child=self.start_process(command,stdin)
        return self.finish(child,timeout=timeout)

    def sql_file(self,sql):
        return self.process(self.psql,(PROLOGUE+sql).encode())

    def run(self,sql,expected_code=None):
        child=self.start_process(self.psql,(PROLOGUE+sql).encode())
        out=self.finish(child,expected_code)
        if expected_code is not None:return None
        lines=out.read_text().splitlines()
        if len(lines)==1 and lines[0].startswith('{'):
            return json.loads(lines[0])
        return None

    def start(self,name,sql):
        if not re.fullmatch(r'scope_product_[a-z_]{1,40}',name):raise Failure('case')
        return self.start_process(self.psql,(PROLOGUE+"set application_name='"+name+"';"+sql).encode(),name)

    def wait(self,name,kind):
        owned=[p for p,v in self.children.items() if v[3]==name and p.poll() is None]
        if len(owned)!=1 or kind not in {'PgSleep','Lock'}:raise Failure('case')
        end=time.monotonic()+4
        while time.monotonic()<end:
            value=self.run("select jsonb_build_object('waiting',count(*)=1) from pg_stat_activity where datname='"+DATABASE+"' and application_name='"+name+"' and state='active' and "+("wait_event='PgSleep'" if kind=='PgSleep' else "wait_event_type='Lock'")+";")
            if value=={'waiting':True}:return
            if owned[0].poll() is not None:break
            time.sleep(.08)
        raise Failure('case')

    def http(self,command,status,timeout_seconds=15):
        request=urllib.request.Request('http://127.0.0.1:55650/rpc/publish_operations_whole_scope_product_v1',
            data=json.dumps({'p_command':command},ensure_ascii=False,allow_nan=False).encode(),
            headers={'Authorization':'Bearer '+self.jwt,'Content-Type':'application/json'},method='POST')
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self,*_args,**_kwargs):return None
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
        deadline=time.monotonic()+timeout_seconds
        try:response=opener.open(request,timeout=timeout_seconds)
        except urllib.error.HTTPError as e:response=e
        with response:
            if response.status!=status:raise Failure('case')
            body=response.fp if isinstance(response,urllib.error.HTTPError) else response
            if not isinstance(body,http.client.HTTPResponse):raise Failure('case')
            chunks=[];size=0
            for _ in range(256):
                if time.monotonic()>=deadline:raise Failure('case')
                if body.fp is None:break
                sock=body.fp.raw._sock
                sock.settimeout(max(.01,deadline-time.monotonic()))
                chunk=body.read1(1024)
                if not chunk:break
                chunks.append(chunk);size+=len(chunk)
                if size>16384:raise Failure('case')
            else:raise Failure('case')
        value=json.loads(b''.join(chunks).decode('utf-8','strict'))
        if not isinstance(value,dict):raise Failure('case')
        return value

    def cleanup(self):
        failed=False
        for child in list(self.children):
            try:self.terminate(child)
            except Exception:failed=True
        if failed:raise Failure('cleanup',retain=True)


class OwnedDocker:
    """Fresh per-attempt entropy, immutable object IDs, explicit local socket."""
    def __init__(self,native,namespace):
        self.native=native;self.namespace=namespace
        self.owner=secrets.token_hex(32);self.identifier=None;self.attempted=False

    def call(self,args,timeout=20):
        return self.native.process(['docker','--host','unix:///var/run/docker.sock',*args],timeout=timeout)

    def inspect(self):
        output=self.call(['inspect','--format','{{.Id}}|{{.Name}}|{{index .Config.Labels "eventflow.scope-product-owner"}}',self.namespace])
        lines=output.read_text().splitlines()
        if len(lines)!=1:raise Failure('cleanup',retain=True)
        parts=lines[0].split('|')
        if len(parts)!=3 or not re.fullmatch(r'[a-f0-9]{64}',parts[0]) or parts[1]!='/'+self.namespace or parts[2]!=self.owner:
            raise Failure('cleanup',retain=True)
        if self.identifier is not None and parts[0]!=self.identifier:
            raise Failure('cleanup',retain=True)
        return parts[0]

    def start(self,envfile):
        existing=self.call(['ps','-a','--filter','name=^/'+self.namespace+'$','--format','{{.ID}}'])
        if existing.read_text().strip():raise Failure('docker')
        self.attempted=True
        output=self.call(['run','-d','--name',self.namespace,'--label','eventflow.scope-product-owner='+self.owner,
                         '--network','host','--env-file',str(envfile),'postgrest/postgrest:v12.2.3'],timeout=45)
        identifier=output.read_text().strip()
        if not re.fullmatch(r'[a-f0-9]{64}',identifier):raise Failure('docker')
        self.identifier=identifier
        if self.inspect()!=identifier:raise Failure('docker')

    def cleanup(self):
        if not self.attempted:return
        # A lost create response is resolved by the unpredictable owned label.
        # Foreign/replaced names fail closed; no rm is ever issued for them.
        named=self.call(['ps','-a','--filter','name=^/'+self.namespace+'$','--no-trunc','--format','{{.ID}}'])
        lines=named.read_text().splitlines()
        if len(lines)>1 or any(not re.fullmatch(r'[a-f0-9]{64}',v) for v in lines):raise Failure('cleanup',retain=True)
        if lines:
            identifier=self.inspect()
            if lines[0]!=identifier:raise Failure('cleanup',retain=True)
            # Remove immutable verified ID, never a name that may be rebound.
            self.call(['rm','--force',identifier],timeout=30)
        owned=self.call(['ps','-a','--filter','label=eventflow.scope-product-owner='+self.owner,'--no-trunc','--format','{{.ID}}'])
        if owned.read_text().strip():raise Failure('cleanup',retain=True)


def execute(env):
    namespace=guard(env);manifest,shared=closure()
    private=pathlib.Path(tempfile.mkdtemp(prefix='scope-product-native-'));private.chmod(0o700)
    native=Native(env,private,shared);docker=OwnedDocker(native,namespace);retain=False;proof=None
    try:
        version=native.process(['deno','--version'],timeout=10)
        if version.read_text().splitlines()[0]!='deno 2.8.1 (stable, release, x86_64-unknown-linux-gnu)':raise Failure('guard')
        fresh=native.run("select jsonb_build_object('fresh',current_database()='"+DATABASE+"' and current_user='postgres' and current_setting('server_version_num')='150019' and current_setting('server_encoding')='UTF8' and (select rolsuper from pg_roles where rolname=current_user) and not exists(select 1 from pg_namespace where nspname not in ('public','pg_catalog','information_schema') and nspname !~ '^pg_(toast|temp)') and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')));")
        if fresh!={'fresh':True}:raise Failure('fresh')
        native.sql_file('\n'.join((ROOT/p).read_text() for p in manifest['ordered_schema_paths']))
        native.sql_file((HERE/'operations-whole-scope-product-publication-native-bootstrap.sql').read_text())
        for p in ('supabase/migrations/20261002061253_operations_scope_invoice_capture_admin_read.sql',
                  'supabase/migrations/20261002130228_operations_scope_invoice_compatible_read_entry.sql',
                  'supabase/migrations/20261002143348_operations_whole_scope_product_publication_v1.sql'):
            native.sql_file((ROOT/p).read_text())
        fixture_out=native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm',str(HERE/'operations-obligation-fixture.ts')])
        fixture=json.loads(fixture_out.read_text());raw=json.dumps(fixture,ensure_ascii=False,allow_nan=False)
        literal="'"+raw.replace("'","''")+"'"
        # Exact original6/5 fixtures preserve their assertions and rollback.
        parity=load(HERE/'operations-whole-scope-projection-native.py')
        catalogs=[]
        for phase,(name,_table,count) in parity.SQL_TESTS.items():
            out=native.sql_file(parity.fixture_sql((HERE/name).read_text(),fixture,phase))
            rows=json.loads(out.read_text())
            if not isinstance(rows,list) or len(rows)!=count:raise Failure('parity')
            catalog=private/(phase+'.json');catalog.write_text(json.dumps(rows));catalog.chmod(0o600);catalogs.append(catalog)
        combined=private/'combined.json'
        native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm','--allow-read='+str(private),'--allow-write='+str(private),str(HERE/'whole-scope-projection-parity-vectors.ts'),str(combined),*[str(p) for p in catalogs]])
        vectors=parity.validate_vectors(json.loads(combined.read_text()),True)
        sql=parity.parity_sql(vectors,'combined52')
        for kind in ('obligation','leaf','scope'):
            sql=sql.replace("actual:=pg_temp.prototype_"+kind+"(vector->'input')", "actual:=operations_whole_scope_publication_private.calculate_"+kind+"_v1(vector->'input')")
        out=native.sql_file(sql)
        if out.read_text().splitlines()!=['whole-scope-projection-native PASS combined52']:raise Failure('parity')
        setup=(HERE/'operations-whole-scope-product-publication-native-setup.sql').read_text()
        if setup.count(":'fixture'")!=1:raise Failure('setup')
        native.sql_file(setup.replace(":'fixture'",literal))
        role=(HERE/'whole-scope-projection-sql-prototype.sql').read_text()+'\n'+(HERE/'operations-whole-scope-product-publication-postgres-test.sql').read_text()
        out=native.sql_file(role)
        rows=[json.loads(l) for l in out.read_text().splitlines() if l.startswith('[')]
        if len(rows)!=1 or len(rows[0])!=3:raise Failure('role')
        catalog=private/'product3.json';catalog.write_text(json.dumps(rows[0]));catalog.chmod(0o600)
        out=native.process(['deno','run','--no-config','--no-lock','--no-remote','--no-npm','--allow-read='+str(private),str(HERE/'operations-whole-scope-product-publication-vector-test.ts'),str(catalog)])
        if out.read_text().splitlines()!=['operations-whole-scope-product-publication SQL TS crosswire3 PASS']:raise Failure('role')
        native.sql_file((HERE/'operations-whole-scope-product-publication-native-cases-setup.sql').read_text())
        secret=secrets.token_urlsafe(48)
        pgrst={'PGRST_DB_URI':'postgres://postgres:'+urllib.parse.quote(env['PGPASSWORD'],safe='')+'@127.0.0.1:5432/'+DATABASE,
               'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':secret,
               'PGRST_SERVER_HOST':'127.0.0.1','PGRST_SERVER_PORT':'55650'}
        envfile=private/'postgrest.env';envfile.write_text('\n'.join(k+'='+v for k,v in pgrst.items())+'\n');envfile.chmod(0o600)
        docker.start(envfile)
        encode=lambda x:base64.urlsafe_b64encode(x).rstrip(b'=')
        token=encode(b'{"alg":"HS256","typ":"JWT"}')+b'.'+encode(json.dumps({'role':'authenticated','sub':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','exp':int(time.time())+600},separators=(',',':')).encode())
        native.jwt=(token+b'.'+encode(hmac.new(secret.encode(),token,hashlib.sha256).digest())).decode()
        ready=False;ready_deadline=time.monotonic()+30
        for _ in range(80):
            if time.monotonic()>=ready_deadline:break
            try:
                # Actual RPC response requires coherent product guard, and a
                # malformed command denies without source or ledger writes.
                reply=native.http({},400,timeout_seconds=min(1,max(.01,ready_deadline-time.monotonic())))
                if reply.get('code')=='22023':ready=True;break
            except Exception:pass
            time.sleep(.1)
        if not ready:raise Failure('ready')
        cases=load(HERE/'operations-whole-scope-product-publication-native-cases.py')
        subject=cases.Cases(native.run,native.start,native.wait,native.finish,native.http)
        try:proof=subject.run_all()
        except Exception as error:
            index=min(len(subject.done),7)
            raise Failure('case_'+str(index),getattr(error,'code','unclassified'),getattr(error,'retain',False)) from None
        if proof!=cases.MARKERS:raise Failure('proof')
    except Failure as e:retain=e.retain;raise
    finally:
        cleanup_failed=False
        try:native.cleanup()
        except Exception:cleanup_failed=True
        try:docker.cleanup()
        except Exception:cleanup_failed=True
        if cleanup_failed:raise Failure('cleanup',retain=True)
        if not retain:shutil.rmtree(private)
    # Public acceptance follows all SQL/HTTP checks AND owned cleanup.
    print('scope-product-native PASS original_ts_sql52_actual_reader11_crosswire3')
    for line in proof:print(line)


def main():
    def interrupted(_signum,_frame):raise Failure('cleanup',retain=True)
    signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
    try:execute(dict(os.environ))
    except Failure as e:
        print('scope-product-native FAIL '+e.phase+' SQLSTATE='+e.code,file=sys.stderr);return 1
    except Exception:
        print('scope-product-native FAIL case SQLSTATE=unclassified',file=sys.stderr);return 1
    return 0


if __name__=='__main__':sys.exit(main())
