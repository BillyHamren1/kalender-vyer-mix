"""NEW synthetic native cases; only sealed runner supplies capabilities."""
import json
import re
ORG='11111111-1111-4111-8111-111111111111'
SCOPE='90909090-9090-4909-8909-909090909090'
ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ISSUER='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
MARKERS=(
 'scope-successor-native PASS actual_postgrest_rr_direct_rc_bound_receipt',
 'scope-successor-native PASS shared_null_granted_head_composition_grant_cas',
 'scope-successor-native PASS publication_first_actual_source_queue',
 'scope-successor-native PASS source_first_try_no_partial_live_holder',
 'scope-successor-native PASS grant_first_publication_try_no_partial',
 'scope-successor-native PASS publication_first_actual_grant_try_no_partial',
 'scope-successor-native PASS repeatable_read_40001_no_partial',
 'scope-successor-native PASS current_issuer_project_gate_queued_revocations',
 'scope-successor-native PASS historical_revoke_complete_binding_nonactivation',
 'scope-successor-native PASS immutable_same_head_null_destination_no_finance',
)
class CaseFailure(Exception):
 def __init__(self,case):
  self.case=case if type(case) is int and 0<=case<10 else 9
  super().__init__('closed_successor_native_case_failure')
def literal(value):
 return "'"+json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':')).replace("'","''")+"'::jsonb"
class Cases:
 def __init__(self,run,start,wait,finish,http):
  self.run,self.start,self.wait,self.finish,self.http=run,start,wait,finish,http;self.done=[];self.saved_history={};self.checkpoint=None
 def require(self,value,case):
  if value is not True:raise CaseFailure(case)
 def state(self):
  return self.run("select jsonb_build_object('publication_head',(select publication_revision from operations_whole_scope_publication_private.heads where organization_id='"+ORG+"' and economic_scope_id='"+SCOPE+"'),'grant_head',(select revision from operations_whole_scope_export_grant_private.heads where organization_id='"+ORG+"' and economic_scope_id='"+SCOPE+"'),'publications',(select count(*) from operations_whole_scope_publication_private.publications),'receipts',(select count(*) from operations_whole_scope_publication_private.receipts),'bindings',(select count(*) from operations_whole_scope_publication_private.grant_bindings),'events',(select count(*) from operations_whole_scope_export_grant_private.events),'owners',(select count(*) from operations_whole_scope_export_grant_private.owners));")
 def command(self,label):
  if not re.fullmatch('[a-z_]{3,40}',label):raise CaseFailure(9)
  return self.run("select jsonb_build_object('schema_version','operations-whole-scope-granted-product-publication-command.v2','economic_scope_id','"+SCOPE+"','expected_scope_revision',s.current_revision,'expected_membership_fingerprint',m.membership_fingerprint,'expected_composition_revision',c.current_revision,'expected_composition_fingerprint',cs.fingerprint,'expected_publication_revision',p.publication_revision,'expected_grant_revision',g.revision,'idempotency_key','successor-native-"+label+"','reason','Actual isolated current server captured snapshot') from public.operations_project_scope_heads s join public.operations_project_scope_snapshots m on m.organization_id=s.organization_id and m.economic_scope_id=s.economic_scope_id and m.scope_revision=s.current_revision join public.operations_scope_obligation_composition_heads c on c.organization_id=s.organization_id and c.economic_scope_id=s.economic_scope_id join public.operations_scope_obligation_compositions cs on cs.organization_id=c.organization_id and cs.economic_scope_id=c.economic_scope_id and cs.composition_revision=c.current_revision join operations_whole_scope_publication_private.heads p on p.organization_id=s.organization_id and p.economic_scope_id=s.economic_scope_id join operations_whole_scope_export_grant_private.heads g on g.organization_id=s.organization_id and g.economic_scope_id=s.economic_scope_id where s.organization_id='"+ORG+"' and s.economic_scope_id='"+SCOPE+"';")
 def writer(self,command,before=False,after=False):
  sql="begin isolation level repeatable read;select current_revision from public.operations_project_scope_heads where economic_scope_id='"+SCOPE+"';"
  if before:sql+='select pg_sleep(10);'
  sql+="select set_config('request.jwt.claims','{\"sub\":\""+ACTOR+"\",\"role\":\"authenticated\"}',true);set local role authenticated;select public.publish_operations_whole_scope_granted_product_v2("+literal(command)+");"
  if after:sql+='select pg_sleep(10);'
  return sql+"do $$begin if current_user<>'authenticated' then raise exception 'actual_authenticated_commit_role_required' using errcode='22023';end if;end;$$;commit;"
 def grant(self,label,enabled=True,pause=False):
  if not re.fullmatch('[a-z_]{3,40}',label):raise CaseFailure(9)
  sql="begin isolation level repeatable read;select set_config('request.jwt.claims','{\"sub\":\""+ISSUER+"\",\"role\":\"authenticated\"}',true);create temp table genuine_grant_command(command jsonb) on commit drop;insert into genuine_grant_command select n.command||jsonb_build_object('expected_grant_revision',g.revision,'expected_composition_revision',c.current_revision,'expected_composition_fingerprint',cs.fingerprint,'enabled',"+str(enabled).lower()+",'idempotency_key','successor-native-grant-"+label+"') from operations_whole_scope_grant_native.commands n join operations_whole_scope_export_grant_private.heads g on g.organization_id=n.organization_id and g.economic_scope_id=(n.command->>'economic_scope_id')::uuid join public.operations_scope_obligation_composition_heads c on c.organization_id=g.organization_id and c.economic_scope_id=g.economic_scope_id join public.operations_scope_obligation_compositions cs on cs.organization_id=c.organization_id and cs.economic_scope_id=c.economic_scope_id and cs.composition_revision=c.current_revision where n.label='known';grant select on genuine_grant_command to authenticated;set local role authenticated;select public.write_operations_whole_scope_product_export_grant_v1(command) from genuine_grant_command;reset role;"
  if pause:sql+='select pg_sleep(10);'
  return sql+'commit;'
 def producer(self,revision,pause=False):
  if type(revision) is not int or revision not in {2,3,4}:raise CaseFailure(9)
  fp={2:'d',3:'e',4:'9'}[revision]*64
  sql="begin;create temp table actual_source(raw_source_correction text) on commit drop;insert into actual_source select raw_source_correction from operations_whole_scope_product_native.known_fixture where slot='only';grant select on actual_source to service_role;set local role service_role;select public.operations_receive_finance_project_invoice_destination_v1('fixture_scope_kernel',floor(extract(epoch from clock_timestamp()))::bigint::text,'successor-native-source-"+str(revision)+"',((raw_source_correction::jsonb)||jsonb_build_object('source_revision',"+str(revision)+",'source_publication_fingerprint','"+fp+"'))::text) from actual_source;reset role;"
  if pause:sql+='select pg_sleep(10);'
  return sql+'commit;'
 def source_revision(self):
  return self.run("select jsonb_build_object('revision',current_revision) from public.operations_finance_invoice_streams where organization_id='"+ORG+"' and source_organization_id='99999999-9999-4999-8999-999999999999' and invoice_id='23232323-2323-4232-8232-232323232323';")['revision']
 def history(self,revision):
  if type(revision) is not int or not 1<=revision<=100:raise CaseFailure(9)
  return self.run("select jsonb_build_object('publication',to_jsonb(p),'receipt',to_jsonb(r),'binding',to_jsonb(b),'event',to_jsonb(e)) from operations_whole_scope_publication_private.publications p join operations_whole_scope_publication_private.receipts r using(publication_id) left join operations_whole_scope_publication_private.grant_bindings b using(publication_id) left join operations_whole_scope_export_grant_private.events e on e.event_id=b.grant_event_id where p.organization_id='"+ORG+"' and p.economic_scope_id='"+SCOPE+"' and p.publication_revision="+str(revision)+";")
 def saved(self,response,case):
  keys={'schema_version','outcome','publication_id','publication_revision','source_publication_fingerprint','source_evidence_fingerprint','grant_event_id','grant_revision','grant_fingerprint','historical_only','delivery_state','shadow_only'}
  self.require(type(response) is dict and set(response)==keys and response['schema_version']=='operations-whole-scope-granted-product-publication-receipt.v2' and response['outcome']=='accepted' and response['historical_only'] is False and response['shadow_only'] is True and response['delivery_state']=='blocked_missing_protected_source_export',case)
  revision=response['publication_revision'];history=self.history(revision)
  self.require(history['receipt']['document']==response and history['publication']['publication_id']==response['publication_id'] and history['publication']['source_publication_fingerprint']==response['source_publication_fingerprint'] and history['publication']['source_evidence_fingerprint']==response['source_evidence_fingerprint'] and history['binding']['grant_event_id']==response['grant_event_id'] and history['event']['fingerprint']==response['grant_fingerprint'] and history['event']['revision']==response['grant_revision'] and history['event']['actor_id']==ISSUER and history['publication']['actor_id']==ACTOR and history['publication']['destination_raw_body'] is None,case)
  grant=history['publication']['export_grant'];self.require(grant=={'event_id':history['event']['event_id'],'revision':history['event']['revision'],'fingerprint':history['event']['fingerprint'],'destination_organization_id':history['event']['destination_organization_id'],'destination_scope_id':history['event']['destination_scope_id'],'destination_mapping_id':history['event']['document']['destination_mapping_id'],'destination_mapping_revision':history['event']['document']['destination_mapping_revision']},case)
  self.saved_history[revision]=history
  return response
 def success(self,command,case):
  if case==0:self.checkpoint='case_0_http_receipt'
  response=self.http(command,200)
  if case==0:self.checkpoint='case_0_saved_receipt'
  return self.saved(response,case)
 def compose(self):
  self.run("begin isolation level repeatable read;select set_config('request.jwt.claims','{\"sub\":\""+ACTOR+"\",\"role\":\"authenticated\"}',true);create temp table genuine_composition(command jsonb) on commit drop;insert into genuine_composition select compose_command||jsonb_build_object('expected_composition_revision',1,'idempotency_key','successor-native-real-composition-two') from operations_whole_scope_product_native.known_fixture;grant select on genuine_composition to authenticated;set local role authenticated;select public.compose_operations_scope_obligations_v1(command) from genuine_composition;reset role;commit;")
 def old_publication(self,label):
  command=self.command(label);command.pop('expected_grant_revision');command['schema_version']='operations-whole-scope-product-publication-command.v1'
  sql=self.writer(command).replace('publish_operations_whole_scope_granted_product_v2','publish_operations_whole_scope_product_v1');self.run(sql)
 def revoke_queue(self,kind,update,restore):
  holder=self.start('scope_product_grant_successor_'+kind,self.writer(self.command('queue_'+kind),after=True));self.wait('scope_product_grant_successor_'+kind,'PgSleep')
  changer=self.start('scope_product_grant_successor_revoke_'+kind,'begin;'+update+'commit;');self.wait('scope_product_grant_successor_revoke_'+kind,'Lock');self.wait('scope_product_grant_successor_'+kind,'PgSleep')
  self.finish(holder);self.finish(changer);before=self.state();response=self.http(self.command('deny_'+kind),403)
  self.require(response.get('code')=='42501' and self.state()==before,7);self.run(restore)
 def run_all(self):
  self.checkpoint='case_0_state'
  self.require(self.state()=={'publication_head':1,'grant_head':1,'publications':1,'receipts':1,'bindings':0,'events':1,'owners':1},0)
  original=self.command('initial');before=self.state();self.checkpoint='case_0_direct_rc';self.run(self.writer(original).replace('repeatable read','read committed'),'55000');self.require(self.state()==before,0)
  self.checkpoint='case_0_state';self.saved_history[1]=self.history(1);first=self.success(original,0);self.done.append(MARKERS[0])
  self.old_publication('old_null_three');self.compose();before=self.state();denied=self.http(self.command('old_grant_composition'),409);self.require(denied.get('code')=='PT409' and self.state()==before,1)
  self.run(self.grant('composition_two'));self.success(self.command('second'),1);self.require(self.state()['publication_head']==4 and self.state()['grant_head']==2 and self.history(3)['publication']['export_grant'] is None,1);self.saved_history[3]=self.history(3)
  before=self.state();stale=self.command('publication_cas');stale['expected_publication_revision']=3;self.require(self.http(stale,409).get('code')=='PT409' and self.state()==before,1)
  stale=self.command('grant_cas');stale['expected_grant_revision']=1;self.require(self.http(stale,409).get('code')=='PT409' and self.state()==before,1);self.done.append(MARKERS[1])
  holder=self.start('scope_product_grant_successor_pub_first',self.writer(self.command('pub_first'),after=True));self.wait('scope_product_grant_successor_pub_first','PgSleep');contender=self.start('scope_product_grant_successor_source_wait',self.producer(2));self.wait('scope_product_grant_successor_source_wait','Lock');self.wait('scope_product_grant_successor_pub_first','PgSleep');self.finish(holder);self.finish(contender);self.require(self.source_revision()==2,2);self.done.append(MARKERS[2])
  holder=self.start('scope_product_grant_successor_source_first',self.producer(3,True));self.wait('scope_product_grant_successor_source_first','PgSleep');before=self.state();self.run(self.writer(self.command('source_first')),'55P03');self.require(self.state()==before,3);self.wait('scope_product_grant_successor_source_first','PgSleep');self.finish(holder);self.require(self.source_revision()==3,3);self.done.append(MARKERS[3])
  holder=self.start('scope_product_grant_successor_grant_first',self.grant('grant_first',pause=True));self.wait('scope_product_grant_successor_grant_first','PgSleep');before=self.state();self.run(self.writer(self.command('grant_first')),'55P03');self.require(self.state()==before,4);self.wait('scope_product_grant_successor_grant_first','PgSleep');self.finish(holder);self.done.append(MARKERS[4])
  holder=self.start('scope_product_grant_successor_grant_wait_holder',self.writer(self.command('grant_wait'),after=True));self.wait('scope_product_grant_successor_grant_wait_holder','PgSleep');before=self.state();self.run(self.grant('grant_wait'),'55P03');self.require(self.state()==before,5);self.wait('scope_product_grant_successor_grant_wait_holder','PgSleep');self.finish(holder);self.done.append(MARKERS[5])
  before=self.state();holder=self.start('scope_product_grant_successor_rr',self.writer(self.command('rr_conflict'),before=True));self.wait('scope_product_grant_successor_rr','PgSleep');self.run(self.producer(4));self.finish(holder,'40001');self.require(self.state()==before and self.source_revision()==4,6);self.done.append(MARKERS[6])
  self.revoke_queue('gate',"set local role service_role;update operations_whole_scope_publication_private.granted_gates set enabled=false where organization_id='"+ORG+"';reset role;","update operations_whole_scope_publication_private.granted_gates set enabled=true where organization_id='"+ORG+"';")
  self.revoke_queue('issuer',"delete from public.user_roles where user_id='"+ISSUER+"' and role='admin';","insert into public.user_roles(user_id,organization_id,role) values('"+ISSUER+"','"+ORG+"','admin');")
  self.revoke_queue('project',"update public.projects set deleted_at=clock_timestamp() where id='77777777-7777-4777-8777-777777777777';","update public.projects set deleted_at=null where id='77777777-7777-4777-8777-777777777777';")
  self.done.append(MARKERS[7])
  self.run(self.grant('final_revoke',enabled=False));self.run("set role service_role;update operations_whole_scope_export_grant_private.partners set enabled=false where partner_version='16161616-1616-4616-8616-161616161616';reset role;")
  before=self.state();replay=self.http(original,200);self.require(replay==first|{'outcome':'replayed','historical_only':True} and self.history(2)==self.saved_history[2] and self.state()==before,8)
  changed=original|{'reason':'Changed same-key historical command'};self.require(self.http(changed,409).get('code')=='23505' and self.state()==before and self.history(2)==self.saved_history[2],8);self.done.append(MARKERS[8])
  self.require(self.state()=={'publication_head':9,'grant_head':4,'publications':9,'receipts':9,'bindings':7,'events':4,'owners':1},9)
  for revision,history in self.saved_history.items():self.require(self.history(revision)==history,9)
  integrity=self.run("select jsonb_build_object('null_destination',not exists(select 1 from operations_whole_scope_publication_private.publications where destination_raw_body is not null),'head_bound',not exists(select 1 from operations_whole_scope_publication_private.heads h left join operations_whole_scope_publication_private.publications p on p.publication_id=h.publication_id where p.publication_id is null or row(h.organization_id,h.economic_scope_id,h.publication_revision) is distinct from row(p.organization_id,p.economic_scope_id,p.publication_revision)),'complete',not exists(select 1 from operations_whole_scope_publication_private.publications p left join operations_whole_scope_publication_private.grant_bindings b using(publication_id) left join operations_whole_scope_publication_private.receipts r using(publication_id) where p.document->>'schema_version'='operations-whole-scope-granted-product-publication.v2' and (b.publication_id is null or r.publication_id is null))); ")
  self.require(integrity=={'null_destination':True,'head_bound':True,'complete':True},9);self.done.append(MARKERS[9]);return tuple(self.done)
