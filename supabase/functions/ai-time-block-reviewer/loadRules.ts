// Läser aktiva lärda regler för (staff, project, org) och formaterar
// dem för prompten.

// deno-lint-ignore no-explicit-any
type Sb = any;

export interface RuleRow {
  id: string;
  scope: string;
  pattern_type: string;
  human_readable: string;
  pattern_data: Record<string, unknown>;
  confidence: number;
  verified_count: number;
}

export async function loadLearningRules(
  supabase: Sb,
  organizationId: string,
  staffId: string,
  projectIds: { large_project_id: string | null; booking_id: string | null },
): Promise<RuleRow[]> {
  const { data, error } = await supabase
    .from("staff_time_learning_rules")
    .select("id, scope, pattern_type, human_readable, pattern_data, confidence, verified_count, staff_id, large_project_id, booking_id")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .or(`staff_id.eq.${staffId},staff_id.is.null`)
    .limit(200);
  if (error) {
    console.warn("[ai-reviewer] loadLearningRules", error.message);
    return [];
  }
  const rows = (data || []) as Array<RuleRow & {
    staff_id: string | null;
    large_project_id: string | null;
    booking_id: string | null;
  }>;
  return rows.filter((r) => {
    if (r.large_project_id && projectIds.large_project_id !== r.large_project_id) return false;
    if (r.booking_id && projectIds.booking_id !== r.booking_id) return false;
    return true;
  }).map((r) => ({
    id: r.id,
    scope: r.scope,
    pattern_type: r.pattern_type,
    human_readable: r.human_readable,
    pattern_data: r.pattern_data,
    confidence: r.confidence,
    verified_count: r.verified_count,
  }));
}

export async function persistLearnedRule(
  supabase: Sb,
  organizationId: string,
  staffId: string,
  ctx: { large_project_id: string | null; booking_id: string | null },
  learned: {
    scope: "staff" | "project" | "staff_project" | "org";
    pattern_type: string;
    human_readable: string;
    pattern_data?: Record<string, unknown>;
    confidence?: number;
  },
): Promise<string | null> {
  const row = {
    organization_id: organizationId,
    staff_id: learned.scope === "staff" || learned.scope === "staff_project" ? staffId : null,
    large_project_id:
      learned.scope === "project" || learned.scope === "staff_project"
        ? ctx.large_project_id
        : null,
    booking_id:
      learned.scope === "project" || learned.scope === "staff_project"
        ? ctx.booking_id
        : null,
    scope: learned.scope,
    pattern_type: learned.pattern_type,
    pattern_data: learned.pattern_data ?? {},
    human_readable: learned.human_readable,
    confidence: Math.min(0.6, learned.confidence ?? 0.5), // nya regler börjar lågt
    created_by: "ai",
  };
  const { data, error } = await supabase
    .from("staff_time_learning_rules")
    .insert(row)
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[ai-reviewer] persistLearnedRule", error.message);
    return null;
  }
  return data?.id ?? null;
}
