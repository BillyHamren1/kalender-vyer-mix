// One oracle for PGlite and native PostgreSQL. Never accepts a hosted DSN.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);

export async function openTestDatabase() {
  const dsn = process.env.INTERNAL_PROJECTS_TEST_DSN;
  if (!dsn) {
    const {PGlite} = require('@electric-sql/pglite');
    console.log('Database runtime: PGlite; synthetic schema/auth, no native concurrency evidence');
    return new PGlite();
  }
  let url;
  try { url = new URL(dsn); } catch { throw new Error('Invalid disposable test database URL'); }
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol)
    && ['localhost', '127.0.0.1'].includes(url.hostname)
    && url.pathname === '/accepted_personnel_cost_ci' && !url.search && !url.hash,
  'Only named disposable loopback accepted_personnel_cost_ci is allowed, without URL overrides');
  const {Client} = require('pg');
  const client = new Client({connectionString: dsn, connectionTimeoutMillis: 10000,
    statement_timeout: 12000, query_timeout: 15000, application_name: 'accepted-rate-provenance-ci'});
  await client.connect();
  try {
    const existing = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
    assert.equal(existing.rows[0].count, 0, 'Disposable database must have an empty public schema');
    const roles = await client.query("SELECT count(*)::int AS count FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')");
    assert.equal(roles.rows[0].count, 0, 'Test requires a dedicated disposable PostgreSQL cluster');
    const version = await client.query('SELECT version() AS version');
    console.log('Database runtime:', version.rows[0].version,
      '; synthetic tenant/auth fixture, not hosted integration or authenticated UI');
  } catch (error) {
    await client.end();
    throw error;
  }
  return {
    exec: sql => client.query(sql),
    query: (sql, parameters) => client.query(sql, parameters),
    close: () => client.end(),
  };
}
