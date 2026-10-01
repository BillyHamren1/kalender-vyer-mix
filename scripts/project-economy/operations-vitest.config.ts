import { defineConfig } from 'vitest/config';

// Backend engine tests have no frontend setup or source-directory filter.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['supabase/functions/_shared/project-personnel-cost.test.ts'],
  },
});
