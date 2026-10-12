import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGE_SCHEMA, messagePage, parseMessageCursor, sameMessageRequest, authorizeInternalMessages } from '../supabase/functions/_shared/internal-messages.ts';
import { signPlanningBrainRequest } from '../supabase/functions/_shared/planning-brain-read-contract.ts';

const secret = 'test-only-message-key-with-at-least-32-characters';
const user = '10000000-0000-4000-8000-000000000001', org = '20000000-0000-4000-8000-000000000002';
const body = { schema: MESSAGE_SCHEMA, actorUserId: user, organizationId: org, action: 'get_dm_thread', data: { partner_id: 'staff-other' } };
async function authorize(overrides = {}, options = {}) {
  const value = { ...body, ...overrides }; const rawBody = JSON.stringify(value);
  const timestamp = String(Date.now() + (options.skew || 0)), nonce = crypto.randomUUID();
  const signature = await signPlanningBrainRequest(options.key || secret, timestamp, nonce, (options.noDomain ? '' : MESSAGE_SCHEMA + '\n') + rawBody);
  const filters = [];
  const supabase = {
    rpc: async () => ({ data: !options.replayed, error: options.nonceError ? {} : null }),
    from(table) {
      const values = table === 'profiles' ? (options.noProfile ? null : { organization_id: org }) : table === 'user_roles' ? (options.noRole ? [] : [{ role: 'staff' }]) : options.staff ?? [{ id: 'staff-me', is_active: true }];
      const result = { data: values, error: options.lookupError ? {} : null };
      const chain = { select() { return chain; }, eq(key, v) { filters.push([table,key,v]); return chain; }, limit() { return Promise.resolve(result); }, maybeSingle() { return Promise.resolve(result); } };
      return chain;
    },
  };
  const result = await authorizeInternalMessages({ body: value, rawBody, headers: new Headers({ 'x-internal-messages-timestamp': timestamp, 'x-internal-messages-nonce': nonce, 'x-internal-messages-signature': signature }), method: 'POST', secret, supabase });
  return { result, filters };
}

test('31 through 39 messages expose the remaining page instead of losing history', () => {
  for (let count = 31; count <= 39; count++) {
    const rows = Array.from({ length: count }, (_, i) => ({ id: String(count-i).padStart(3,'0'), created_at: '2026-10-12T09:00:00Z' }));
    const first = messagePage(rows.slice(0,31),30);
    assert.equal(first.has_more,true);
    const cursor = parseMessageCursor(first.next_cursor);
    const second = messagePage(rows.filter(r => r.id < cursor.id),30);
    assert.equal(second.has_more,false);
    assert.equal(new Set([...first.messages,...second.messages].map(r=>r.id)).size,count);
  }
});
test('cursor rejects filter injection but accepts legacy timestamps', () => {
  assert.deepEqual(parseMessageCursor('2026-10-12T09:00:00Z'),{at:'2026-10-12T09:00:00Z'});
  for (const value of ['2026-10-12T09:00:00Z),id.gt.0', '{"at":"2026-10-12T09:00:00Z","id":"x),id.gt.0"}', '{}']) assert.throws(()=>parseMessageCursor(value));
});
test('retries must retain exact actor, organization, recipient and content', () => {
  const data = { organization_id:org,sender_id:user,recipient_id:'staff-other',content:'Hej',file_url:null };
  assert.equal(sameMessageRequest(data,{...data}),true);
  for (const key of ['organization_id','sender_id','recipient_id','content','file_url']) assert.equal(sameMessageRequest(data,{...data,[key]:'different'}),false);
});
test('signed active actor resolves both identity and organization; every membership query is scoped', async () => {
  const {result,filters}=await authorize();
  assert.deepEqual(result,{staffId:'staff-me',organizationId:org,userId:user});
  for (const table of ['profiles','user_roles','staff_members']) {
    assert.ok(filters.some(f=>f[0]===table&&f[1]==='organization_id'&&f[2]===org));
    assert.ok(filters.some(f=>f[0]===table&&f[1]==='user_id'&&f[2]===user));
  }
});
test('unlinked planner keeps verified auth identity', async()=>assert.equal((await authorize({}, {staff:[]})).result.staffId,user));
for (const [name,options,status] of [
  ['other key',{key:'wrong-key'},401],['read-only domain',{noDomain:true},401],['expired',{skew:-600000},401],
  ['replay',{replayed:true},401],['nonce outage',{nonceError:true},503],['lookup outage',{lookupError:true},503],
  ['profile in another organization',{noProfile:true},403],['no membership',{noRole:true},403],['inactive',{staff:[{id:'a',is_active:false}]},403],
  ['ambiguous identity',{staff:[{id:'a',is_active:true},{id:'b',is_active:true}]},403],
]) test(`bridge rejects ${name}`,async()=>assert.equal((await authorize({},options)).result.status,status));
test('bridge does not expose unrelated mobile actions or caller-selected sender',async()=>{
  assert.equal((await authorize({action:'admin_delete_time_report'})).result.status,400);
  assert.equal((await authorize({sender_id:'someone-else'})).result.status,400);
  assert.equal((await authorize({action:'send_direct_message',data:{recipient_id:'x',content:'Hej'}})).result.status,400);
});
