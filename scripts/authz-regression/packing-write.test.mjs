import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let db; let nativeClient;
if (process.env.AUTHZ_TEST_DATABASE_URL) {
  const url=new URL(process.env.AUTHZ_TEST_DATABASE_URL);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname!='/authz_fixture') throw Error('isolated local fixture required');
  const {Client}=await import('pg');nativeClient=Client;const client=new Client({connectionString:url.toString()});await client.connect();
  db={exec:q=>client.query(q),query:q=>client.query(q),close:()=>client.end()};
  await db.exec('DROP SCHEMA IF EXISTS public CASCADE;DROP SCHEMA IF EXISTS auth CASCADE;DROP SCHEMA IF EXISTS hub_projection_private CASCADE;CREATE SCHEMA public;');
} else db=new PGlite();
const user='10000000-0000-4000-8000-000000000001', absent='10000000-0000-4000-8000-000000000002';
const absentLinked='10000000-0000-4000-8000-000000000005', futureLocal='10000000-0000-4000-8000-000000000006';
const hubLegacy='10000000-0000-4000-8000-000000000003', localLegacy='10000000-0000-4000-8000-000000000004';
const org='20000000-0000-4000-8000-000000000001',otherOrg='20000000-0000-4000-8000-000000000002';
let count=0;const check=(name,value,expected)=>{assert.deepEqual(value,expected,name);count++;console.log('PASS '+name);};
const query=async q=>(await db.query(q)).rows;
async function role(role,q){await db.exec('SET ROLE '+role);try{return await query(q)}finally{await db.exec('RESET ROLE')}}
const apply=async(id,roles,revision,o=org,gates={planering:true,lager:true})=>(await role('service_role',`select apply_hub_role_projection('${id}','${o}',ARRAY[${roles.map(r=>`'${r}'`).join(',')}]::text[],${revision===null?'null':`'${revision}'`},'${JSON.stringify(gates)}'::jsonb) r`))[0].r;
try {
  await db.exec(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE hub_identity_links(hub_user_id uuid PRIMARY KEY,local_user_id uuid UNIQUE);
    CREATE TYPE app_role AS ENUM('admin','forsaljning','projekt','lager');
    CREATE TABLE user_roles(user_id uuid REFERENCES auth.users(id),organization_id uuid,role app_role,UNIQUE(user_id,role,organization_id));
    CREATE TABLE profiles(user_id uuid UNIQUE,organization_id uuid);
    ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY own_read ON user_roles FOR SELECT TO authenticated USING(user_id=nullif(current_setting('request.jwt.claim.sub',true),'')::uuid);
    GRANT USAGE ON SCHEMA public,auth TO service_role,authenticated,anon;
    GRANT ALL ON auth.users,hub_identity_links,user_roles,profiles TO service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON user_roles TO authenticated;
    CREATE FUNCTION resolve_hub_actor_v1(_hub_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
    DECLARE v_link uuid; v_direct boolean; v_reverse boolean;
    BEGIN
      SELECT local_user_id INTO v_link FROM public.hub_identity_links WHERE hub_user_id=_hub_user_id;
      SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=_hub_user_id) INTO v_direct;
      SELECT EXISTS(SELECT 1 FROM public.hub_identity_links WHERE local_user_id=_hub_user_id) INTO v_reverse;
      IF v_reverse THEN RETURN jsonb_build_object('status','actor_ambiguous'); END IF;
      IF v_link IS NOT NULL THEN
        IF v_direct THEN RETURN jsonb_build_object('status','actor_ambiguous'); END IF;
        IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=v_link) THEN RETURN jsonb_build_object('status','actor_unmapped'); END IF;
        RETURN jsonb_build_object('status','ok','mode','linked','localUserId',v_link);
      END IF;
      IF v_direct THEN RETURN jsonb_build_object('status','ok','mode','direct','localUserId',_hub_user_id); END IF;
      RETURN jsonb_build_object('status','actor_unmapped');
    END $$;
    INSERT INTO auth.users VALUES('${user}'),('${localLegacy}');
    INSERT INTO hub_identity_links VALUES('${hubLegacy}','${localLegacy}');
    INSERT INTO profiles VALUES('${user}','${org}');
    INSERT INTO user_roles VALUES('${user}','${otherOrg}','lager');
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261027155649_atomic_hub_role_projection.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../../supabase/migrations/20261028145811_versioned_hub_role_projection.sql',import.meta.url),'utf8'));
  await db.exec(`CREATE TABLE staff_members(id text primary key,organization_id uuid,user_id uuid,is_active boolean);GRANT SELECT ON staff_members TO service_role;
    INSERT INTO staff_members VALUES('linked','${org}','${user}',true),('independent','${org}',null,true),('disabled','${org}',null,false);`);
  await db.exec('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role');
  await db.exec(await readFile(new URL('../../supabase/migrations/20261028181334_scanner_hub_access_guard.sql',import.meta.url),'utf8'));
  const tables=['packing_projects','packing_list_items','packing_list_item_allocations','packing_parcels','packing_work_sessions','packing_work_session_events','packing_change_requests'];
  for(const t of tables) await db.exec(`CREATE TABLE ${t}(id integer primary key,organization_id uuid,payload text);ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;
    CREATE POLICY org_filter ON ${t} FOR ALL TO authenticated USING(organization_id=public.get_user_organization_id(auth.uid())) WITH CHECK(organization_id=public.get_user_organization_id(auth.uid()));
    GRANT ALL ON ${t} TO anon,authenticated,service_role;
    INSERT INTO ${t} VALUES(1,'${org}','original'),(2,'${otherOrg}','foreign');`);
  await db.exec(`CREATE FUNCTION planning_edit_packing_list_item(uuid,uuid,uuid,text,text,uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$select '{"ok":true}'::jsonb$$;GRANT EXECUTE ON FUNCTION planning_edit_packing_list_item(uuid,uuid,uuid,text,text,uuid) TO anon,authenticated,service_role;`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261029055229_packing_hub_write_ceiling.sql',import.meta.url),'utf8'));
  await db.exec(`select set_config('request.jwt.claim.sub','${user}',false)`);
  check('initial canonical grant',(await apply(user,['admin','projekt','lager'],'1')).ok,true);
  for(const t of tables){
    check(t+' own read',(await role('authenticated',`select count(*)::int n from ${t}`))[0].n,1);
    check(t+' allowed warehouse write',(await role('authenticated',`update ${t} set payload='warehouse' where id=1 returning id`)).length,1);
    check(t+' foreign write denied',(await role('authenticated',`update ${t} set payload='illegal' where id=2 returning id`)).length,0);
    await assert.rejects(()=>role('authenticated',`insert into ${t} values(3,'${otherOrg}','illegal')`),e=>e.code==='42501');
  }
  check('revoke warehouse only',(await apply(user,['admin','projekt','lager'],'2',org,{planering:true,lager:false})).ok,true);
  for(const t of tables){
    check(t+' shared planning read preserved',(await role('authenticated',`select count(*)::int n from ${t}`))[0].n,1);
    check(t+' update denied with raw lager role',(await role('authenticated',`update ${t} set payload='illegal' where id=1 returning id`)).length,0);
    check(t+' delete denied',(await role('authenticated',`delete from ${t} where id=1 returning id`)).length,0);
    await assert.rejects(()=>role('authenticated',`insert into ${t} values(3,'${org}','illegal')`),e=>e.code==='42501');
    await assert.rejects(()=>role('authenticated',`truncate ${t}`),e=>e.code==='42501');
  }
  check('late grant denied',(await apply(user,['admin','projekt','lager'],'1')).error,'STALE_SOURCE_REVISION');
  check('warehouse restored planning revoked',(await apply(user,['admin','projekt','lager'],'3',org,{planering:false,lager:true})).ok,true);
  check('own warehouse write restored',(await role('authenticated',`update packing_list_items set payload='restored' where id=1 returning id`)).length,1);
  check('full revoke',(await apply(user,[],'4',org,{planering:false,lager:false})).ok,true);
  check('full revoke removes shared read',(await role('authenticated','select count(*)::int n from packing_list_items'))[0].n,0);
  const rpc=`select planning_edit_packing_list_item(null,null,null,'exclude','forged',null)`;
  for(const actor of ['anon','authenticated'])await assert.rejects(()=>role(actor,rpc),e=>e.code==='42501');
  check('trusted planning service remains',(await role('service_role',rpc)).length,1);
  check('background/scanner service mutation preserved',(await role('service_role',`update packing_list_items set payload='service' where id=1 returning id`)).length,1);
  console.log(`${count} packing write SQL assertions passed plus client denial cases`);
} finally {await db.close()}
