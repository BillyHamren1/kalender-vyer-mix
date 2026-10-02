#!/usr/bin/env python3
"""Focused copied-boundary negatives, not authenticated/native runtime proof."""
import copy
import importlib.util
import pathlib
import unittest

HERE=pathlib.Path(__file__).absolute().parent
spec=importlib.util.spec_from_file_location('reverse_evidence',HERE/'remaining-six-credit-capacity-reverse-native-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
BIND='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
SNAP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
CSNAP='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
EVENT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
def fixture():
 source={'id':SNAP,'current_revision':1,'body_sha256':'b'*64,'currency':'SEK','net_minor':540000,'allocation_minor':540000,'allocation_count':1,'accounting_state':'booked','settlement_state':'paid','provider_approval_state':'not_pending'}
 credit=dict(source,id=CSNAP,invoice_id=m.CREDIT,body_sha256='c'*64,net_minor=-50000,allocation_minor=-50000)
 return {'schema':'remaining-six-credit-capacity-reverse-neutrality.v1','baseline':{'event_id':ID,'revision':1,'currency':'SEK','estimate_minor':1000000,'committed_minor':None,'fingerprint':'a'*64},'binding':{'event_id':BIND,'baseline_event_id':ID,'source_anchor':'d'*64,'currency':'SEK','amount_minor':540000,'source_snapshot_id':SNAP,'source_raw_body_sha256':'b'*64,'source_economic_revision':1},'v1_original':source,'v2_sources':[credit],'assignment_heads':[],'assignment_events':[],'capacity_heads':[],'capacity_events':[]}
def protocol(variant='original'):
 return {'schema':'finance-project-invoice-destination-receipt-v1' if variant=='original' else 'finance-project-invoice-destination-receipt-v2','outcome':'replayed','source_organization_id':m.FINANCE,'destination_organization_id':m.ORG,'invoice_id':m.CREDIT if variant=='credit' else m.ORIGINAL,'requested_source_revision':1,'applied_source_revision':1,'current_source_revision':1,'request_body_sha256':'a'*64,'snapshot_receipt_id':SNAP,'snapshot_fingerprint':'a'*64,'receipt_id':ID,'shadow_only':True}
def assigned():
 value=fixture();value['assignment_heads']=[{'organization_id':m.ORG,'project_id':m.PROJECT,'obligation_id':m.OBLIGATION,'source_anchor':'e'*64,'current_revision':1}]
 value['assignment_events']=[{'event_id':EVENT,'revision':1,'source_anchor':'e'*64,'baseline_event_id':ID,'original_binding_event_id':BIND,'credit_snapshot_id':CSNAP,'amount_minor':-50000,'credit_invoice_id':m.CREDIT,'proof_fingerprint':'f'*64,'proof_valid':True,'actor_system_user_id':m.ACTOR,'command':{'project_id':m.PROJECT,'obligation_id':m.OBLIGATION,'expected_assignment_revision':0,'idempotency_key':'exact-command-key'}}]
 return value
def owner():return {'outcome':'accepted','event_id':EVENT,'revision':1,'source_anchor':'e'*64,'receipt_currentness':'saved_assignment_only','credit_eligible':False,'remaining_coverage':'unavailable','eac_minor':None,'shadow_only':True}
class Evidence(unittest.TestCase):
 def test_copied_signed_money_unknown_commitment_and_separate_lifecycles(self):
  value=fixture();self.assertIs(m.neutrality(value,'credit'),value)
  self.assertEqual(value['v2_sources'][0]['net_minor'],-50000);self.assertIsNone(value['baseline']['committed_minor'])
 def test_unknown_commitment_never_promoted_to_zero(self):
  value=fixture();value['baseline']['committed_minor']=0
  with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit')
 def test_money_type_currency_identity_and_independent_status_tampering(self):
  for path,bad in [('net_minor','540000'),('allocation_minor',540000.0),('current_revision',True),('currency','EUR'),('accounting_state','unbooked'),('settlement_state','unpaid'),('provider_approval_state','pending')]:
   value=fixture();value['v1_original'][path]=bad
   with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit')
 def test_credit_negative_and_binding_bytes_not_recalculated_or_clamped(self):
  for which in ['credit_amount','binding_amount','binding_hash','missing_credit']:
   value=fixture()
   if which=='credit_amount':value['v2_sources'][0]['net_minor']=0
   elif which=='binding_amount':value['binding']['amount_minor']=0
   elif which=='binding_hash':value['binding']['source_raw_body_sha256']='d'*64
   else:value['v2_sources']=[]
   with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit')
 def test_counterpart_requires_actual_extra_original_and_no_foreign_source(self):
  value=fixture();counter=dict(value['v1_original'],id=EVENT,invoice_id=m.ORIGINAL,body_sha256='f'*64);value['v2_sources'].append(counter)
  m.neutrality(value,'credit',True)
  with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit')
  value['v2_sources'][-1]['invoice_id']=ID
  with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit',True)
 def test_duplicate_source_rejected(self):
  value=fixture();value['v2_sources'].append(copy.deepcopy(value['v2_sources'][0]))
  with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit')
 def test_exact_protocol_receipt_and_wrong_purpose_or_identity_denied(self):
  m.protocol_receipt(protocol(),'original','replayed','a'*64)
  for key,bad in [('schema','finance-project-invoice-destination-receipt-v2'),('source_organization_id',m.ORG),('destination_organization_id',m.FINANCE),('invoice_id',m.CREDIT),('shadow_only',False),('request_body_sha256','b'*64),('snapshot_fingerprint','b'*64),('requested_source_revision',True),('current_source_revision',2)]:
   value=protocol();value[key]=bad
   with self.assertRaises(m.EvidenceFailure):m.protocol_receipt(value,'original','replayed','a'*64)
 def test_protocol_receipt_no_extra_field_or_false_success(self):
  value=protocol();value['outcome']='stale'
  with self.assertRaises(m.EvidenceFailure):m.protocol_receipt(value,'original','replayed','a'*64)
  value=protocol();value['raw_invoice']='private'
  with self.assertRaises(m.EvidenceFailure):m.protocol_receipt(value,'original','replayed','a'*64)
 def test_accepted_command_bound_event_head_actor_and_original(self):
  value=assigned();m.neutrality(value,'credit');receipt=m.owner_receipt(owner(),'credit',1);m.accepted_event(value,'credit',receipt,'exact-command-key',1)
  for which in ['head','actor','original','credit_snapshot','proof']:
   value=assigned()
   if which=='head':value['assignment_heads'][0]['current_revision']=2
   elif which=='actor':value['assignment_events'][0]['actor_system_user_id']=ID
   elif which=='original':value['assignment_events'][0]['original_binding_event_id']=ID
   elif which=='credit_snapshot':value['assignment_events'][0]['credit_snapshot_id']=SNAP
   else:value['assignment_events'][0]['proof_valid']=False
   with self.assertRaises(m.EvidenceFailure):m.neutrality(value,'credit');m.accepted_event(value,'credit',owner(),'exact-command-key',1)
 def test_wrong_CAS_or_command_identity_not_allowed_table_exemption(self):
  for key,bad in [('expected_assignment_revision',True),('expected_assignment_revision',1),('idempotency_key','different'),('project_id',ID),('obligation_id',ID)]:
   value=assigned();value['assignment_events'][0]['command'][key]=bad
   with self.assertRaises(m.EvidenceFailure):m.accepted_event(value,'credit',owner(),'exact-command-key',1)
 def test_owner_receipt_rejects_eligibility_forecast_and_stale(self):
  for key,bad in [('credit_eligible',True),('eac_minor',0),('outcome','stale'),('revision',True),('receipt_currentness','current')]:
   value=owner();value[key]=bad
   with self.assertRaises(m.EvidenceFailure):m.owner_receipt(value,'credit',1)
 def test_same_count_whole_head_change_is_detected(self):
  before={'head':{'count':1,'fingerprint':'a'*64}};after={'head':{'count':1,'fingerprint':'b'*64}}
  with self.assertRaises(m.EvidenceFailure):m.unchanged(before,after)
 def test_receipt_delta_never_exempts_other_money_or_wrong_count(self):
  before={'receipt':{'count':1,'fingerprint':'a'*64},'money':{'count':1,'fingerprint':'a'*64}};after=copy.deepcopy(before);after['receipt']={'count':2,'fingerprint':'b'*64};m.delta(before,after,{'receipt':1})
  after['money']['fingerprint']='b'*64
  with self.assertRaises(m.EvidenceFailure):m.delta(before,after,{'receipt':1})
  after=copy.deepcopy(before)
  with self.assertRaises(m.EvidenceFailure):m.delta(before,after,{'receipt':1})
 def test_immutable_old_event_bytes_or_absence_detected_when_new_rows_allowed(self):
  key=('public.operations_obligation_credit_assignments',EVENT);before={key:'a'*64};after={key:'a'*64,('public.operations_obligation_credit_assignments',ID):'b'*64};m.preserved_history(before,after)
  for changed in [{key:'b'*64},{}]:
   with self.assertRaises(m.EvidenceFailure):m.preserved_history(before,changed)
 def test_state_exact62_strict_counts_and_missing_or_duplicate_tables(self):
  names=['auth.users']+['public.fixture'+str(i) for i in range(61)]
  value={'schema':'remaining-six-credit-capacity-reverse-state.v1','tables':[{'name':name,'count':0,'fingerprint':'a'*64} for name in names]};m.state(value,names)
  for bad in [True,-1,1001,'0']:
   altered=copy.deepcopy(value);altered['tables'][0]['count']=bad
   with self.assertRaises(m.EvidenceFailure):m.state(altered,names)
  altered=copy.deepcopy(value);altered['tables'][1]=copy.deepcopy(altered['tables'][0])
  with self.assertRaises(m.EvidenceFailure):m.state(altered,names)
 def test_history_rejects_unknown_table_duplicate_and_plain_object_subclass(self):
  row={'table':'public.operations_obligation_credit_assignments','key':EVENT,'fingerprint':'a'*64};value={'schema':'remaining-six-credit-capacity-reverse-history.v1','rows':[row]};m.history(value)
  value['rows'].append(copy.deepcopy(row))
  with self.assertRaises(m.EvidenceFailure):m.history(value)
  value['rows']=[dict(row,table='public.foreign')]
  with self.assertRaises(m.EvidenceFailure):m.history(value)
  calls=[]
  class Hostile(dict):
   def __iter__(self):calls.append('iter');raise RuntimeError('PRIVATE_SENTINEL')
   def __str__(self):calls.append('str');raise RuntimeError('PRIVATE_SENTINEL')
   @property
   def __class__(self):calls.append('class');raise RuntimeError('PRIVATE_SENTINEL')
  with self.assertRaises(m.EvidenceFailure):m.history(Hostile(value))
  self.assertEqual(calls,[])
 def test_protocol_snapshot_and_body_hash_cross_bound_to_actual_saved_row(self):
  value=fixture()
  for variant,source in [('original',value['v1_original']),('credit',value['v2_sources'][0])]:
   receipt=protocol(variant);receipt.update(snapshot_receipt_id=source['id'],request_body_sha256=source['body_sha256'],snapshot_fingerprint=source['body_sha256'])
   self.assertEqual(m.bound_protocol_report(receipt,value,variant),source)
   for key,bad in [('snapshot_receipt_id',EVENT),('request_body_sha256','f'*64),('snapshot_fingerprint','f'*64)]:
    changed=dict(receipt);changed[key]=bad
    with self.assertRaises(m.EvidenceFailure):m.bound_protocol_report(changed,value,variant)
 def test_counterpart_cross_binding_rejects_credit_row_substitution(self):
  value=fixture();counter=dict(value['v1_original'],id=EVENT,invoice_id=m.ORIGINAL,body_sha256='f'*64);value['v2_sources'].append(counter)
  receipt=protocol('counterpart');receipt.update(outcome='accepted',snapshot_receipt_id=EVENT,request_body_sha256='f'*64,snapshot_fingerprint='f'*64)
  self.assertEqual(m.bound_protocol_report(receipt,value,'counterpart'),counter)
  receipt['snapshot_receipt_id']=CSNAP
  with self.assertRaises(m.EvidenceFailure):m.bound_protocol_report(receipt,value,'counterpart')
  value['v2_sources'].pop()
  with self.assertRaises(m.EvidenceFailure):m.bound_protocol_report(receipt,value,'counterpart')
 def test_cross_bound_replay_refuses_missing_or_duplicate_saved_source(self):
  value=fixture();receipt=protocol('credit');receipt.update(snapshot_receipt_id=CSNAP,request_body_sha256='c'*64,snapshot_fingerprint='c'*64)
  value['v2_sources'].append(copy.deepcopy(value['v2_sources'][0]))
  with self.assertRaises(m.EvidenceFailure):m.bound_protocol_report(receipt,value,'credit')
  value['v2_sources']=[]
  with self.assertRaises(m.EvidenceFailure):m.bound_protocol_report(receipt,value,'credit')
if __name__=='__main__':unittest.main()
