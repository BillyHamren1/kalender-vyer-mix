import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/verify-sso-token/index.ts'),
  'utf8',
);

describe('SSO parallel launch contract', () => {
  it('syncs roles idempotently instead of racing delete plus insert', () => {
    expect(source).toMatch(/\.upsert\(roleRows,\s*\{\s*onConflict:\s*'user_id,role,organization_id'\s*\}\)/s);
    expect(source).not.toMatch(/from\('user_roles'\)\.delete\(\)/);
  });

  it('retries a consumed OTP with a newly generated link', () => {
    expect(source).toContain('const maxAttempts = 6');
    expect(source).toContain("verifyError?.code === 'otp_expired'");
    expect(source).toContain("trace('verify_otp_retry'");
    expect(source).toMatch(/for \(let attempt = 1; attempt <= maxAttempts; attempt\+\+\)[\s\S]*generateLink[\s\S]*verifyOtp/);
  });
});