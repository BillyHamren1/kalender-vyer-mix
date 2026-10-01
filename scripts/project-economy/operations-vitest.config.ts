import { defineConfig } from 'vitest/config';

// Backend engine tests have no frontend setup or source-directory filter.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'supabase/functions/_shared/project-personnel-cost.test.ts',
      'supabase/functions/_shared/finance-project-invoice.test.ts',
      'supabase/functions/_shared/project-cost-obligations.test.ts',
      'supabase/functions/_shared/catering-project-evidence.test.ts',
      'supabase/functions/_shared/project-personnel-project-review.test.ts',
      'supabase/functions/_shared/project-personnel-ingestion*.test.ts',
    ],
  },
});
