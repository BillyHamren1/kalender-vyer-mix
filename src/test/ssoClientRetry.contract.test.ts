import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/hooks/useSsoListener.ts'),
  'utf8',
);

describe('SSO client retry contract', () => {
  it('retries transient edge failures before reporting an SSO error', () => {
    expect(source).toContain('const SSO_VERIFY_MAX_ATTEMPTS = 3');
    expect(source).toMatch(/for \(let attempt = 1; attempt <= SSO_VERIFY_MAX_ATTEMPTS; attempt\+\+\)/);
    expect(source).toContain("data?.error_code === 'SESSION_CREATE_FAILED'");

    const retryIndex = source.indexOf('Transient verification failure, retrying');
    const errorResponseIndex = source.indexOf('sendSsoResponse(false, { status');
    expect(retryIndex).toBeGreaterThan(-1);
    expect(errorResponseIndex).toBeGreaterThan(retryIndex);
  });
});