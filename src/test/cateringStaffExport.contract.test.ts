import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.join(process.cwd(), 'supabase/functions/export-catering-staff/index.ts'),
  'utf8',
);

describe('Catering staff directory export contract', () => {
  it('is fail closed behind a dedicated server-side secret', () => {
    expect(source).toContain('CATERING_STAFF_DIRECTORY_SECRET');
    expect(source).toContain('DIRECTORY_NOT_CONFIGURED');
    expect(source).toContain('UNAUTHORIZED');
    expect(source).toContain('x-catering-secret');
  });

  it('is tenant scoped server-side', () => {
    expect(source).toContain('.eq("organization_id", organizationId)');
    expect(source).toContain('ORG_NOT_FOUND');
  });

  it('exports stable host refs', () => {
    expect(source).toContain('host_staff_ref: row.id');
    expect(source).toContain('host_user_ref: row.user_id ?? null');
  });

  it('exports only workforce-directory fields', () => {
    expect(source).toContain('id,user_id,name,email,role,tags,is_active,employment_type');
    expect(source).not.toMatch(
      /select\([^)]*(salary|hourly_rate|overtime_rate|emergency_contact|notes|phone|address)/,
    );
  });

  it('is read-only', () => {
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
});
