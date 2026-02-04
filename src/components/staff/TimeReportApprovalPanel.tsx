import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle, Clock, AlertCircle, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const queryClient = useQueryClient();

  const { data: pendingReports = [], isLoading } = useQuery({
    queryKey: ['pending-time-reports'],
    queryFn: async (): Promise<PendingTimeReport[]> => {
      const { data, error } = await supabase
        .from('time_reports')
        .select(`
          id,
          staff_id,
          booking_id,
          report_date,
          start_time,
          end_time,
          hours_worked,
          overtime_hours,
          description,
          approved,
          created_at,
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
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const approveMutation = useMutation({
    mutationFn: async ({ reportId, approverName }: { reportId: string; approverName: string }) => {
      const { error } = await supabase
        .from('time_reports')
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: approverName
        })
        .eq('id', reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-time-reports'] });
      queryClient.invalidateQueries({ queryKey: ['staff-economy-overview'] });
      toast.success('Tidrapporten godkänd');
    },
    onError: (error) => {
      console.error('Error approving time report:', error);
      toast.error('Kunde inte godkänna tidrapporten');
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from('time_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-time-reports'] });
      toast.success('Tidrapporten borttagen');
    },
    onError: (error) => {
      console.error('Error rejecting time report:', error);
      toast.error('Kunde inte ta bort tidrapporten');
    }
  });

  const handleApprove = (reportId: string) => {
    approveMutation.mutate({ reportId, approverName: 'Admin' });
  };

  const handleReject = (reportId: string) => {
    if (window.confirm('Är du säker på att du vill ta bort denna tidrapport?')) {
      rejectMutation.mutate(reportId);
    }
  };

  const handleApproveAll = () => {
    if (pendingReports.length === 0) return;
    if (!window.confirm(`Godkänn alla ${pendingReports.length} väntande tidrapporter?`)) return;

    pendingReports.forEach(report => {
      approveMutation.mutate({ reportId: report.id, approverName: 'Admin' });
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
                {pendingReports.map((report) => (
                  <TableRow key={report.id} className="group hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {report.staff_name}
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
                      {report.start_time && report.end_time ? (
                        <span className="text-sm">
                          {report.start_time.slice(0, 5)} - {report.end_time.slice(0, 5)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium">{report.hours_worked} h</span>
                      {report.overtime_hours > 0 && (
                        <span className="text-amber-600 text-xs ml-1">
                          (+{report.overtime_hours} öt)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
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
                          disabled={rejectMutation.isPending}
                          title="Ta bort"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TimeReportApprovalPanel;
