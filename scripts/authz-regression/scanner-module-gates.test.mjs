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
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'select null::uuid'; CREATE TABLE auth.users(id uuid PRIMARY KEY);
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
  await assert.rejects(()=>role('service_role',`delete from hub_projection_private.scanner_staff_bindings where staff_id='linked'`),e=>e.code==='42501');
  await assert.rejects(()=>role('service_role',`update hub_projection_private.scanner_staff_bindings set local_user_id='${absent}' where staff_id='linked'`),e=>e.code==='42501');
  const scanner=async(id='linked',o=org)=>(await role('service_role',`select scanner_staff_access_allowed('${id}','${o}') allowed`))[0].allowed;
  check('unlinked personnel preserved',await scanner('independent'),true);
  check('inactive staff blocked',await scanner('disabled'),false);
  check('wrong organization denied',await scanner('linked',otherOrg),false);
  check('linked staff lacks current role',await scanner(),false);
  check('versioned grant',(await apply(user,['lager'],'1')).ok,true);
  check('current warehouse staff allowed',await scanner(),true);
  check('planning cannot supply warehouse entitlement',(await apply(user,['lager'],'2',org,{planering:true,lager:false})).ok,true);
  check('warehouse gate denies retained raw lager role',await scanner(),false);
  check('equal revision gate conflict',(await apply(user,['lager'],'2')).error,'SOURCE_REVISION_CONFLICT');
  check('late gate regrant',(await apply(user,['lager'],'1')).error,'STALE_SOURCE_REVISION');
  check('unversioned bypass denied',(await apply(user,['lager'],null)).error,'SOURCE_REVISION_REQUIRED');
  check('old versioned RPC denied',(await role('service_role',`select apply_hub_role_projection('${user}','${org}',ARRAY['lager'],'3') r`))[0].r.error,'MODULE_ACCESS_REQUIRED');
  check('restore at newer revision',(await apply(user,['lager'],'3')).ok,true);
  check('restored scanner access',await scanner(),true);
  check('planning revoked despite warehouse role',(await apply(user,['lager'],'4',org,{planering:false,lager:true})).ok,true);
  check('planning predicate uses gate',(await query(`select has_planning_access('${user}') a`))[0].a,false);
  check('warehouse remains allowed',await scanner(),true);
  check('revoke',(await apply(user,[],'5',org,{planering:false,lager:false})).ok,true);
  check('existing signed session no role access',await scanner(),false);
  await db.exec(`insert into user_roles values('${user}','${org}','lager')`);
  check('local grant cannot override tombstone',await scanner(),false);
  for(const actor of ['anon','authenticated']) {
    await assert.rejects(()=>role(actor,`select scanner_staff_access_allowed('linked','${org}')`),e=>e.code==='42501');
    await assert.rejects(()=>role(actor,`select hub_module_access_allowed('${user}','${org}','lager')`),e=>e.code==='42501');
  }
  await assert.rejects(()=>db.exec(`update staff_members set user_id=null where id='linked'`),e=>e.code==='42501');
  await assert.rejects(()=>db.exec(`update staff_members set organization_id='${otherOrg}' where id='linked'`),e=>e.code==='42501');
  await db.exec(`delete from staff_members where id='linked'`);
  await assert.rejects(()=>db.exec(`insert into staff_members values('linked','${org}',null,true)`),e=>e.code==='42501');
  await db.exec(`grant insert,update on staff_members to authenticated`);
  await assert.rejects(()=>role('authenticated',`insert into staff_members values('impersonation','${org}','${user}',true)`),e=>e.code==='42501');
  console.log(`${count} module/scanner SQL assertions passed plus client privilege checks`);
} finally {await db.close()}
