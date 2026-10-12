export default {
  test: {
    environment: 'node',
    include: ['supabase/functions/_shared/project-personnel-{cost,ingestion,source-issuer}.test.ts'],
  },
};
