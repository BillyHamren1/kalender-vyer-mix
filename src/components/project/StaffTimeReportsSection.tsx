import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { StaffTimeReport } from '@/types/projectStaff';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface StaffTimeReportsSectionProps {
  reports: StaffTimeReport[];
  isLoading: boolean;
  onAddReport: () => void;
  onDeleteReport: (id: string) => void;
}

export const StaffTimeReportsSection = ({
  reports,
  isLoading,
  onAddReport,
  onDeleteReport
}: StaffTimeReportsSectionProps) => {
  const totalHours = reports.reduce((sum, r) => sum + r.hours_worked, 0);
  const totalOvertime = reports.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Rapporterad tid
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Laddar...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Rapporterad tid
        </CardTitle>
        <Button size="sm" onClick={onAddReport}>
          <Plus className="h-4 w-4 mr-1" />
          Registrera
        </Button>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Ingen tid rapporterad ännu.
            <br />
            <Button variant="link" onClick={onAddReport} className="mt-2">
              Klicka här för att registrera tid
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Personal</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Slut</TableHead>
                  <TableHead className="text-right">Timmar</TableHead>
                  <TableHead className="text-right">Övertid</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">{report.staff_name}</TableCell>
                    <TableCell>
                      {format(new Date(report.report_date), 'd MMM yyyy', { locale: sv })}
                    </TableCell>
                    <TableCell>{report.start_time || '-'}</TableCell>
                    <TableCell>{report.end_time || '-'}</TableCell>
                    <TableCell className="text-right">{report.hours_worked} h</TableCell>
                    <TableCell className="text-right">
                      {report.overtime_hours > 0 ? `${report.overtime_hours} h` : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteReport(report.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell colSpan={4}>TOTALT</TableCell>
                  <TableCell className="text-right">{totalHours} h</TableCell>
                  <TableCell className="text-right">
                    {totalOvertime > 0 ? `${totalOvertime} h` : '-'}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
