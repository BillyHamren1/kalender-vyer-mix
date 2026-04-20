import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Check,
  CheckCircle,
  ClipboardCheck,
  Clock,
  Download,
  FolderOpen,
  Pencil,
  Save,
  User,
  Users,
  X,
} from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';
import { formatHoursMinutes } from '@/utils/formatHours';
import { downloadFile, toCSV } from '@/services/analyticsExportService';
import {
  buildExportRows,
  getApprovalStatus,
  groupReportsByProject,
  groupReportsByStaff,
  type ApprovalSourceType,
  type ReportGroup,
  type UnifiedApprovalRow,
} from '@/lib/timeReportApprovalUtils';

const DASHBOARD_QUERY_KEY = ['time-report-approval-dashboard'];
const QUERY_KEYS_TO_INVALIDATE = [
  ['pending-time-reports'],
  ['time-report-approval-dashboard'],
  ['economy-time-reports'],
  ['economy-overview'],
  ['project-time-reports'],
  ['staff-economy-overview'],
];

type ViewMode = 'staff' | 'project' | 'all';
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

type EditState = {
  key: string;
  row: UnifiedApprovalRow;
  hoursWorked: number;
  overtimeHours: number;
  startTime: string;
  endTime: string;
  description: string;
};

type RejectState = {
  row: UnifiedApprovalRow;
  comment: string;
};

type ReviewLog = {
  id: string;
  parentId: string;
  editedByName: string;
  editedByType: string;
  previousValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  createdAt: string;
};

const rowKey = (row: Pick<UnifiedApprovalRow, 'sourceType' | 'id'>) => `${row.sourceType}:${row.id}`;

async function getReviewerName(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'Okänd';

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  return profile?.full_name || user.email || 'Admin';
}

function getProjectLabel(client?: string | null, bookingNumber?: string | null, assignedProjectName?: string | null) {
  if (assignedProjectName) return assignedProjectName;
  if (bookingNumber && client) return `${bookingNumber} · ${client}`;
  return client || 'Okänt projekt';
}

function StatusBadge({ row }: { row: UnifiedApprovalRow }) {
  const status = getApprovalStatus(row);

  if (status === 'approved') {
    return <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">Godkänd</Badge>;
  }

  if (status === 'rejected') {
    return <Badge variant="destructive">Avvisad</Badge>;
  }

  return <Badge variant="secondary">Väntar</Badge>;
}

function GroupSection({
  group,
  children,
}: {
  group: ReportGroup;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{group.label}</h3>
          <p className="text-sm text-muted-foreground">
            {formatHoursMinutes(group.totalHours)} · {group.rows.length} rader
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{group.pendingCount} väntar</Badge>
          <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">{group.approvedCount} godkända</Badge>
          {group.rejectedCount > 0 && <Badge variant="destructive">{group.rejectedCount} avvisade</Badge>}
        </div>
      </div>
      {children}
    </div>
  );
}

export const TimeReportApprovalPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { approveMutation } = useApproveTimeReport();
  const [viewMode, setViewMode] = useState<ViewMode>('staff');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [rejectState, setRejectState] = useState<RejectState | null>(null);

  const invalidateDashboard = async () => {
    await Promise.all(
      QUERY_KEYS_TO_INVALIDATE.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
    );
  };

  useRealtimeInvalidation({
    channelName: 'time-report-approval-dashboard',
    tables: ['time_reports', 'travel_time_logs'],
    queryKeys: [DASHBOARD_QUERY_KEY, ['pending-time-reports']],
  });

  const { data, isLoading } = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: async () => {
      const [timeReportsRes, travelLogsRes] = await Promise.all([
        supabase
          .from('time_reports')
          .select(`
            id,
            organization_id,
            staff_id,
            booking_id,
            report_date,
            start_time,
            end_time,
            hours_worked,
            overtime_hours,
            description,
            approved,
            approved_at,
            approved_by,
            rejected_at,
            rejected_by,
            rejection_comment,
            created_at,
            staff_members!inner(name),
            bookings(client, booking_number, assigned_project_name)
          `)
          .order('report_date', { ascending: false })
          .limit(1000),
        supabase
          .from('travel_time_logs')
          .select(`
            id,
            organization_id,
            staff_id,
            destination_booking_id,
            report_date,
            start_time,
            end_time,
            hours_worked,
            description,
            manual_project_name,
            approved,
            approved_at,
            approved_by,
            rejected_at,
            rejected_by,
            rejection_comment,
            created_at,
            staff_members!inner(name)
          `)
          .not('end_time', 'is', null)
          .order('report_date', { ascending: false })
          .limit(1000),
      ]);

      if (timeReportsRes.error) throw timeReportsRes.error;
      if (travelLogsRes.error) throw travelLogsRes.error;

      const travelDestinationIds = [...new Set((travelLogsRes.data || []).map((row) => row.destination_booking_id).filter(Boolean))] as string[];
      const timeReportIds = (timeReportsRes.data || []).map((row) => row.id);
      const travelLogIds = (travelLogsRes.data || []).map((row) => row.id);

      const [travelBookingsRes, timeLogsRes, travelEditLogsRes] = await Promise.all([
        travelDestinationIds.length
          ? supabase.from('bookings').select('id, client, booking_number, assigned_project_name').in('id', travelDestinationIds)
          : Promise.resolve({ data: [], error: null }),
        timeReportIds.length
          ? supabase
              .from('time_report_edit_log')
              .select('id, time_report_id, edited_by_name, edited_by_type, previous_values, new_values, created_at')
              .in('time_report_id', timeReportIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        travelLogIds.length
          ? supabase
              .from('travel_time_edit_log')
              .select('id, travel_log_id, edited_by_name, edited_by_type, previous_values, new_values, created_at')
              .in('travel_log_id', travelLogIds)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (travelBookingsRes.error) throw travelBookingsRes.error;
      if (timeLogsRes.error) throw timeLogsRes.error;
      if (travelEditLogsRes.error) throw travelEditLogsRes.error;

      const destinationMap = new Map(
        (travelBookingsRes.data || []).map((booking) => [
          booking.id,
          getProjectLabel(booking.client, booking.booking_number, booking.assigned_project_name),
        ])
      );

      const rows: UnifiedApprovalRow[] = [
        ...(timeReportsRes.data || []).map((row: any) => ({
          id: row.id,
          organizationId: row.organization_id,
          sourceType: 'time_report' as const,
          staffId: row.staff_id,
          staffName: row.staff_members?.name || 'Okänd',
          projectId: row.booking_id || `time-report-${row.id}`,
          projectLabel: getProjectLabel(
            row.bookings?.client,
            row.bookings?.booking_number,
            row.bookings?.assigned_project_name,
          ),
          reportDate: row.report_date,
          startTime: row.start_time,
          endTime: row.end_time,
          hoursWorked: row.hours_worked,
          overtimeHours: row.overtime_hours || 0,
          description: row.description,
          approved: row.approved === true,
          approvedAt: row.approved_at,
          approvedBy: row.approved_by,
          rejectedAt: row.rejected_at,
          rejectedBy: row.rejected_by,
          rejectionComment: row.rejection_comment,
          createdAt: row.created_at,
          typeLabel: 'Arbete',
        })),
        ...(travelLogsRes.data || []).map((row: any) => ({
          id: row.id,
          organizationId: row.organization_id,
          sourceType: 'travel_log' as const,
          staffId: row.staff_id,
          staffName: row.staff_members?.name || 'Okänd',
          projectId: row.destination_booking_id || row.manual_project_name || `travel-${row.id}`,
          projectLabel: destinationMap.get(row.destination_booking_id) || row.manual_project_name || 'Resa utan projektreferens',
          reportDate: row.report_date,
          startTime: row.start_time,
          endTime: row.end_time,
          hoursWorked: row.hours_worked,
          overtimeHours: 0,
          description: row.description,
          approved: row.approved === true,
          approvedAt: row.approved_at,
          approvedBy: row.approved_by,
          rejectedAt: row.rejected_at,
          rejectedBy: row.rejected_by,
          rejectionComment: row.rejection_comment,
          createdAt: row.created_at,
          typeLabel: 'Resa',
        })),
      ].sort((a, b) => {
        if (a.reportDate !== b.reportDate) return b.reportDate.localeCompare(a.reportDate);
        return (b.startTime || '').localeCompare(a.startTime || '');
      });

      const reviewLogs: ReviewLog[] = [
        ...((timeLogsRes.data || []).map((log: any) => ({
          id: log.id,
          parentId: `time_report:${log.time_report_id}`,
          editedByName: log.edited_by_name,
          editedByType: log.edited_by_type,
          previousValues: log.previous_values || {},
          newValues: log.new_values || {},
          createdAt: log.created_at,
        })) as ReviewLog[]),
        ...((travelEditLogsRes.data || []).map((log: any) => ({
          id: log.id,
          parentId: `travel_log:${log.travel_log_id}`,
          editedByName: log.edited_by_name,
          editedByType: log.edited_by_type,
          previousValues: log.previous_values || {},
          newValues: log.new_values || {},
          createdAt: log.created_at,
        })) as ReviewLog[]),
      ];

      return { rows, reviewLogs };
    },
  });

  const rows = data?.rows || [];
  const logsByParent = useMemo(() => {
    const map = new Map<string, ReviewLog[]>();
    for (const log of data?.reviewLogs || []) {
      const existing = map.get(log.parentId) || [];
      existing.push(log);
      map.set(log.parentId, existing);
    }
    return map;
  }, [data?.reviewLogs]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus = statusFilter === 'all' || getApprovalStatus(row) === statusFilter;
      if (!matchesStatus) return false;
      if (!normalizedSearch) return true;
      return [row.staffName, row.projectLabel, row.description || '', row.typeLabel]
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [rows, search, statusFilter]);

  const staffGroups = useMemo(() => groupReportsByStaff(filteredRows), [filteredRows]);
  const projectGroups = useMemo(() => groupReportsByProject(filteredRows), [filteredRows]);
  const pendingRows = useMemo(() => filteredRows.filter((row) => getApprovalStatus(row) === 'pending'), [filteredRows]);
  const selectedPendingRows = useMemo(
    () => filteredRows.filter((row) => selectedKeys.includes(rowKey(row)) && getApprovalStatus(row) === 'pending'),
    [filteredRows, selectedKeys],
  );

  const approveTravelMutation = useMutation({
    mutationFn: async (travelIds: string[]) => {
      if (travelIds.length === 0) return;
      const reviewerName = await getReviewerName();
      const { error } = await supabase
        .from('travel_time_logs')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: reviewerName,
          rejected_at: null,
          rejected_by: null,
          rejection_comment: null,
        })
        .in('id', travelIds);

      if (error) throw error;
    },
    onSuccess: async () => {
      await invalidateDashboard();
      toast.success('Reserapport godkänd');
    },
    onError: () => toast.error('Kunde inte godkänna reserapport'),
  });

  const saveEditMutation = useMutation({
    mutationFn: async (state: EditState) => {
      const reviewerName = await getReviewerName();
      const updates = {
        hours_worked: state.hoursWorked,
        overtime_hours: state.row.sourceType === 'time_report' ? state.overtimeHours : 0,
        start_time: state.startTime || null,
        end_time: state.endTime || null,
        description: state.description || null,
      };

      const previousValues: Record<string, unknown> = {};
      if (state.row.hoursWorked !== state.hoursWorked) previousValues.hours_worked = state.row.hoursWorked;
      if (state.row.overtimeHours !== state.overtimeHours && state.row.sourceType === 'time_report') previousValues.overtime_hours = state.row.overtimeHours;
      if ((state.row.startTime || null) !== (state.startTime || null)) previousValues.start_time = state.row.startTime;
      if ((state.row.endTime || null) !== (state.endTime || null)) previousValues.end_time = state.row.endTime;
      if ((state.row.description || null) !== (state.description || null)) previousValues.description = state.row.description;

      if (state.row.sourceType === 'time_report') {
        const { error } = await supabase.from('time_reports').update(updates).eq('id', state.row.id);
        if (error) throw error;
        if (Object.keys(previousValues).length > 0) {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from('time_report_edit_log').insert({
            time_report_id: state.row.id,
            organization_id: state.row.organizationId,
            edited_by_type: 'admin',
            edited_by_name: reviewerName,
            edited_by_id: user?.id || null,
            previous_values: previousValues as any,
            new_values: updates as any,
          } as any);
        }
        return;
      }

      const travelUpdates = {
        hours_worked: state.hoursWorked,
        start_time: state.startTime || null,
        end_time: state.endTime || null,
        description: state.description || null,
      };
      const { error } = await supabase.from('travel_time_logs').update(travelUpdates).eq('id', state.row.id);
      if (error) throw error;
      if (Object.keys(previousValues).length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('travel_time_edit_log').insert({
          travel_log_id: state.row.id,
          organization_id: state.row.organizationId,
          edited_by_type: 'admin',
          edited_by_name: reviewerName,
          edited_by_id: user?.id || null,
          previous_values: previousValues as any,
          new_values: travelUpdates as any,
        } as any);
      }
    },
    onSuccess: async () => {
      setEditState(null);
      await invalidateDashboard();
      toast.success('Rapport uppdaterad');
    },
    onError: () => toast.error('Kunde inte uppdatera rapporten'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ row, comment }: { row: UnifiedApprovalRow; comment: string }) => {
      const reviewerName = await getReviewerName();
      const payload = {
        approved: false,
        approved_at: null,
        approved_by: null,
        rejected_at: new Date().toISOString(),
        rejected_by: reviewerName,
        rejection_comment: comment,
      };

      if (row.sourceType === 'time_report') {
        const { error } = await supabase.from('time_reports').update(payload).eq('id', row.id);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('travel_time_logs').update(payload).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      setRejectState(null);
      await invalidateDashboard();
      toast.success('Rapport avvisad');
    },
    onError: () => toast.error('Kunde inte avvisa rapporten'),
  });

  const toggleSelected = (row: UnifiedApprovalRow, checked: boolean) => {
    const key = rowKey(row);
    setSelectedKeys((current) => checked ? [...current, key] : current.filter((value) => value !== key));
  };

  const handleApproveRows = async (rowsToApprove: UnifiedApprovalRow[]) => {
    if (rowsToApprove.length === 0) return;

    const timeReportIds = rowsToApprove.filter((row) => row.sourceType === 'time_report').map((row) => row.id);
    const travelIds = rowsToApprove.filter((row) => row.sourceType === 'travel_log').map((row) => row.id);

    if (timeReportIds.length > 0) {
      approveMutation.mutate(timeReportIds, {
        onSuccess: async () => {
          if (travelIds.length > 0) {
            approveTravelMutation.mutate(travelIds);
          } else {
            setSelectedKeys([]);
          }
        },
      });
      return;
    }

    approveTravelMutation.mutate(travelIds);
    setSelectedKeys([]);
  };

  const startEdit = (row: UnifiedApprovalRow) => {
    setEditState({
      key: rowKey(row),
      row,
      hoursWorked: row.hoursWorked,
      overtimeHours: row.overtimeHours,
      startTime: row.startTime?.slice(0, 5) || '',
      endTime: row.endTime?.slice(0, 5) || '',
      description: row.description || '',
    });
  };

  const exportCurrentView = () => {
    const filename = viewMode === 'staff'
      ? 'tidrapporter_per_anvandare.csv'
      : viewMode === 'project'
        ? 'tidrapporter_per_projekt.csv'
        : 'alla_tidrapporter.csv';

    const csv = toCSV(buildExportRows(filteredRows));
    downloadFile(csv, filename, 'text/csv');
    toast.success('CSV exporterad');
  };

  const renderRow = (row: UnifiedApprovalRow) => {
    const key = rowKey(row);
    const isEditing = editState?.key === key;
    const status = getApprovalStatus(row);
    const logs = logsByParent.get(key) || [];

    return (
      <React.Fragment key={key}>
        <TableRow className="align-top">
          <TableCell className="w-10">
            {status === 'pending' ? (
              <Checkbox
                checked={selectedKeys.includes(key)}
                onCheckedChange={(checked) => toggleSelected(row, checked === true)}
                aria-label={`Välj ${row.staffName}`}
              />
            ) : null}
          </TableCell>
          <TableCell>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{row.staffName}</p>
              <Badge variant="outline">{row.typeLabel}</Badge>
            </div>
          </TableCell>
          <TableCell>
            <div className="space-y-1">
              <p className="font-medium text-foreground">{row.projectLabel}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(row.reportDate), 'd MMM yyyy', { locale: sv })}
              </p>
            </div>
          </TableCell>
          <TableCell>
            {isEditing ? (
              <div className="flex flex-col gap-2 md:flex-row">
                <Input
                  type="time"
                  value={editState.startTime}
                  onChange={(event) => setEditState((current) => current ? { ...current, startTime: event.target.value } : current)}
                  className="h-9 w-full md:w-28"
                />
                <Input
                  type="time"
                  value={editState.endTime}
                  onChange={(event) => setEditState((current) => current ? { ...current, endTime: event.target.value } : current)}
                  className="h-9 w-full md:w-28"
                />
              </div>
            ) : (
              <span className="text-sm text-foreground">
                {row.startTime && row.endTime ? `${row.startTime.slice(0, 5)}–${row.endTime.slice(0, 5)}` : '—'}
              </span>
            )}
          </TableCell>
          <TableCell className="min-w-[220px]">
            {isEditing ? (
              <Textarea
                value={editState.description}
                onChange={(event) => setEditState((current) => current ? { ...current, description: event.target.value } : current)}
                className="min-h-[72px]"
                placeholder="Beskrivning"
              />
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-foreground">{row.description || 'Ingen kommentar'}</p>
                {row.rejectionComment && status === 'rejected' ? (
                  <p className="text-xs text-destructive">Avvisad: {row.rejectionComment}</p>
                ) : null}
              </div>
            )}
          </TableCell>
          <TableCell className="text-right">
            {isEditing ? (
              <div className="flex flex-col items-end gap-2">
                <Input
                  type="number"
                  step="0.25"
                  value={editState.hoursWorked}
                  onChange={(event) => setEditState((current) => current ? { ...current, hoursWorked: Number(event.target.value) || 0 } : current)}
                  className="h-9 w-24 text-right"
                />
                {row.sourceType === 'time_report' ? (
                  <Input
                    type="number"
                    step="0.25"
                    value={editState.overtimeHours}
                    onChange={(event) => setEditState((current) => current ? { ...current, overtimeHours: Number(event.target.value) || 0 } : current)}
                    className="h-9 w-24 text-right"
                  />
                ) : null}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-medium text-foreground">{formatHoursMinutes(row.hoursWorked)}</p>
                {row.overtimeHours > 0 ? <p className="text-xs text-muted-foreground">ÖT {formatHoursMinutes(row.overtimeHours)}</p> : null}
              </div>
            )}
          </TableCell>
          <TableCell>
            <StatusBadge row={row} />
          </TableCell>
          <TableCell className="text-right">
            <div className="flex items-center justify-end gap-1">
              {isEditing ? (
                <>
                  <Button size="icon" variant="ghost" onClick={() => editState && saveEditMutation.mutate(editState)} disabled={saveEditMutation.isPending}>
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditState(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button size="icon" variant="ghost" onClick={() => startEdit(row)} title="Redigera">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {status === 'pending' ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleApproveRows([row])}
                        disabled={approveMutation.isPending || approveTravelMutation.isPending}
                        title="Godkänn"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setRejectState({ row, comment: '' })} title="Avvisa">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
        {logs.length > 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="bg-muted/40 py-2">
              <div className="space-y-1 text-xs text-muted-foreground">
                {logs.map((log) => (
                  <p key={log.id}>
                    <span className="font-medium text-foreground">{log.editedByName}</span> ändrade rapporten {format(new Date(log.createdAt), 'd MMM HH:mm', { locale: sv })}
                  </p>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ) : null}
      </React.Fragment>
    );
  };

  const renderTable = (tableRows: UnifiedApprovalRow[]) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Användare</TableHead>
            <TableHead>Projekt</TableHead>
            <TableHead>Tid</TableHead>
            <TableHead>Beskrivning</TableHead>
            <TableHead className="text-right">Timmar</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Åtgärder</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableRows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                Inga rapporter matchar filtret.
              </TableCell>
            </TableRow>
          ) : (
            tableRows.map(renderRow)
          )}
        </TableBody>
      </Table>
    </div>
  );

  const summary = useMemo(() => {
    const approved = filteredRows.filter((row) => getApprovalStatus(row) === 'approved').length;
    const rejected = filteredRows.filter((row) => getApprovalStatus(row) === 'rejected').length;
    return {
      totalHours: filteredRows.reduce((sum, row) => sum + row.hoursWorked, 0),
      pending: pendingRows.length,
      approved,
      rejected,
    };
  }, [filteredRows, pendingRows.length]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardCheck className="h-5 w-5" />
            Tidrapporter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Tidrapportöversikt
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                All lönegrundande tid inklusive resor, grupperad per användare eller projekt.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{summary.pending} väntar</Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">{summary.approved} godkända</Badge>
              {summary.rejected > 0 ? <Badge variant="destructive">{summary.rejected} avvisade</Badge> : null}
              <Badge variant="outline">{formatHoursMinutes(summary.totalHours)}</Badge>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Sök användare, projekt eller beskrivning"
                className="md:max-w-sm"
              />
              <div className="flex flex-wrap gap-2">
                {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={statusFilter === option ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(option)}
                  >
                    {option === 'pending' ? 'Väntar' : option === 'approved' ? 'Godkända' : option === 'rejected' ? 'Avvisade' : 'Alla'}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportCurrentView}>
                <Download className="mr-2 h-4 w-4" />
                Exportera CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const pendingKeys = pendingRows.map((row) => rowKey(row));
                  setSelectedKeys((current) => current.length === pendingKeys.length ? [] : pendingKeys);
                }}
              >
                Markera alla väntande
              </Button>
              <Button
                size="sm"
                onClick={() => handleApproveRows(selectedPendingRows)}
                disabled={selectedPendingRows.length === 0 || approveMutation.isPending || approveTravelMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Godkänn markerade ({selectedPendingRows.length})
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="space-y-4">
            <TabsList className="h-auto flex-wrap gap-1 bg-muted p-1">
              <TabsTrigger value="staff" className="gap-2">
                <Users className="h-4 w-4" />
                Per användare
              </TabsTrigger>
              <TabsTrigger value="project" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Per projekt
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-2">
                <User className="h-4 w-4" />
                Alla rapporter
              </TabsTrigger>
            </TabsList>

            <TabsContent value="staff" className="space-y-4">
              {staffGroups.length === 0 ? renderTable([]) : staffGroups.map((group) => (
                <GroupSection key={group.key} group={group}>
                  {renderTable(group.rows)}
                </GroupSection>
              ))}
            </TabsContent>

            <TabsContent value="project" className="space-y-4">
              {projectGroups.length === 0 ? renderTable([]) : projectGroups.map((group) => (
                <GroupSection key={group.key} group={group}>
                  {renderTable(group.rows)}
                </GroupSection>
              ))}
            </TabsContent>

            <TabsContent value="all">
              {renderTable(filteredRows)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!rejectState} onOpenChange={(open) => !open && setRejectState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avvisa rapport</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Rapporten skickas tillbaka som avvisad och kräver en kommentar.
            </p>
            <Textarea
              value={rejectState?.comment || ''}
              onChange={(event) => setRejectState((current) => current ? { ...current, comment: event.target.value } : current)}
              placeholder="Skriv varför rapporten avvisas"
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectState(null)}>Avbryt</Button>
            <Button
              variant="destructive"
              onClick={() => rejectState && rejectMutation.mutate({ row: rejectState.row, comment: rejectState.comment.trim() })}
              disabled={!rejectState?.comment.trim() || rejectMutation.isPending}
            >
              Avvisa rapport
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TimeReportApprovalPanel;
