import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const index = readFileSync('supabase/functions/time-planning-proxy/index.ts', 'utf8');
const sync = readFileSync('supabase/functions/time-planning-proxy/workerAssignmentSync.ts', 'utf8');

describe('worker.assignments.sync configuration gate', () => {
  it('does not gate the sync route on the optional TIME_ADAPTER_ANON_KEY', () => {
    expect(index).not.toContain('!adapterUrl || !anonKey || !signingSeed');
    expect(index).toContain('if (!adapterUrl || !signingSeed)');
  });

  it('names the missing server key when the real configuration is incomplete', () => {
    expect(index).toContain('Saknad servernyckel: ${missingSync}');
  });

  it('uses the worker Time JWT as gateway apikey when no anon key is configured', () => {
    expect(sync).toContain("ctx.anonKey ?? ctx.authorization.replace(/^Bearer\\s+/i, '').trim()");
    expect(sync).not.toContain("Time Auth-nyckeln saknas");
    expect(sync).toContain('apikey: gatewayKey');
    expect(sync).toContain('anonKey: gatewayKey');
  });
});
