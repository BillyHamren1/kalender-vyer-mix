export default {
  test: {
    environment: 'node',
    include: ['supabase/functions/_shared/project-personnel-{cost,ingestion,source-issuer,accepted-transport}.test.ts'],
  },
};
