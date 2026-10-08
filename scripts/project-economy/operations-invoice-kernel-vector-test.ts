import { projectLocalInvoiceKernelEvidence } from '../../supabase/functions/_shared/local-invoice-obligation-kernel-evidence.ts';

/** Exact SQL-produced responses; no reconstruction or injected trusted readers. */
export function verifyInvoiceKernelVectors(raw: unknown): void {
  const labels = ['missing_policy', 'current_policy', 'coequal_v2', 'newer_v2', 'empty_catalog', 'time_basis'];
  if (!Array.isArray(raw) || raw.length !== labels.length) throw new Error('invalid_sql_vector_catalog');
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Object.keys(row).length !== 2 ||
      typeof row.label !== 'string' || !labels.includes(row.label) || seen.has(row.label) ||
      typeof row.evidence !== 'string') throw new Error('invalid_sql_vector');
    seen.add(row.label);
    const evidence = JSON.parse(row.evidence);
    const result = projectLocalInvoiceKernelEvidence(evidence);
    const resolved = ['missing_policy', 'current_policy', 'coequal_v2'].includes(row.label);
    if (result.known_captured_cost_minor !== (resolved ? 540000 : null) ||
      result.resolved_source_count !== (resolved ? 1 : 0) || result.eac_minor !== null ||
      result.remaining_minor !== null || result.credit_eligible !== false ||
      result.category_coverage !== 'unavailable' || result.source_coverage !== 'unavailable' ||
      result.authority_scope !== 'local_project_only' || result.shadow_only !== true)
      throw new Error('incorrect_captured_projection:' + row.label);
    if (row.label === 'time_basis') {
      if (result.kernel_input !== null || result.kernel_result !== null) throw new Error('unsupported_basis_calculated');
      continue;
    }
    if (!result.kernel_input || !result.kernel_result || result.kernel_result.coverage !== 'unavailable' ||
      result.kernel_input.relation_coverage !== 'unresolved' || result.kernel_input.committed_minor !== null ||
      result.kernel_result.eac_minor !== null || result.kernel_result.remaining_minor !== null)
      throw new Error('false_kernel_completeness:' + row.label);
    if (resolved) {
      const source = result.kernel_input.sources[0];
      if (source.kind !== 'invoice' || source.status !== 'preliminary' || source.amount_minor !== 540000 ||
        source.credited_source_id !== null || source.consumes_commitment_minor !== null ||
        source.replaces_estimate_minor !== (row.label === 'missing_policy' ? null : 700000))
        throw new Error('source_money_or_policy_changed:' + row.label);
    }
    if (row.label === 'newer_v2' && (result.excluded_source_anchors.length !== 1 ||
      !result.diagnostics.some(d => d.startsWith('excluded_source:' + evidence.sources[0].source_anchor + ':')) ||
      result.kernel_input.sources.length !== 0)) throw new Error('excluded_source_lost');
  }
  if (seen.size !== labels.length) throw new Error('missing_sql_vector');
}

if (import.meta.main) {
  if (Deno.args.length !== 1) throw new Error('expected_sql_vectors_json_path');
  verifyInvoiceKernelVectors(JSON.parse(await Deno.readTextFile(Deno.args[0])));
  console.log('operations-invoice-kernel-native-vectors PASS 6');
}
