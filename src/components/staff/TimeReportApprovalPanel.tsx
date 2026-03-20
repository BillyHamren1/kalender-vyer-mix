import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, Clock, Check, X, Pencil, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useApproveTimeReport } from '@/hooks/useApproveTimeReport';

interface PendingTimeReport {
  id: string;
  staff_id: string;
  staff_name: string;
  booking_id: string;
  booking_client: string;
  booking_number: string | null;
  report_date: string;
  start_time: string | null;
  end_time: string | null;
  hours_worked: number;
  overtime_hours: number;
  description: string | null;
  approved: boolean;
  created_at: string;
}

export const TimeReportApprovalPanel: React.FC = () => {
  const { approveMutation, editMutation } = useApproveTimeReport();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    hours_worked: number;
    overtime_hours: number;
    start_time: string;
    end_time: string;
    description: string;
  }>({ hours_worked: 0, overtime_hours: 0, start_time: '', end_time: '', description: '' });

  useRealtimeInvalidation({
    channelName: 'time-reports-realtime',
    tables: ['time_reports'],
    queryKeys: [['pending-time-reports']],
  });

  const { data: pendingReports = [], isLoading } = useQuery({
    queryKey: ['pending-time-reports'],
    queryFn: async (): Promise<PendingTimeReport[]> => {
      const { data, error } = await supabase
        .from('time_reports')
        .select(`
          id, staff_id, booking_id, report_date, start_time, end_time,
          hours_worked, overtime_hours, description, approved, created_at,
          staff_members!inner(name),
          bookings!inner(client, booking_number)
        `)
        .eq('approved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []).map((report: any) => ({
        id: report.id,
        staff_id: report.staff_id,
        staff_name: report.staff_members?.name || 'Okänd',
        booking_id: report.booking_id,
        booking_client: report.bookings?.client || 'Okänd',
        booking_number: report.bookings?.booking_number,
        report_date: report.report_date,
        start_time: report.start_time,
        end_time: report.end_time,
        hours_worked: report.hours_worked,
        overtime_hours: report.overtime_hours || 0,
        description: report.description,
        approved: report.approved,
        created_at: report.created_at
      }));
    },
    refetchInterval: 300000,
  });

  // Fetch edit logs for pending reports
  const reportIds = pendingReports.map(r => r.id);
  const { data: editLogs = [] } = useQuery({
    queryKey: ['time-report-edit-logs', reportIds],
    queryFn: async () => {
      if (reportIds.length === 0) return [];
      const { data, error } = await supabase
        .from('time_report_edit_log')
        .select('id, time_report_id, edited_by_type, edited_by_name, previous_values, new_values, created_at')
        .in('time_report_id', reportIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: reportIds.length > 0,
  });

  const editLogsByReport = editLogs.reduce((acc: Record<string, any[]>, log: any) => {
    if (!acc[log.time_report_id]) acc[log.time_report_id] = [];
    acc[log.time_report_id].push(log);
    return acc;
  }, {});

  const handleApprove = (reportId: string) => {
    approveMutation.mutate(reportId);
  };

  const handleReject = (reportId: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna tidrapport?')) {
      supabase.from('time_reports').delete().eq('id', reportId).then(({ error }) => {
        if (error) {
          toast.error('Kunde inte ta bort tidrapporten');
        } else {
          toast.success('Tidrapporten borttagen');
          // Invalidation handled by realtime
        }
      });
    }
  };

  const handleApproveAll = () => {
    if (pendingReports.length === 0) return;
    if (!window.confirm(`Godkänn alla ${pendingReports.length} väntande tidrapporter?`)) return;
    approveMutation.mutate(pendingReports.map(r => r.id));
  };

  const startEdit = (report: PendingTimeReport) => {
    setEditingId(report.id);
    setEditValues({
      hours_worked: report.hours_worked,
      overtime_hours: report.overtime_hours,
      start_time: report.start_time?.slice(0, 5) || '',
      end_time: report.end_time?.slice(0, 5) || '',
      description: report.description || '',
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const report = pendingReports.find(r => r.id === editingId);
    const previousValues: Record<string, unknown> = {};
    if (report) {
      if (editValues.hours_worked !== report.hours_worked) previousValues.hours_worked = report.hours_worked;
      if (editValues.overtime_hours !== report.overtime_hours) previousValues.overtime_hours = report.overtime_hours;
      if ((editValues.start_time || null) !== report.start_time) previousValues.start_time = report.start_time;
      if ((editValues.end_time || null) !== report.end_time) previousValues.end_time = report.end_time;
      if ((editValues.description || null) !== report.description) previousValues.description = report.description;
    }
    editMutation.mutate({
      id: editingId,
      updates: {
        hours_worked: editValues.hours_worked,
        overtime_hours: editValues.overtime_hours,
        start_time: editValues.start_time || null,
        end_time: editValues.end_time || null,
        description: editValues.description || null,
      },
      previousValues,
    }, {
      onSuccess: () => setEditingId(null),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5" />
            Väntande tidrapporter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          Väntande godkännanden
          {pendingReports.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {pendingReports.length}
            </Badge>
          )}
        </CardTitle>
        {pendingReports.length > 1 && (
          <Button 
            size="sm" 
            onClick={handleApproveAll}
            disabled={approveMutation.isPending}
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Godkänn alla
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {pendingReports.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-2" />
            <p>Alla tidrapporter är godkända!</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Personal</TableHead>
                  <TableHead>Projekt/Bokning</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Tid</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-center">Åtgärd</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingReports.map((report) => {
                  const isEditing = editingId === report.id;
                  const reportEditLogs = editLogsByReport[report.id] || [];
                  const hasEdits = reportEditLogs.length > 0;
                  return (
                    <React.Fragment key={report.id}>
                    <TableRow className="group hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-0.5">
                          {report.staff_name}
                          {hasEdits && (
                            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full w-fit flex items-center gap-0.5">
                              <Pencil className="w-2.5 h-2.5" />
                              Ändrad {reportEditLogs.length}x
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{report.booking_client}</span>
                          {report.booking_number && (
                            <span className="text-xs text-muted-foreground">
                              #{report.booking_number}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(report.report_date), 'd MMM yyyy', { locale: sv })}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Input
                              type="time"
                              value={editValues.start_time}
                              onChange={(e) => setEditValues(v => ({ ...v, start_time: e.target.value }))}
                              className="h-7 w-20 text-xs"
                            />
                            <Input
                              type="time"
                              value={editValues.end_time}
                              onChange={(e) => setEditValues(v => ({ ...v, end_time: e.target.value }))}
                              className="h-7 w-20 text-xs"
                            />
                          </div>
                        ) : (
                          report.start_time && report.end_time ? (
                            <span className="text-sm">
                              {report.start_time.slice(0, 5)} - {report.end_time.slice(0, 5)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.25"
                              value={editValues.hours_worked}
                              onChange={(e) => setEditValues(v => ({ ...v, hours_worked: parseFloat(e.target.value) || 0 }))}
                              className="h-7 w-16 text-xs text-right"
                            />
                          </div>
                        ) : (
                          <>
                            <span className="font-medium">{report.hours_worked} h</span>
                            {report.overtime_hours > 0 && (
                              <span className="text-amber-600 text-xs ml-1">
                                (+{report.overtime_hours} öt)
                              </span>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={saveEdit}
                                disabled={editMutation.isPending}
                                title="Spara"
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground"
                                onClick={() => setEditingId(null)}
                                title="Avbryt"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                onClick={() => startEdit(report)}
                                title="Redigera"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={() => handleApprove(report.id)}
                                disabled={approveMutation.isPending}
                                title="Godkänn"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleReject(report.id)}
                                title="Ta bort"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimeReportApprovalPanel;
