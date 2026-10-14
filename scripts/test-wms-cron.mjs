import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = readFileSync(new URL('../supabase/migrations/20261014231017_secure_booking_sync_cron.sql', import.meta.url), 'utf8');
await db.exec(`
  CREATE SCHEMA cron; CREATE SCHEMA vault;
  CREATE TABLE cron.job(jobid bigint, jobname text, command text, schedule text, active boolean);
  CREATE TABLE vault.secrets(name text);
  CREATE FUNCTION cron.alter_job(job_id bigint, command text) RETURNS void LANGUAGE sql AS
    'UPDATE cron.job SET command = $2 WHERE jobid = $1';
  INSERT INTO cron.job VALUES (1, 'process-sync-jobs-every-minute',
    'SELECT net.http_post(url := ''https://example.supabase.co/functions/v1/process-sync-jobs'')', '* * * * *', true);
`);
await assert.rejects(db.exec(migration), /CRON_SECRET must be provisioned/);
await db.exec("INSERT INTO vault.secrets VALUES ('CRON_SECRET')");
await db.exec(migration);
const first = (await db.query('SELECT * FROM cron.job')).rows[0];
assert.match(first.command, /https:\/\/example.supabase.co\/functions\/v1\/process-sync-jobs/);
assert.match(first.command, /vault.decrypted_secrets/);
assert.match(first.command, /x-cron-secret/);
assert.doesNotMatch(first.command, /Authorization|Bearer/);
assert.equal(first.schedule, '* * * * *');
assert.equal(first.active, true);
await db.exec(migration);
assert.deepEqual((await db.query('SELECT * FROM cron.job')).rows[0], first);
await db.exec("UPDATE cron.job SET command='unexpected endpoint'");
await assert.rejects(db.exec(migration), /Cannot identify existing booking sync endpoint/);
await db.exec('DELETE FROM cron.job');
await db.exec(migration);
await db.close();
console.log('PASS: cron migration preserves scheduling, is idempotent and fails closed on missing secret/endpoint');
