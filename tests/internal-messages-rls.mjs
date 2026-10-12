const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role authenticated; create role anon; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create function public.get_user_organization_id(uuid) returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.org',true),'')::uuid $$;
create table staff_members(id text primary key,user_id uuid,organization_id uuid,is_active boolean);
create table direct_messages(id uuid primary key,organization_id uuid,sender_id text,recipient_id text,sender_name text,recipient_name text,sender_type text,content text,file_url text,file_name text,file_type text,booking_id text,created_at timestamptz,is_read boolean,read_at timestamptz,is_archived_by text[]);
alter table direct_messages enable row level security;
create policy org_filter_direct_messages on direct_messages for all using(organization_id=get_user_organization_id(auth.uid())) with check(organization_id=get_user_organization_id(auth.uid()));
grant usage on schema public,auth to authenticated,anon;grant all on direct_messages to authenticated,anon;
insert into staff_members values ('staff-a','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true);
insert into direct_messages(id,organization_id,sender_id,recipient_id,content,is_read) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','staff-a','staff-b','own outbound',false),
 ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','staff-b','10000000-0000-4000-8000-000000000001','own inbound',false),
 ('30000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','staff-b','staff-c','private others',false),
 ('30000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','staff-a','staff-b','foreign organization',false);
`);
await db.exec(await readFile(new URL('../supabase/migrations/20261012134510_a41b3aae-bd1c-4fa8-89aa-2a13060a68a0.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../supabase/migrations/20261012134548_79f64cdb-d069-48cc-8c1d-687abf3c5720.sql', import.meta.url),'utf8'));
assert.equal((await db.query("select has_function_privilege('anon','public.is_direct_message_actor(text,uuid)','execute') as allowed")).rows[0].allowed,false);
await db.exec(`set role authenticated;set request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';set request.jwt.claim.org='20000000-0000-4000-8000-000000000001';set request.jwt.claim.role='authenticated';`);
assert.equal((await db.query('select * from direct_messages')).rows.length,2);
assert.equal((await db.query("update direct_messages set is_read=true where content='private others' returning id")).rows.length,0);
assert.equal((await db.query("update direct_messages set is_read=true where content='own inbound' returning id")).rows.length,1);
await assert.rejects(db.exec("update direct_messages set is_read=true where content='own outbound'"));
await assert.rejects(db.exec("update direct_messages set content='forged' where content='own outbound'"));
await assert.rejects(db.exec("insert into direct_messages(id,organization_id,sender_id,recipient_id) values ('30000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000001','staff-b','staff-a')"));
await db.exec('reset role;set role anon;');assert.equal((await db.query('select * from direct_messages')).rows.length,0);
await db.exec('reset role;');assert.equal((await db.query('select * from direct_messages')).rows.length,4);
console.log('PASS: participant + alias reads, foreign org isolation, unrelated updates, recipient-only receipts, immutable content, sender-only insert, anonymous denial, backend bypass (8 assertions)');
await db.close();
