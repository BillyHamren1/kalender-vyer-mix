import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Isolated synthetic PostgreSQL fixture: no network, production data or keys.
// Policies/helper bodies reproduce the live catalog inspected 2026-10-27.
const db = new PGlite();
const member = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const orgA = '20000000-0000-4000-8000-000000000001';
const orgB = '20000000-0000-4000-8000-000000000002';
let passed = 0;
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); passed++; console.log(`PASS ${name}`); };
async function query(sql) { return (await db.query(sql)).rows; }
async function as(role, actor, sql) {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.sub', '${actor ?? ''}', false);`);
  try { return await query(sql); } finally { await db.exec('RESET ROLE'); }
}
async function denied(name, role, actor, sql) {
  await assert.rejects(as(role, actor, sql), error => error.code === '42501', name);
  passed++; console.log(`PASS ${name}`);
}
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    CREATE TYPE public.app_role AS ENUM ('admin','forsaljning','projekt','lager');
    CREATE TABLE profiles(id uuid PRIMARY KEY, user_id uuid UNIQUE, organization_id uuid, full_name text);
    CREATE TABLE user_roles(user_id uuid, organization_id uuid, role app_role);
    CREATE TABLE staff_members(id int PRIMARY KEY, organization_id uuid, full_name text);
    CREATE FUNCTION get_user_organization_id(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT organization_id FROM profiles WHERE user_id=_user_id LIMIT 1 $$;
    CREATE FUNCTION has_role(_role app_role, _user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role) $$;
    INSERT INTO profiles VALUES ('${member}','${member}','${orgA}','Member'),('${other}','${other}','${orgB}','Other');
    INSERT INTO user_roles VALUES ('${member}','${orgA}','admin'),('${member}','${orgB}','lager');
    INSERT INTO staff_members VALUES (1,'${orgA}','A'),(2,'${orgB}','B');
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON profiles,user_roles,staff_members TO authenticated;
    GRANT ALL ON profiles,user_roles,staff_members TO service_role;
    CREATE POLICY profiles_select ON profiles FOR SELECT TO authenticated USING (organization_id=get_user_organization_id(auth.uid()) OR id=auth.uid());
    CREATE POLICY profiles_update ON profiles FOR UPDATE TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
    CREATE POLICY roles_select ON user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
    CREATE POLICY roles_org ON user_roles AS RESTRICTIVE FOR ALL USING (organization_id=get_user_organization_id(auth.uid())) WITH CHECK (organization_id=get_user_organization_id(auth.uid()));
    CREATE POLICY staff_all ON staff_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
    CREATE POLICY staff_org ON staff_members AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id=get_user_organization_id(auth.uid())) WITH CHECK (organization_id=get_user_organization_id(auth.uid()));
  `);
  check('baseline sees only own organization', await as('authenticated',member,'SELECT id FROM staff_members ORDER BY id'),[{id:1}]);
  await as('authenticated',member,`UPDATE profiles SET organization_id='${orgB}' WHERE user_id='${member}'`);
  check('baseline reproduces unauthorized tenant switch',await as('authenticated',member,'SELECT id FROM staff_members ORDER BY id'),[{id:2}]);
  check('baseline reproduces admin from wrong organization',await as('authenticated',member,"SELECT has_role('admin') AS allowed"),[{allowed:true}]);
  await db.exec(`UPDATE profiles SET organization_id='${orgA}' WHERE user_id='${member}'`);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261027151748_protect_profile_tenant_and_scope_roles.sql',import.meta.url),'utf8'));
  await denied('cannot change own tenant','authenticated',member,`UPDATE profiles SET organization_id='${orgB}' WHERE user_id='${member}'`);
  await denied('cannot clear own tenant','authenticated',member,`UPDATE profiles SET organization_id=NULL WHERE user_id='${member}'`);
  await denied('cannot change profile primary identity','authenticated',member,`UPDATE profiles SET id='30000000-0000-4000-8000-000000000001' WHERE user_id='${member}'`);
  await denied('cannot change bound actor','authenticated',member,`UPDATE profiles SET user_id='30000000-0000-4000-8000-000000000001' WHERE user_id='${member}'`);
  check('own presentation edit succeeds',await as('authenticated',member,`UPDATE profiles SET full_name='Updated' WHERE user_id='${member}' RETURNING full_name`),[{full_name:'Updated'}]);
  check('unchanged tenant in profile payload is accepted',await as('authenticated',member,`UPDATE profiles SET organization_id='${orgA}',full_name='Again' WHERE user_id='${member}' RETURNING full_name`),[{full_name:'Again'}]);
  check('cannot edit another profile',await as('authenticated',member,`UPDATE profiles SET full_name='No' WHERE user_id='${other}' RETURNING id`),[]);
  check('foreign tenant remains invisible',await as('authenticated',member,'SELECT id FROM staff_members ORDER BY id'),[{id:1}]);
  check('admin in active organization retains access',await as('authenticated',member,"SELECT has_role('admin') AS allowed"),[{allowed:true}]);
  await denied('cannot grant own admin role','authenticated',member,`INSERT INTO user_roles VALUES ('${member}','${orgB}','admin')`);
  check('cannot mutate own role rows',await as('authenticated',member,`UPDATE user_roles SET role='admin' RETURNING user_id`),[]);
  await denied('anonymous profile update denied','anon',null,`UPDATE profiles SET full_name='No'`);
  await as('service_role',null,`UPDATE profiles SET organization_id='${orgB}' WHERE user_id='${member}'`);
  check('verified server SSO can switch tenant',await as('authenticated',member,'SELECT id FROM staff_members ORDER BY id'),[{id:2}]);
  check('admin in A is not admin in B',await as('authenticated',member,"SELECT has_role('admin') AS allowed"),[{allowed:false}]);
  check('B module role remains available',await as('authenticated',member,"SELECT has_role('lager') AS allowed"),[{allowed:true}]);
  check('service-side role lookup remains supported',await as('service_role',null,`SELECT has_role('lager','${member}') AS allowed`),[{allowed:true}]);
  check('unknown actor denied',await as('authenticated',member,"SELECT has_role('admin','30000000-0000-4000-8000-000000000001') AS allowed"),[{allowed:false}]);
  console.log(`${passed} assertions passed; isolated fixture only.`);
} finally { await db.close(); }
