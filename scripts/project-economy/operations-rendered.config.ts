import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Actual component/query/cache renderer. Auth and RPC are explicit test doubles;
// this gate does not replace genuine service, hosted Auth or human attest proof.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/components/project/ProjectCostEvidencePanel.rendered.test.tsx', 'src/components/project/NativeCateringCostEvidencePanel.rendered.test.tsx', 'src/components/project/OperationsCateringEvidenceParityPanel.rendered.test.tsx', 'src/components/project/OperationsScopeObligationEvidencePanel.rendered.test.tsx', 'src/components/project/OperationsObligationDrilldownPanel.rendered.test.tsx'],
  },
});
