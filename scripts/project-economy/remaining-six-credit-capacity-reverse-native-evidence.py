"""NEW fixed selected evidence comparisons; no SQL or money calculation."""
import re

ORG='11111111-1111-4111-8111-111111111111'
FINANCE='99999999-9999-4999-8999-999999999999'
PROJECT='55555555-5555-4555-8555-555555555555'
OBLIGATION='abababab-abab-4aba-8aba-abababababab'
ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ORIGINAL='23232323-2323-4232-8232-232323232323'
CREDIT='89898989-8989-4898-8989-898989898989'
SECOND='78787878-7878-4787-8787-787878787878'
HEX=re.compile('[0-9a-f]{64}')
UUID=re.compile('[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
HISTORY_TABLES=frozenset('public.'+n for n in ['operations_project_obligation_source_ownership','operations_project_obligation_baselines','operations_project_obligation_invoice_bindings','operations_obligation_credit_assignments','operations_obligation_credit_capacity_events','operations_finance_invoice_snapshots','operations_finance_credit_v2_snapshots','operations_finance_invoice_receipts','operations_finance_credit_v2_receipts'])
RECEIPT_TABLES={'original':'public.operations_finance_invoice_receipts','credit':'public.operations_finance_credit_v2_receipts','counterpart':'public.operations_finance_credit_v2_receipts'}
class EvidenceFailure(Exception):
 pass
def exact(value,keys):
 if type(value) is not dict or set(value)!=set(keys):raise EvidenceFailure()
def safe_uuid(value):
 if type(value) is not str or UUID.fullmatch(value) is None:raise EvidenceFailure()
 return value
def safe_hash(value):
 if type(value) is not str or HEX.fullmatch(value) is None:raise EvidenceFailure()
 return value
def state(value,tables):
 exact(value,{'schema','tables'})
 if value['schema']!='remaining-six-credit-capacity-reverse-state.v1' or type(value['tables']) is not list or len(value['tables'])!=62:raise EvidenceFailure()
 out={}
 for row in value['tables']:
  exact(row,{'name','count','fingerprint'})
  if type(row['name']) is not str or row['name'] in out or type(row['count']) is not int or not 0<=row['count']<=1000:raise EvidenceFailure()
  out[row['name']]={'count':row['count'],'fingerprint':safe_hash(row['fingerprint'])}
 if type(tables) not in {list,tuple} or any(type(n) is not str for n in tables) or set(out)!=set(tables):raise EvidenceFailure()
 return out
def unchanged(before,after,allowed=()):
 if type(before) is not dict or type(after) is not dict or set(before)!=set(after) or not set(allowed).issubset(before):raise EvidenceFailure()
 if any(before[name]!=after[name] for name in before if name not in allowed):raise EvidenceFailure()
def history(value):
 exact(value,{'schema','rows'})
 if value['schema']!='remaining-six-credit-capacity-reverse-history.v1' or type(value['rows']) is not list or len(value['rows'])>9000:raise EvidenceFailure()
 out={}
 for row in value['rows']:
  exact(row,{'table','key','fingerprint'})
  if type(row['table']) is not str or row['table'] not in HISTORY_TABLES or type(row['key']) is not str or not 1<=len(row['key'])<=128:raise EvidenceFailure()
  key=(row['table'],row['key'])
  if key in out:raise EvidenceFailure()
  out[key]=safe_hash(row['fingerprint'])
 return out
def preserved_history(before,after):
 if type(before) is not dict or type(after) is not dict:raise EvidenceFailure()
 if any(key not in after or after[key]!=fp for key,fp in before.items()):raise EvidenceFailure()
def delta(before,after,counts):
 if type(counts) is not dict:raise EvidenceFailure()
 unchanged(before,after,counts)
 for name,count in counts.items():
  if type(count) is not int or after[name]['count']!=before[name]['count']+count:raise EvidenceFailure()
def protocol_receipt(value,variant,outcome,body_hash):
 if type(variant) is not str or variant not in {'original','credit','counterpart'} or type(outcome) is not str or outcome not in {'accepted','replayed'}:raise EvidenceFailure()
 safe_hash(body_hash)
 exact(value,{'schema','outcome','source_organization_id','destination_organization_id','invoice_id','requested_source_revision','applied_source_revision','current_source_revision','request_body_sha256','snapshot_receipt_id','snapshot_fingerprint','receipt_id','shadow_only'})
 expected_schema='finance-project-invoice-destination-receipt-v1' if variant=='original' else 'finance-project-invoice-destination-receipt-v2'
 if value['schema']!=expected_schema or value['outcome']!=outcome or value['source_organization_id']!=FINANCE or value['destination_organization_id']!=ORG or value['invoice_id']!=(CREDIT if variant=='credit' else ORIGINAL) or value['shadow_only'] is not True:raise EvidenceFailure()
 for key in ['requested_source_revision','applied_source_revision','current_source_revision']:
  if type(value[key]) is not int or value[key]!=1:raise EvidenceFailure()
 if value['request_body_sha256']!=body_hash or value['snapshot_fingerprint']!=body_hash:raise EvidenceFailure()
 for key in ['snapshot_receipt_id','receipt_id']:safe_uuid(value[key])
 return value
def owner_receipt(value,mode,revision):
 if type(mode) is not str or type(revision) is not int or revision not in {1,2}:raise EvidenceFailure()
 keys={'outcome','event_id','revision','receipt_currentness','credit_eligible','eac_minor','shadow_only'}
 if mode=='credit':keys|={'source_anchor','remaining_coverage'}
 elif mode=='capacity':keys|={'capacity_state','reserved_minor','retained_aggregate_minor'}
 else:raise EvidenceFailure()
 exact(value,keys)
 if value['outcome']!='accepted' or type(value['revision']) is not int or value['revision']!=revision or value['credit_eligible'] is not False or value['eac_minor'] is not None or value['shadow_only'] is not True:raise EvidenceFailure()
 safe_uuid(value['event_id'])
 if mode=='credit':
  if value['receipt_currentness']!='saved_assignment_only' or value['remaining_coverage']!='unavailable':raise EvidenceFailure()
  safe_hash(value['source_anchor'])
 else:
  if value['receipt_currentness']!='saved_capacity_event_only' or value['capacity_state']!='local_capacity_proven' or type(value['reserved_minor']) is not int or value['reserved_minor']!=50000 or type(value['retained_aggregate_minor']) is not int or value['retained_aggregate_minor']!=50000:raise EvidenceFailure()
 return value
def neutrality(value,mode,counterpart=False):
 exact(value,{'schema','baseline','binding','v1_original','v2_sources','assignment_heads','assignment_events','capacity_heads','capacity_events'})
 if value['schema']!='remaining-six-credit-capacity-reverse-neutrality.v1' or type(mode) is not str or mode not in {'credit','capacity'} or type(counterpart) is not bool:raise EvidenceFailure()
 b=value['baseline'];exact(b,{'event_id','revision','currency','estimate_minor','committed_minor','fingerprint'})
 safe_uuid(b['event_id']);safe_hash(b['fingerprint'])
 if type(b['revision']) is not int or b['revision']!=1 or b['currency']!='SEK' or type(b['estimate_minor']) is not int or b['estimate_minor']!=1000000 or b['committed_minor'] is not None:raise EvidenceFailure()
 bind=value['binding'];exact(bind,{'event_id','baseline_event_id','source_anchor','currency','amount_minor','source_snapshot_id','source_raw_body_sha256','source_economic_revision'})
 for key in ['event_id','baseline_event_id','source_snapshot_id']:safe_uuid(bind[key])
 safe_hash(bind['source_anchor']);safe_hash(bind['source_raw_body_sha256'])
 if bind['baseline_event_id']!=b['event_id'] or bind['currency']!='SEK' or type(bind['amount_minor']) is not int or bind['amount_minor']!=540000 or type(bind['source_economic_revision']) is not int or bind['source_economic_revision']!=1:raise EvidenceFailure()
 original=value['v1_original'];source_keys={'id','current_revision','body_sha256','currency','net_minor','allocation_minor','allocation_count','accounting_state','settlement_state','provider_approval_state'}
 exact(original,source_keys)
 def money(row,amount):
  safe_uuid(row['id']);safe_hash(row['body_sha256'])
  if type(row['current_revision']) is not int or row['current_revision']!=1 or row['currency']!='SEK' or type(row['net_minor']) is not int or row['net_minor']!=amount or type(row['allocation_minor']) is not int or row['allocation_minor']!=amount or type(row['allocation_count']) is not int or row['allocation_count']!=1 or row['accounting_state']!='booked' or row['settlement_state']!='paid' or row['provider_approval_state']!='not_pending':raise EvidenceFailure()
 money(original,540000)
 if original['id']!=bind['source_snapshot_id'] or original['body_sha256']!=bind['source_raw_body_sha256']:raise EvidenceFailure()
 if type(value['v2_sources']) is not list:raise EvidenceFailure()
 expected={CREDIT:-50000}
 if mode=='capacity':expected[SECOND]=-500000
 if counterpart:expected[ORIGINAL]=540000
 seen=set()
 for row in value['v2_sources']:
  exact(row,source_keys|{'invoice_id'})
  if type(row['invoice_id']) is not str or row['invoice_id'] not in expected or row['invoice_id'] in seen:raise EvidenceFailure()
  seen.add(row['invoice_id']);money(row,expected[row['invoice_id']])
 if seen!=set(expected):raise EvidenceFailure()
 for key in ['assignment_heads','assignment_events','capacity_heads','capacity_events']:
  if type(value[key]) is not list or len(value[key])>16:raise EvidenceFailure()
 for row in value['assignment_heads']:
  exact(row,{'organization_id','project_id','obligation_id','source_anchor','current_revision'})
  if row['organization_id']!=ORG or row['project_id']!=PROJECT or row['obligation_id']!=OBLIGATION or type(row['current_revision']) is not int or not 1<=row['current_revision']<=2:raise EvidenceFailure()
  safe_hash(row['source_anchor'])
 for row in value['capacity_heads']:
  exact(row,{'organization_id','project_id','obligation_id','source_anchor','original_anchor','currency','current_revision'})
  if row['organization_id']!=ORG or row['project_id']!=PROJECT or row['obligation_id']!=OBLIGATION or row['currency']!='SEK' or row['original_anchor']!=bind['source_anchor'] or type(row['current_revision']) is not int or not 1<=row['current_revision']<=2:raise EvidenceFailure()
  safe_hash(row['source_anchor'])
 for row in value['assignment_events']:
  exact(row,{'event_id','revision','source_anchor','baseline_event_id','original_binding_event_id','credit_snapshot_id','amount_minor','credit_invoice_id','proof_fingerprint','proof_valid','actor_system_user_id','command'})
  if row['proof_valid'] is not True or row['actor_system_user_id']!=ACTOR or row['baseline_event_id']!=b['event_id'] or row['original_binding_event_id']!=bind['event_id'] or row['credit_invoice_id'] not in expected or row['credit_invoice_id']==ORIGINAL or type(row['amount_minor']) is not int or row['amount_minor']!=expected[row['credit_invoice_id']] or type(row['revision']) is not int or not 1<=row['revision']<=2 or type(row['command']) is not dict:raise EvidenceFailure()
  for key in ['event_id','credit_snapshot_id']:safe_uuid(row[key])
  safe_hash(row['source_anchor']);safe_hash(row['proof_fingerprint'])
  actual=next(r for r in value['v2_sources'] if r['invoice_id']==row['credit_invoice_id'])
  if row['credit_snapshot_id']!=actual['id']:raise EvidenceFailure()
 for row in value['capacity_events']:
  exact(row,{'event_id','revision','source_anchor','original_anchor','assignment_event_id','currency','reserved_minor','original_amount_minor','retained_aggregate_minor','proof_valid','actor_system_user_id','command'})
  if row['proof_valid'] is not True or row['actor_system_user_id']!=ACTOR or row['currency']!='SEK' or row['original_anchor']!=bind['source_anchor'] or type(row['revision']) is not int or not 1<=row['revision']<=2 or type(row['reserved_minor']) is not int or row['reserved_minor']!=50000 or type(row['original_amount_minor']) is not int or row['original_amount_minor']!=540000 or type(row['retained_aggregate_minor']) is not int or row['retained_aggregate_minor']!=50000 or type(row['command']) is not dict:raise EvidenceFailure()
  safe_uuid(row['event_id']);safe_uuid(row['assignment_event_id']);safe_hash(row['source_anchor'])
  assignments=[e for e in value['assignment_events'] if e['event_id']==row['assignment_event_id']]
  if len(assignments)!=1 or assignments[0]['credit_invoice_id']!=CREDIT or assignments[0]['source_anchor']!=row['source_anchor']:raise EvidenceFailure()
 return value
def accepted_event(report,mode,receipt,command_key,revision):
 events=report['assignment_events' if mode=='credit' else 'capacity_events']
 heads=report['assignment_heads' if mode=='credit' else 'capacity_heads']
 selected=[e for e in events if e['event_id']==receipt['event_id']]
 if len(selected)!=1:raise EvidenceFailure()
 event=selected[0];command=event['command']
 expected_key='expected_assignment_revision' if mode=='credit' else 'expected_capacity_revision'
 if event['revision']!=revision or command.get('idempotency_key')!=command_key or type(command.get(expected_key)) is not int or command[expected_key]!=revision-1 or command.get('project_id')!=PROJECT or command.get('obligation_id')!=OBLIGATION:raise EvidenceFailure()
 matching=[h for h in heads if h['source_anchor']==event['source_anchor']]
 if len(matching)!=1 or matching[0]['current_revision']!=revision:raise EvidenceFailure()
 if len([e for e in events if e['source_anchor']==event['source_anchor']])!=revision:raise EvidenceFailure()
 if mode=='credit' and event['source_anchor']!=receipt['source_anchor']:raise EvidenceFailure()

def bound_protocol_report(receipt,report,variant):
 if type(variant) is not str or variant not in {'original','credit','counterpart'} or type(receipt) is not dict or type(report) is not dict:raise EvidenceFailure()
 if variant=='original':source=report['v1_original']
 else:
  expected=CREDIT if variant=='credit' else ORIGINAL
  selected=[row for row in report['v2_sources'] if type(row) is dict and row.get('invoice_id')==expected]
  if len(selected)!=1:raise EvidenceFailure()
  source=selected[0]
 if type(source) is not dict or safe_uuid(receipt['snapshot_receipt_id'])!=safe_uuid(source['id']) or safe_hash(receipt['request_body_sha256'])!=safe_hash(source['body_sha256']) or safe_hash(receipt['snapshot_fingerprint'])!=source['body_sha256']:raise EvidenceFailure()
 return source
