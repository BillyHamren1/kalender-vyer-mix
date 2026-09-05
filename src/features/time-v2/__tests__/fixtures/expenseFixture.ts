/** Real-shaped Time `expense-submission.v1` fixture (staging schema), shared by tests. */
export const HASH_A = 'a'.repeat(64);
export const HASH_B = 'b'.repeat(64);
export const V1 = '11111111-1111-4111-8111-111111111111';
export const V2 = '22222222-2222-4222-8222-222222222222';
export const ORG = 'c2a94d3e-6b71-4f28-8e5a-9d0c3b7f1a22';

/** Real-shaped Time `expense-submission.v1` payload (staging schema). */
export const realShapedSubmission = (over: Record<string, unknown> = {}) => ({
  schema: 'expense-submission.v1',
  submissionId: V1,
  version: 1,
  previousSubmissionId: null,
  organizationId: ORG,
  personnelAccountId: 'pa-1',
  lineage: { assignmentId: 'wa-1', importId: 'imp-1', bookingRef: '2604-29', projectRef: 'bc9a73e7-0000-4000-8000-000000000001', sourceVersion: 'sv-1' },
  expenseDate: '2026-06-04',
  money: { amountMinor: 24900, currency: 'SEK' },
  categoryRef: 'material',
  supplier: 'Bauhaus',
  workerStatement: 'Buntband till riggen',
  canonicalHash: HASH_A,
  submittedAt: '2026-06-04T15:02:00Z',
  state: 'submitted',
  attachments: [{ attachmentId: 'att-1', objectPath: 'org/x/receipt.jpg', mimeType: 'image/jpeg', sizeBytes: 120_000, sha256: 'c'.repeat(64), state: 'registered', carriedFromSubmissionId: null, registeredAt: '2026-06-04T15:01:00Z' }],
  worker: { personnelId: 'p-1', displayName: 'Raivis' },
  isTestFixture: true,
  ...over,
});

