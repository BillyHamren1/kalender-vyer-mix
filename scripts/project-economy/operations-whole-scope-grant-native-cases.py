"""NEW TEST ONLY causal grant cases. All capabilities come from sealed runner."""
import json
import re

ORG='11111111-1111-4111-8111-111111111111'
SCOPE='90909090-9090-4909-8909-909090909090'
ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
OTHER_ACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
MARKERS=(
 'scope-grant-native PASS actual_postgrest_rr_direct_rc_receipt_bound',
 'scope-grant-native PASS cross_org_destination_try_permanent_owner',
 'scope-grant-native PASS grant_first_actual_source_queue',
 'scope-grant-native PASS source_first_try_no_partial_live_holder',
 'scope-grant-native PASS repeatable_read_40001_no_partial',
 'scope-grant-native PASS revision_cas_historical_replay_nonactivation',
 'scope-grant-native PASS actual_gate_partner_project_actor_queues',
 'scope-grant-native PASS immutable_metadata_history_null_exports',
)

class CaseFailure(Exception):
 def __init__(self,case):
  self.case=case if type(case) is int and 0<=case<8 else 7
  super().__init__('closed_grant_native_case_failure')

def scalar(v):
 if not isinstance(v,dict):raise CaseFailure(7)
 return v

def literal(v):
 return "'"+json.dumps(v,ensure_ascii=False,allow_nan=False,separators=(',',':')).replace("'","''")+"'::jsonb"

class Cases:
 def __init__(self,run,start,wait,finish,http):
  self.run,self.start,self.wait,self.finish,self.http=run,start,wait,finish,http
  self.done=[]
 def require(self,v,case):
  if v is not True:raise CaseFailure(case)
 def state(self):
  return scalar(self.run("""select jsonb_build_object('head',coalesce((select revision from operations_whole_scope_export_grant_private.heads where organization_id='"""+ORG+"' and economic_scope_id='"+SCOPE+"""'),0),'owners',(select count(*) from operations_whole_scope_export_grant_private.owners),'events',(select count(*) from operations_whole_scope_export_grant_private.events),'heads',(select count(*) from operations_whole_scope_export_grant_private.heads),'receipts',(select count(*) from operations_whole_scope_export_grant_private.receipts),'old_null',(select count(*)=1 and bool_and(export_grant is null and destination_raw_body is null) from operations_whole_scope_publication_private.publications));"""))
 def command(self,label,other=False):
  if label not in {'initial','owner_holder','owner_contender','grant_first','source_first','serialization','cas','replay_head','gate','partner','project','actor','disabled_partner','re_enable'}:raise CaseFailure(7)
  slot='other_org' if other else 'known'
  return scalar(self.run("select command||jsonb_build_object('expected_grant_revision',coalesce((select h.revision from operations_whole_scope_export_grant_private.heads h where h.organization_id=c.organization_id and h.economic_scope_id=(c.command->>'economic_scope_id')::uuid),0),'idempotency_key','native-grant-"+label+"') from operations_whole_scope_grant_native.commands c where label='"+slot+"';"))
 def writer_sql(self,cmd,actor=ACTOR,before=False,after=False):
  if actor not in {ACTOR,OTHER_ACTOR}:raise CaseFailure(7)
  sql="begin isolation level repeatable read;select current_revision from public.operations_project_scope_heads where economic_scope_id='"+cmd['economic_scope_id']+"';"
  if before:sql+='select pg_sleep(10);'
  sql+="select set_config('request.jwt.claims','{\"sub\":\""+actor+"\",\"role\":\"authenticated\"}',true);set local role authenticated;select public.write_operations_whole_scope_product_export_grant_v1("+literal(cmd)+");reset role;"
  if after:sql+='select pg_sleep(10);'
  return sql+'commit;'
 def producer_sql(self,rev,pause=False):
  if type(rev) is not int or rev not in {2,3,4}:raise CaseFailure(7)
  fp={2:'d',3:'e',4:'9'}[rev]*64
  sql="""begin;create temporary table actual_source(raw_source_correction text) on commit drop;insert into actual_source select raw_source_correction from operations_whole_scope_product_native.known_fixture where slot='only';grant select on actual_source to service_role;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'grant-native-source-"""+str(rev)+"',((raw_source_correction::jsonb)||jsonb_build_object('source_revision',"+str(rev)+",'source_publication_fingerprint','"+fp+"'))::text) from actual_source;reset role;"
  if pause:sql+='select pg_sleep(10);'
  return sql+'commit;'
 def source_revision(self):
  return scalar(self.run("select jsonb_build_object('revision',current_revision) from public.operations_finance_invoice_streams where organization_id='"+ORG+"' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='23232323-2323-4232-8232-232323232323';"))['revision']
 def saved(self,response,case):
  keys={'schema_version','outcome','event_id','economic_scope_id','revision','fingerprint','command_fingerprint','enabled','historical_only','export_state','shadow_only'}
  self.require(set(response)==keys and response.get('schema_version')=='operations-whole-scope-product-export-grant-receipt.v1' and response.get('outcome')=='accepted' and response.get('historical_only') is False and response.get('export_state')=='blocked_missing_export_writer' and response.get('shadow_only') is True and response.get('economic_scope_id')==SCOPE and type(response.get('revision')) is int and 1<=response['revision']<=9007199254740991 and type(response.get('enabled')) is bool and all(isinstance(response.get(k),str) and re.fullmatch(r'[0-9a-f]{64}',response[k]) is not None for k in ('fingerprint','command_fingerprint')) and isinstance(response.get('event_id'),str) and re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',response['event_id']) is not None,case)
  bound=scalar(self.run("""select jsonb_build_object('bound',count(*)=1) from operations_whole_scope_export_grant_private.receipts r join operations_whole_scope_export_grant_private.events e using(event_id) join operations_whole_scope_export_grant_private.heads h on h.event_id=e.event_id join operations_whole_scope_export_grant_private.owners o on o.organization_id=e.organization_id and o.economic_scope_id=e.economic_scope_id where r.document="""+literal(response)+" and e.organization_id='"+ORG+"' and e.economic_scope_id='"+SCOPE+"' and e.actor_id='"+ACTOR+"' and e.revision=h.revision and e.fingerprint=h.fingerprint and e.raw_body=operations_economy_private.canonical_json_v1(e.document) and e.fingerprint=encode(sha256(convert_to(operations_economy_private.canonical_json_v1(jsonb_build_array('operations-whole-scope-product-export-grant-event-v1',e.document)),'UTF8')),'hex') and e.idempotency_key=e.command->>'idempotency_key' and row(e.destination_organization_id,e.destination_scope_id)=row(o.destination_organization_id,o.destination_scope_id);"))
  self.require(bound=={'bound':True},case)
 def history(self):
  # Full persisted older rows, including original capture/command/raw bytes,
  # remain private and are compared again after every later mutation case.
  return scalar(self.run("select jsonb_build_object('event',to_jsonb(e),'receipt',to_jsonb(r)) from operations_whole_scope_export_grant_private.events e join operations_whole_scope_export_grant_private.receipts r using(event_id) where e.organization_id='"+ORG+"' and e.economic_scope_id='"+SCOPE+"' and e.revision=1;"))
 def success(self,cmd,case):
  response=scalar(self.http(cmd,200));self.saved(response,case);return response
 def revoke_queue(self,kind,update,restore,case):
  holder=self.start('scope_product_grant_'+kind,self.writer_sql(self.command(kind),after=True))
  self.wait('scope_product_grant_'+kind,'PgSleep')
  changer=self.start('scope_product_grant_revoke_'+kind,'begin;'+update+'commit;')
  self.wait('scope_product_grant_revoke_'+kind,'Lock')
  self.wait('scope_product_grant_'+kind,'PgSleep')
  self.finish(holder);self.finish(changer)
  before=self.state();denied=scalar(self.http(self.command('re_enable' if kind=='partner' else kind)|{'enabled':True},403))
  self.require(denied.get('code')=='42501' and self.state()==before,case)
  self.run(restore)
 def run_all(self):
  self.require(self.state()=={'head':0,'owners':0,'events':0,'heads':0,'receipts':0,'old_null':True},0)
  cmd=self.command('initial');before=self.state()
  self.run(self.writer_sql(cmd).replace('isolation level repeatable read','isolation level read committed'),'55000')
  self.require(self.state()==before,0)
  # Leave first ownership to the actual two-org TRY test below. A rolled-back
  # HTTP validation denial verifies actual function isolation without ownership.
  denied=scalar(self.http({},400));self.require(denied.get('code')=='22023' and self.state()==before,0)
  # Marker0 is appended only after a real successful HTTP receipt below.
  original=self.command('owner_holder');holder=self.start('scope_product_grant_owner_holder',self.writer_sql(original,after=True));self.wait('scope_product_grant_owner_holder','PgSleep')
  before=self.state();self.run(self.writer_sql(self.command('owner_contender',True),OTHER_ACTOR),'55P03');self.require(self.state()==before,1);self.wait('scope_product_grant_owner_holder','PgSleep');self.finish(holder)
  self.require(self.state()=={'head':1,'owners':1,'events':1,'heads':1,'receipts':1,'old_null':True},1)
  original_saved=self.history();self.saved(original_saved['receipt']['document'],1)
  self.run(self.writer_sql(self.command('owner_contender',True),OTHER_ACTOR),'23505')
  self.require(self.state()['events']==1 and self.state()['owners']==1,1)
  # Verify a real successful HTTP receipt after first ownership commits.
  self.success(self.command('initial'),0)
  self.require(self.history()==original_saved,1)
  self.done.extend((MARKERS[0],MARKERS[1]))
  holder=self.start('scope_product_grant_source_holder',self.writer_sql(self.command('grant_first'),after=True));self.wait('scope_product_grant_source_holder','PgSleep')
  contender=self.start('scope_product_grant_source_contender',self.producer_sql(2));self.wait('scope_product_grant_source_contender','Lock');self.wait('scope_product_grant_source_holder','PgSleep');self.finish(holder);self.finish(contender)
  self.require(self.source_revision()==2 and self.state()['events']==3,2);self.done.append(MARKERS[2])
  holder=self.start('scope_product_grant_source_first',self.producer_sql(3,True));self.wait('scope_product_grant_source_first','PgSleep');before=self.state()
  self.run(self.writer_sql(self.command('source_first')),'55P03');self.require(self.state()==before,3);self.wait('scope_product_grant_source_first','PgSleep');self.finish(holder);self.require(self.source_revision()==3,3);self.done.append(MARKERS[3])
  before=self.state();holder=self.start('scope_product_grant_serialization',self.writer_sql(self.command('serialization'),before=True));self.wait('scope_product_grant_serialization','PgSleep');self.run(self.producer_sql(4));self.finish(holder,'40001');self.require(self.state()==before and self.source_revision()==4,4);self.done.append(MARKERS[4])
  stale=self.command('cas');old=self.state();self.success(self.command('replay_head'),5);current=self.state();self.run(self.writer_sql(stale),'PT409');self.require(self.state()==current and current['head']==old['head']+1,5)
  replay=scalar(self.http(original,200));self.require(replay==original_saved['receipt']['document']|{'outcome':'replayed','historical_only':True} and self.history()==original_saved and self.state()==current,5);self.done.append(MARKERS[5])
  self.revoke_queue('gate',"set local role service_role;update operations_whole_scope_export_grant_private.gates set enabled=false where organization_id='"+ORG+"';reset role;","update operations_whole_scope_export_grant_private.gates set enabled=true where organization_id='"+ORG+"';",6)
  self.revoke_queue('partner',"set local role service_role;update operations_whole_scope_export_grant_private.partners set enabled=false where partner_version='16161616-1616-4616-8616-161616161616';reset role;","update operations_whole_scope_export_grant_private.partners set enabled=true where partner_version='16161616-1616-4616-8616-161616161616';",6)
  self.revoke_queue('project',"update public.projects set deleted_at=clock_timestamp() where id='77777777-7777-4777-8777-777777777777';","update public.projects set deleted_at=null where id='77777777-7777-4777-8777-777777777777';",6)
  self.revoke_queue('actor',"delete from public.user_roles where user_id='"+ACTOR+"' and role='admin';","insert into public.user_roles(user_id,organization_id,role) values('"+ACTOR+"','"+ORG+"','admin');",6)
  self.done.append(MARKERS[6])
  final=self.state();self.require(final=={'head':8,'owners':1,'events':8,'heads':1,'receipts':8,'old_null':True},7)
  integrity=scalar(self.run("select jsonb_build_object('integrity',not exists(select 1 from operations_whole_scope_export_grant_private.receipts where document->>'export_state'<>'blocked_missing_export_writer' or document->'shadow_only'<>'true'::jsonb) and not exists(select 1 from operations_whole_scope_export_grant_private.events where idempotency_key is distinct from command->>'idempotency_key'));"));self.require(integrity=={'integrity':True},7)
  self.require(self.history()==original_saved,7)
  self.done.append(MARKERS[7]);return tuple(self.done)
