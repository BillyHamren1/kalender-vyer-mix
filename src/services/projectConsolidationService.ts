import { supabase } from '@/integrations/supabase/client';

export type ConsolidationSourceType = 'small' | 'medium' | 'large';

export interface ConsolidationSource {
  type: ConsolidationSourceType;
  id: string;
}

export interface ConsolidationCandidate {
  type: ConsolidationSourceType;
  id: string;
  name: string;
  subtitle?: string | null;
  bookingCount?: number;
}

export interface ConsolidateProjectsResult {
  largeProjectId: string;
  bookingCount: number;
}

export async function consolidateProjects(input: {
  name: string;
  sources: ConsolidationSource[];
}): Promise<ConsolidateProjectsResult> {
  const { data, error } = await supabase.functions.invoke('consolidate-projects', {
    body: input,
  });
  if (error) {
    const msg = (data as any)?.error || error.message || 'Konsolidering misslyckades';
    throw new Error(msg);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as ConsolidateProjectsResult;
}

/**
 * Fetch all active projects (small + medium + large) usable as consolidation candidates.
 */
export async function fetchConsolidationCandidates(): Promise<ConsolidationCandidate[]> {
  const out: ConsolidationCandidate[] = [];

  // Medium
  const { data: meds } = await supabase
    .from('projects')
    .select('id, name, client, description, deleted_at, status')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  for (const p of meds || []) {
    out.push({
      type: 'medium',
      id: p.id,
      name: p.name,
      subtitle: (p as any).description || (p as any).client || null,
    });
  }

  // Small (jobs)
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, title, deleted_at, status')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  for (const j of jobs || []) {
    out.push({
      type: 'small',
      id: j.id,
      name: (j as any).title || 'Litet projekt',
      subtitle: 'Litet projekt',
    });
  }

  // Large
  const { data: larges } = await supabase
    .from('large_projects')
    .select('id, name, description, project_number, large_project_bookings(booking_id)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  for (const lp of larges || []) {
    out.push({
      type: 'large',
      id: lp.id,
      name: lp.name,
      subtitle:
        (lp as any).project_number ||
        ((lp as any).description ? String((lp as any).description) : null),
      bookingCount: (lp as any).large_project_bookings?.length || 0,
    });
  }

  return out;
}
