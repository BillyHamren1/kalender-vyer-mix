import { defineConfig } from 'vitest/config';

// Backend engine tests have no frontend setup or source-directory filter.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/lib/economy/projectCostEvidence.test.ts',
      'src/lib/economy/projectNativeCostEvidence.test.ts',
      'src/lib/economy/projectCateringEvidenceParity.test.ts',
      'src/lib/economy/projectScopeObligationEvidence.test.ts',
      'src/lib/economy/projectScopeObligationDrilldown.test.ts',
      'src/lib/economy/projectScopeInvoiceCapture.test.ts',
      'supabase/functions/_shared/project-booking-commercial-read.test.ts',
      'supabase/functions/_shared/project-booking-commercial-read-client.test.ts',
      'supabase/functions/_shared/project-personnel-cost.test.ts',
      'supabase/functions/_shared/finance-project-invoice.test.ts',
      'supabase/functions/_shared/project-cost-obligations.test.ts',
      'supabase/functions/_shared/local-invoice-obligation-kernel-evidence.test.ts',
      'supabase/functions/_shared/project-scope-invoice-kernel-evidence.test.ts',
      'supabase/functions/_shared/project-scope-invoice-capture-admin.test.ts',
      'supabase/functions/_shared/project-cost-obligation-authority.test.ts',
      'supabase/functions/_shared/project-obligation-source-policy.test.ts',
      'supabase/functions/_shared/project-obligation-credit-assignment.test.ts',
      'supabase/functions/_shared/project-obligation-credit-capacity.test.ts',
      'supabase/functions/_shared/project-scope-obligation-composition.test.ts',
      'supabase/functions/_shared/project-operational-eac.test.ts',
      'supabase/functions/_shared/canonical-project-scope.test.ts',
      'supabase/functions/_shared/catering-project-evidence.test.ts',
      'supabase/functions/_shared/catering-project-reassignment.test.ts',
      'supabase/functions/_shared/catering-project-ingestion.test.ts',
      'supabase/functions/_shared/catering-finance-transport.test.ts',
      'supabase/functions/catering-finance-delivery/handler.test.ts',
      'supabase/functions/_shared/project-personnel-project-review.test.ts',
      'supabase/functions/_shared/project-personnel-ingestion*.test.ts',
    ],
  },
});
