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
const apply=async(id,roles,revision,o=org)=>(await role('service_role',`select apply_hub_role_projection('${id}','${o}',ARRAY[${roles.map(r=>`'${r}'`).join(',')}]::text[],${revision===null?'null':`'${revision}'`}) r`))[0].r;
try {
  await db.exec(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
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
  check('legacy delivery works before first version',(await apply(user,['projekt'],null)).ok,true);
  check('versioned grant accepted',(await apply(user,['projekt'],'10')).ok,true);
  check('version acknowledgement is exact string',(await apply(user,['projekt'],'10')).source_revision,'10');
  check('same revision conflict refused',(await apply(user,['admin'],'10')).error,'SOURCE_REVISION_CONFLICT');
  check('newer revocation accepted',(await apply(user,[],'11')).ok,true);
  check('late grant cannot restore revoked role',(await apply(user,['projekt'],'10')).error,'STALE_SOURCE_REVISION');
  check('unversioned new path cannot restore',(await apply(user,['projekt'],null)).error,'SOURCE_REVISION_REQUIRED');
  check('old RPC cannot restore',(await role('service_role',`select replace_hub_role_projection('${user}','${org}',ARRAY['admin']) r`))[0].r.error,'SOURCE_REVISION_REQUIRED');
  check('all current tenant roles removed',await query(`select role from user_roles where user_id='${user}' and organization_id='${org}'`),[]);
  check('other organization preserved',await query(`select role from user_roles where user_id='${user}' and organization_id='${otherOrg}'`),[{role:'lager'}]);
  check('revoked profile grants no tenant',await query(`select get_user_organization_id('${user}') org`),[{org:null}]);
  check('higher revision can legitimately restore',(await apply(user,['lager'],'12')).ok,true);
  check('large revision preserves integer precision',(await apply(user,[],'9007199254740993')).source_revision,'9007199254740993');
  check('one-less large revision rejected',(await apply(user,['lager'],'9007199254740992')).error,'STALE_SOURCE_REVISION');
  check('absent account gets tombstone',(await apply(absent,[],'20')).ok,true);
  check('revocation never creates auth account',await query(`select id from auth.users where id='${absent}'`),[]);
  await db.exec(`insert into auth.users values('${absent}')`);
  check('late first provisioning cannot restore',(await apply(absent,['admin'],'19')).error,'STALE_SOURCE_REVISION');
  check('new grant after absent tombstone allowed',(await apply(absent,['lager'],'21')).ok,true);
  check('absent legacy subject records tombstone',(await apply(absentLinked,[],'30')).ok,true);
  await db.exec(`insert into auth.users values('${futureLocal}');insert into hub_identity_links values('${absentLinked}','${futureLocal}')`);
  check('old RPC cannot bypass tombstone after explicit mapping',(await role('service_role',`select replace_hub_role_projection('${futureLocal}','${org}',ARRAY['admin']) r`))[0].r.error,'SOURCE_REVISION_REQUIRED');
  check('newer canonical linked grant is permitted',(await apply(absentLinked,['lager'],'31')).local_user_id,futureLocal);
  check('canonical legacy link gets role',(await apply(hubLegacy,['lager'],'5')).local_user_id,localLegacy);
  check('legacy revocation accepted',(await apply(hubLegacy,[],'6')).ok,true);
  check('legacy local UUID old path blocked',(await role('service_role',`select replace_hub_role_projection('${localLegacy}','${org}',ARRAY['admin']) r`))[0].r.error,'SOURCE_REVISION_REQUIRED');
  check('local UUID cannot impersonate HUB identity',(await apply(localLegacy,['admin'],'99')).error,'CANONICAL_IDENTITY_UNAVAILABLE');
  for(const revision of ['-1','1.5','01','9223372036854775808']){
    await assert.rejects(()=>apply(user,['admin'],revision),e=>e.code==='22023');count++;console.log('PASS invalid revision '+revision);
  }
  for(const actor of ['anon','authenticated']){
    for(const rpc of [`apply_hub_role_projection('${user}','${org}',ARRAY['admin'],'999')`,`replace_hub_role_projection('${user}','${org}',ARRAY['admin'])`,`hub_projection_private.replace_roles('${user}','${org}',ARRAY['admin'])`]){
      await assert.rejects(()=>role(actor,'select '+rpc),e=>e.code==='42501');count++;
    }
    await assert.rejects(()=>role(actor,'select * from hub_projection_private.versions'),e=>e.code==='42501');count++;
  }
  await assert.rejects(()=>role('authenticated',`insert into user_roles values('${user}','${org}','admin')`),e=>e.code==='42501');count++;
  check('browser cannot directly mutate roles',await role('authenticated',`update user_roles set role='admin' returning role`),[]);
  // Transaction failure cannot advance the version while losing the role set.
  await db.exec(`CREATE FUNCTION reject_admin_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.role='admin' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_admin_fixture BEFORE INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION reject_admin_fixture();`);
  await assert.rejects(()=>apply(absent,['admin'],'22'));count++;
  check('failed projection leaves previous version',await query(`select source_revision::text revision from hub_projection_private.versions where hub_user_id='${absent}'`),[{revision:'21'}]);
  check('failed projection preserves previous roles',await query(`select role from user_roles where user_id='${absent}'`),[{role:'lager'}]);
  if (nativeClient) {
    const first=new nativeClient({connectionString:process.env.AUTHZ_TEST_DATABASE_URL});
    const second=new nativeClient({connectionString:process.env.AUTHZ_TEST_DATABASE_URL});
    await first.connect();await second.connect();
    try {
      await first.query('BEGIN;SET LOCAL ROLE service_role');
      await first.query(`select apply_hub_role_projection('${absent}','${org}',ARRAY[]::text[],'23')`);
      const backend=(await second.query('select pg_backend_pid() id')).rows[0].id;
      await second.query('SET ROLE service_role');
      const stale=second.query(`select apply_hub_role_projection('${absent}','${org}',ARRAY['lager'],'22') r`);
      let blocked=false;
      for(let attempt=0;attempt<100;attempt++) {
        const state=await query(`select wait_event from pg_stat_activity where pid=${backend}`);
        if(state[0]?.wait_event==='advisory'){blocked=true;break;}
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      check('concurrent old grant waits on source projection lock',blocked,true);
      await first.query('COMMIT');
      check('old grant sees committed newer revocation',(await stale).rows[0].r.error,'STALE_SOURCE_REVISION');
    } finally {await first.query('ROLLBACK');await first.end();await second.end();}
  }
  console.log(`${count} versioned projection assertions passed.`);
} finally {await db.close()}
