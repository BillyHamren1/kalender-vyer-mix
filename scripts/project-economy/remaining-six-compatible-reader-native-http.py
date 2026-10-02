"""NEW real PostgREST fixture-JWT leaf. No service headers on actor requests."""
import concurrent.futures
import base64
import datetime
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import socket
import time
import urllib.error
import urllib.request

PORT=55409
URL='http://127.0.0.1:55409/'
ROUTE={'parent':'read_operations_scope_obligation_evidence_v1','drilldown':'read_operations_scope_obligation_drilldown_v1','composition':'read_operations_scope_obligation_composition_v1','kernel':'read_operations_invoice_obligation_kernel_evidence_v1','original':'read_operations_obligation_original_v1','policy':'read_operations_obligation_source_policy_v1'}
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*_args,**_kwargs):return None

def token(secret,role,actor):
 if role not in {'authenticated','service_role','anon'} or not isinstance(secret,str) or not re.fullmatch('[a-f0-9]{64}',secret):raise ValueError()
 encode=lambda v:base64.urlsafe_b64encode(v).rstrip(b'=')
 body={'role':role,'exp':int(time.time())+180,'iat':int(time.time())}
 if actor is not None:body['sub']=actor
 head=encode(b'{"alg":"HS256","typ":"JWT"}')+b'.'+encode(json.dumps(body,separators=(',',':')).encode())
 return (head+b'.'+encode(hmac.new(secret.encode(),head,hashlib.sha256).digest())).decode()

def request(path,body,jwt):
 if path not in set(ROUTE.values()) or not isinstance(jwt,str) or len(jwt)>2048:raise ValueError()
 raw=json.dumps(body,separators=(',',':')).encode()
 if len(raw)>262144:raise ValueError()
 req=urllib.request.Request(URL+'rpc/'+path,raw,{'Authorization':'Bearer '+jwt,'Content-Type':'application/json'},method='POST')
 opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
 deadline=time.monotonic()+6
 try:response=opener.open(req,timeout=6)
 except urllib.error.HTTPError as e:response=e
 with response:
  if response.geturl()!=URL+'rpc/'+path:raise ValueError()
  if time.monotonic()>=deadline:raise TimeoutError()
  underlying=response.fp if isinstance(response,urllib.error.HTTPError) else response
  sock=underlying.fp.raw._sock
  pieces=[];size=0;chunks=0
  while True:
   remaining=deadline-time.monotonic()
   if remaining<=0:raise TimeoutError()
   sock.settimeout(min(1,remaining))
   part=response.read1(8192);chunks+=1
   if time.monotonic()>=deadline or chunks>128:raise TimeoutError()
   if not part:break
   size+=len(part)
   if size>262144:raise ValueError()
   pieces.append(part)
  raw=b''.join(pieces)
  if time.monotonic()>=deadline:raise TimeoutError()
  decoded=raw.decode('utf-8','strict')
  if time.monotonic()>=deadline:raise TimeoutError()
  parsed=json.loads(decoded)
  if time.monotonic()>=deadline:raise TimeoutError()
  status=response.status
 if time.monotonic()>=deadline:raise TimeoutError()
 return status,parsed

def payloads(native,selection):
 drill={'schema_version':'operations-scope-obligation-drilldown-read.v1','root_kind':'project','root_id':native.PROJECT,'obligation_id':native.OBLIGATION,'expected_composition_snapshot_id':selection['snapshot'],'expected_baseline_event_id':selection['event']}
 kernel={'schema_version':'operations-invoice-obligation-kernel-read.v1','organization_id':native.ORG,'project_id':native.PROJECT,'obligation_id':native.OBLIGATION}
 common={'p_organization_id':native.ORG,'p_project_id':native.PROJECT,'p_obligation_id':native.OBLIGATION,'p_source_anchor':selection['anchor']}
 return {'parent':{'p_organization_id':native.ORG,'p_root_kind':'project','p_root_id':native.PROJECT},'drilldown':{'p_request':drill},'composition':{'p_organization_id':native.ORG,'p_economic_scope_id':native.SCOPE},'kernel':{'p_request':kernel},'original':common,'policy':common}

def comparable(family,value):
 if not isinstance(value,dict):raise ValueError()
 copied=dict(value)
 field={'parent':'generatedAt','drilldown':'asOf','kernel':'as_of'}.get(family)
 if field:
  text=copied.pop(field,None)
  if not isinstance(text,str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)',text):raise ValueError()
  datetime.datetime.fromisoformat(text.replace('Z','+00:00'))
 return copied

def container_identity(text,name,owner,expected_id=None):
 values=text.strip().split('|')
 if len(values)!=4 or not re.fullmatch('[0-9a-f]{64}',values[0]) or values[1]!='/'+name or values[2]!=owner or values[3] not in {'true','false'} or expected_id is not None and values[0]!=expected_id:raise ValueError()
 return values[0],values[3]=='true'

def container_cleanup(h,native,name,owner,expected_id):
 # Inventory only this run's cryptographic label. Every mutation targets a
 # separately revalidated immutable ID, never a mutable container name.
 rows=h.run('cleanup',['docker','--host','unix:///var/run/docker.sock','ps','-a','--no-trunc','--filter','label=eventflow.remaining-six-owner='+owner,'--format','{{.ID}}']).read_text().splitlines()
 if len(rows)>1 or any(not re.fullmatch('[0-9a-f]{64}',r) for r in rows):raise native.Failure('cleanup',retain=True)
 if not rows:
  if expected_id is not None:raise native.Failure('cleanup',retain=True)
  return
 current=rows[0]
 if expected_id is not None and current!=expected_id:raise native.Failure('cleanup',retain=True)
 fmt='{{.Id}}|{{.Name}}|{{index .Config.Labels "eventflow.remaining-six-owner"}}|{{.State.Running}}'
 def inspect():
  try:return container_identity(h.run('cleanup',['docker','--host','unix:///var/run/docker.sock','inspect','--format',fmt,current]).read_text(),name,owner,current)
  except BaseException:raise native.Failure('cleanup',retain=True) from None
 ident,running=inspect()
 if running:
  h.run('cleanup',['docker','--host','unix:///var/run/docker.sock','stop','--time','3',ident],seconds=15)
 ident,running=inspect()
 if running:raise native.Failure('cleanup',retain=True)
 h.run('cleanup',['docker','--host','unix:///var/run/docker.sock','rm',ident],seconds=15)
 left=h.run('cleanup',['docker','--host','unix:///var/run/docker.sock','ps','-a','--no-trunc','--filter','label=eventflow.remaining-six-owner='+owner,'--format','{{.ID}}']).read_text().splitlines()
 if left:raise native.Failure('cleanup',retain=True)

def execute(h,native,selection,calls):
 before=h.state();owner=secrets.token_hex(32);name='remaining-six-read-http-'+h.env['GITHUB_RUN_ID'];created=False;container_id=None;failure=None
 with socket.socket() as s:s.bind(('127.0.0.1',PORT))
 names=h.run('observer',['docker','--host','unix:///var/run/docker.sock','ps','-a','--format','{{.Names}}']).read_text().splitlines()
 if name in names:raise native.Failure('observer')
 h.sql('schema',(native.HERE/'remaining-six-compatible-reader-native-http-role.sql').read_text())
 secret=secrets.token_hex(32);cfg=h.private/'postgrest.env';fd=os.open(cfg,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w') as f:f.write('PGRST_DB_URI=postgres://remaining_six_http_authenticator:synthetic-remaining-six-only@127.0.0.1:5432/'+native.DATABASE+'\nPGRST_DB_SCHEMAS=public\nPGRST_DB_ANON_ROLE=anon\nPGRST_JWT_SECRET='+secret+'\nPGRST_DB_CONFIG=false\nPGRST_SERVER_HOST=127.0.0.1\nPGRST_SERVER_PORT='+str(PORT)+'\n')
 records=[]
 try:
  created=True
  container_id=h.run('schema',['docker','--host','unix:///var/run/docker.sock','create','--name',name,'--label','eventflow.remaining-six-owner='+owner,'--network','host','--env-file',str(cfg),'postgrest/postgrest:v12.2.3'],seconds=60).read_text().strip()
  if not re.fullmatch('[0-9a-f]{64}',container_id):container_id=None;raise native.Failure('schema')
  try:container_identity(h.run('observer',['docker','--host','unix:///var/run/docker.sock','inspect','--format','{{.Id}}|{{.Name}}|{{index .Config.Labels "eventflow.remaining-six-owner"}}|{{.State.Running}}',container_id]).read_text(),name,owner,container_id)
  except ValueError:raise native.Failure('schema',retain=True) from None
  h.run('schema',['docker','--host','unix:///var/run/docker.sock','start',container_id],seconds=20)
  version=h.run('schema',['docker','--host','unix:///var/run/docker.sock','exec',container_id,'/bin/postgrest','--version'],seconds=10).read_text().strip()
  if not re.fullmatch(r'PostgREST 12\.2\.3(?: \([0-9a-f]{7}\))?',version):raise native.Failure('schema')
  limit=time.monotonic()+20
  while True:
   try:
    status,value=request(ROUTE['drilldown'],{'p_request':{}},token(secret,'authenticated',native.ACTOR))
    if status==400 and value.get('code')=='22023':break
   except (OSError,ValueError):pass
   if time.monotonic()>limit:raise native.Failure('reader')
   time.sleep(.1)
  inputs=payloads(native,selection)
  for family,body in inputs.items():
   role='authenticated' if family in {'parent','drilldown'} else 'service_role'
   jwt=token(secret,role,native.ACTOR if role=='authenticated' else None)
   claims={'sub':native.ACTOR,'role':'authenticated'}
   sql="begin;select set_config('request.jwt.claims',"+native.literal(claims).removesuffix('::jsonb')+",true)\\g /dev/null\nset local role "+role+';'+calls[family]+'reset role;rollback;'
   expected=json.loads(h.sql('reader',sql))
   status,actual=request(ROUTE[family],body,jwt)
   if status!=200 or comparable(family,expected)!=comparable(family,actual) or h.state()!=before:raise native.Failure('reader')
   records.append({'case':family+'_actual_jwt_copied_parity','kind':'http','status':'PASS'})
  for family in ['parent','drilldown']:
   status,value=request(ROUTE[family],inputs[family],token(secret,'authenticated','cccccccc-cccc-4ccc-8ccc-cccccccccccc'))
   if status!=403 or value.get('code')!='42501' or h.state()!=before:raise native.Failure('reader')
   records.append({'case':family+'_foreign_actor_denied','kind':'http','status':'PASS'})
  for label,jwt in [('signed_missing_actor',token(secret,'authenticated',None)),('anonymous',token(secret,'anon',None))]:
   status,value=request(ROUTE['parent'],inputs['parent'],jwt)
   if status!=(401 if label=='anonymous' else 403) or value.get('code')!='42501':raise native.Failure('reader')
   records.append({'case':label+'_parent_denied','kind':'http','status':'PASS'})
  wrong='1'*64 if secret!='1'*64 else '2'*64
  status,value=request(ROUTE['parent'],inputs['parent'],token(wrong,'authenticated',native.ACTOR))
  if status!=401 or not isinstance(value,dict):raise native.Failure('reader')
  records.append({'case':'actual_invalid_signature_denied','kind':'http','status':'PASS'})
  # Real function-scoped fallback is independently tested by the native holder matrix.
  # Here exact wrapper role/strict parser/error priority is observed via real HTTP.
  status,value=request(ROUTE['drilldown'],{'p_request':{}},token(secret,'authenticated',None))
  if status!=400 or value.get('code')!='22023':raise native.Failure('reader')
  records.append({'case':'actual_parser_before_actor_priority','kind':'http','status':'PASS'})
  for family in ['composition','kernel','original','policy']:
   status,value=request(ROUTE[family],inputs[family],token(secret,'authenticated',native.ACTOR))
   if status!=403 or value.get('code')!='42501':raise native.Failure('reader')
   records.append({'case':family+'_authenticated_service_boundary_denied','kind':'http','status':'PASS'})
  observed_status=None
  for family in ['parent','drilldown']:
   holder_name='remaining_six_http_'+family
   lock="select pg_advisory_xact_lock(hashtextextended('obligation-org:"+native.ORG+"',0))"
   with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
    holder=pool.submit(h.sql,'holder',"begin;"+lock+";do $$begin perform pg_sleep(8);exception when query_canceled then null;end$$;rollback;",15,{'PGAPPNAME':holder_name})
    pid=None
    try:
     pid=h.await_observation(holder_name,'held','advisory')
     status,value=request(ROUTE[family],inputs[family],token(secret,'authenticated',native.ACTOR))
     if status!=500 or set(value)!={'code','message','details','hint'} or value['code']!='55P03' or value['message']!='remaining_reader_dependency_busy' or value['details'] is not None or value['hint'] is not None or not h.observe(holder_name,'held','advisory'):raise native.Failure('reader')
     # Pinned v12.2.3 Error.hs maps class55 to500; require actual native evidence too.
     if observed_status is not None and observed_status!=status:raise native.Failure('reader')
     observed_status=status
    finally:h.finish_holder(holder_name,pid,holder)
   if h.state()!=before:raise native.Failure('state')
   records.append({'case':family+'_actual_http_busy_mapping','kind':'http','status':'PASS','httpStatus':status})
  if h.state()!=before:raise native.Failure('state')
 except BaseException as e:failure=e
 finally:
  if created:
   try:container_cleanup(h,native,name,owner,container_id)
   except BaseException as e:
    failure=native.Failure('cleanup',retain=True)
 if failure is not None:raise failure
 return records
