/**
 * Enkel projekt-livscykelstatus.
 *
 * Detta är den ENDA status som visas för användare i projektlistor.
 * De härledda ekonomi-statusarna (missing-data, risk, partially-invoiced osv.)
 * används bara i ekonomi-dashboardens analysvyer — aldrig som projektets status.
 */

export type ProjectLifecycleStatus = 'active' | 'closed' | 'cancelled';

export interface LifecycleStatusInput {
  status?: string | null;
  economyClosed?: boolean;
}

export function getProjectLifecycleStatus(p: LifecycleStatusInput): ProjectLifecycleStatus {
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'completed' || p.economyClosed) return 'closed';
  return 'active';
}

export const LIFECYCLE_STATUS_LABEL: Record<ProjectLifecycleStatus, string> = {
  active: 'Aktivt',
  closed: 'Stängt',
  cancelled: 'Avbokat',
};
