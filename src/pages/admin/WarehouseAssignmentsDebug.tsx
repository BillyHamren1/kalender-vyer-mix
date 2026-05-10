/**
 * Warehouse → Time-app debug panel.
 *
 * Internal admin tool to understand why a staff member sees (or does not see)
 * "Lager" in the Time-app for a chosen date. Lists per staff member:
 *   - Lager-placement in personal calendar (staff_assignments on a Lager team)
 *   - Concrete warehouse_assignments for the day (with all fields)
 *   - Whether the Time-app will show them (any of the above)
 *   - Problems detected per assignment (missing ids, missing address, dupes…)
 *
 * Admin/owner only. Hidden under /admin/warehouse-assignments-debug.
 * Does not mutate anything.
 */
import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { isWarehouseTeam, getWarehouseDisplayName } from '@/lib/warehouse/warehouseTeam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

type StaffRow = { id: string; name: string | null };
type StaffAssignmentRow = { staff_id: string; team_id: string };
type WarehouseAssignmentRow = {
  id: string;
  staff_id: string | null;
  assignment_type: string;
  action: string | null;
  title: string | null;
  status: string;
  start_time: string | null;
  end_time: string | null;
  packing_id: string | null;
  booking_id: string | null;
  booking_number: string | null;
  delivery_address: string | null;
  warehouse_event_id: string | null;
};

function detectProblems(a: WarehouseAssignmentRow, allForStaff: WarehouseAssignmentRow[]): string[] {
  const problems: string[] = [];
  if (!a.staff_id) problems.push('saknar staff_id');
  if (!a.action) problems.push('saknar action');
  if (a.assignment_type === 'packing' && !a.packing_id) problems.push('saknar packing_id');
  if ((a.assignment_type === 'packing' || a.assignment_type === 'return') && !a.booking_id) {
    problems.push('saknar booking_id');
  }
  if (!a.delivery_address && a.assignment_type !== 'internal_task') {
    problems.push('saknar adress');
  }
  // Duplicate detection: same staff + (packing_id or warehouse_event_id) appears more than once
  const dupKey = a.warehouse_event_id
    ? `ev:${a.warehouse_event_id}`
    : a.packing_id
      ? `pk:${a.packing_id}`
      : null;
  if (dupKey) {
    const matches = allForStaff.filter((other) => {
      const k = other.warehouse_event_id
        ? `ev:${other.warehouse_event_id}`
        : other.packing_id
          ? `pk:${other.packing_id}`
          : null;
      return k === dupKey;
    });
    if (matches.length > 1) problems.push(`dublett (${matches.length})`);
  }
  return problems;
}

export default function WarehouseAssignmentsDebug() {
  const { isAdmin, isLoading: rolesLoading } = useUserRoles();
  const { organizationId } = useCurrentOrg();
  const [dateStr, setDateStr] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const enabled = !!organizationId && isAdmin;

  const { data, isLoading, error } = useQuery({
    queryKey: ['warehouse-assignments-debug', organizationId, dateStr],
    enabled,
    queryFn: async () => {
      const [staffRes, saRes, waRes] = await Promise.all([
        supabase
          .from('staff_members')
          .select('id, name')
          .eq('organization_id', organizationId!)
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('staff_assignments')
          .select('staff_id, team_id')
          .eq('assignment_date', dateStr),
        supabase
          .from('warehouse_assignments')
          .select(
            'id, staff_id, assignment_type, action, title, status, start_time, end_time, packing_id, booking_id, booking_number, delivery_address, warehouse_event_id',
          )
          .eq('assignment_date', dateStr)
          .eq('organization_id', organizationId!),
      ]);
      return {
        staff: (staffRes.data ?? []) as StaffRow[],
        staffAssignments: (saRes.data ?? []) as StaffAssignmentRow[],
        warehouseAssignments: (waRes.data ?? []) as WarehouseAssignmentRow[],
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const lagerTeamByStaff = new Map<string, string[]>();
    for (const sa of data.staffAssignments) {
      if (!isWarehouseTeam(sa.team_id) || !sa.staff_id) continue;
      const arr = lagerTeamByStaff.get(sa.staff_id) ?? [];
      arr.push(sa.team_id);
      lagerTeamByStaff.set(sa.staff_id, arr);
    }

    const waByStaff = new Map<string, WarehouseAssignmentRow[]>();
    for (const wa of data.warehouseAssignments) {
      if (!wa.staff_id) continue;
      const arr = waByStaff.get(wa.staff_id) ?? [];
      arr.push(wa);
      waByStaff.set(wa.staff_id, arr);
    }

    return data.staff
      .map((s) => {
        const lagerTeams = lagerTeamByStaff.get(s.id) ?? [];
        const assignments = waByStaff.get(s.id) ?? [];
        const visibleInTimeApp = lagerTeams.length > 0 || assignments.length > 0;
        return {
          staff: s,
          lagerTeams,
          hasLagerPlacement: lagerTeams.length > 0,
          assignments,
          visibleInTimeApp,
        };
      })
      .filter((r) => r.hasLagerPlacement || r.assignments.length > 0)
      .sort((a, b) => (a.staff.name ?? '').localeCompare(b.staff.name ?? '', 'sv'));
  }, [data]);

  if (rolesLoading) return <div className="p-6">Laddar…</div>;
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">Endast admin har tillgång till denna debug-vy.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{getWarehouseDisplayName()} → Time-app — debug</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground">Datum</label>
          <Input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="w-auto"
          />
          {isLoading && <span className="text-sm text-muted-foreground">Hämtar…</span>}
          {error && <span className="text-sm text-destructive">Fel: {(error as Error).message}</span>}
        </CardContent>
      </Card>

      {rows.length === 0 && !isLoading && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Ingen personal har Lager-placering eller warehouse_assignments för {dateStr}.
          </CardContent>
        </Card>
      )}

      {rows.map((row) => (
        <Card key={row.staff.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {row.staff.name ?? '(namnlös)'}{' '}
              <span className="text-xs text-muted-foreground font-normal">{row.staff.id}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={row.hasLagerPlacement ? 'default' : 'outline'}>
                Lager-placering: {row.hasLagerPlacement ? 'ja' : 'nej'}
              </Badge>
              <Badge variant="secondary">{row.assignments.length} uppgifter</Badge>
              <Badge variant={row.visibleInTimeApp ? 'default' : 'destructive'}>
                Time-app: {row.visibleInTimeApp ? 'syns' : 'syns ej'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {row.hasLagerPlacement && (
              <div className="text-xs text-muted-foreground mb-2">
                Lager-team: {row.lagerTeams.join(', ')}
              </div>
            )}
            {row.assignments.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                Lager-pass utan konkreta warehouse_assignments — Time-appen visar placeholder.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-3">Titel</th>
                      <th className="py-2 pr-3">Typ</th>
                      <th className="py-2 pr-3">Tid</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">packing_id</th>
                      <th className="py-2 pr-3">booking_number</th>
                      <th className="py-2 pr-3">Adress</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.assignments.map((a) => {
                      const probs = detectProblems(a, row.assignments);
                      const time =
                        a.start_time || a.end_time
                          ? `${a.start_time ?? '—'}–${a.end_time ?? '—'}`
                          : '—';
                      return (
                        <tr key={a.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3">{a.title ?? '—'}</td>
                          <td className="py-2 pr-3">{a.assignment_type}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{time}</td>
                          <td className="py-2 pr-3">{a.status}</td>
                          <td className="py-2 pr-3 font-mono">
                            {a.packing_id ? a.packing_id.slice(0, 8) : '—'}
                          </td>
                          <td className="py-2 pr-3">{a.booking_number ?? '—'}</td>
                          <td className="py-2 pr-3 max-w-[240px]">
                            {a.delivery_address ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-3">{a.action ?? '—'}</td>
                          <td className="py-2 pr-3">
                            {probs.length === 0 ? (
                              <span className="text-muted-foreground">OK</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {probs.map((p) => (
                                  <Badge key={p} variant="destructive" className="text-[10px]">
                                    {p}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
