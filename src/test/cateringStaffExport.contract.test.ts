import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/export-catering-staff/index.ts'), 'utf8');

describe('Catering staff directory export contract', () => {
  it('is fail closed behind webhook secret', () => {
    expect(source).toContain('WEBHOOK_NOT_CONFIGURED');
    expect(source).toContain('UNAUTHORIZED');
    expect(source).toContain('x-webhook-secret');
  });

  it('is tenant scoped', () => {
    expect(source).toContain('.eq("organization_id", organizationId)');
    expect(source).toContain('ORG_NOT_FOUND');
  });

  it('exports only workforce-directory fields', () => {
    expect(source).toContain('id,user_id,name,email,role,tags,is_active,employment_type');
    expect(source).not.toMatch(/select\([^)]*(salary|hourly_rate|overtime_rate|emergency_contact|notes|phone)/);
  });
});
