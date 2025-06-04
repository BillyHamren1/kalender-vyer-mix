
import React from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Calendar, DollarSign, Trash2 } from 'lucide-react';
import { TimeReport } from '@/types/timeReport';

interface TimeReportListProps {
  reports: TimeReport[];
  onDelete?: (reportId: string) => void;
  showStaffName?: boolean;
  showBookingInfo?: boolean;
}

const TimeReportList: React.FC<TimeReportListProps> = ({
  reports,
  onDelete,
  showStaffName = true,
  showBookingInfo = true
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const calculateCost = (report: TimeReport) => {
    const hourlyRate = report.staff_members?.hourly_rate || 0;
    const overtimeRate = report.staff_members?.overtime_rate || hourlyRate;
    const regularHours = report.hours_worked - (report.overtime_hours || 0);
    const overtimeHours = report.overtime_hours || 0;
    
    return (regularHours * hourlyRate) + (overtimeHours * overtimeRate);
  };

  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-600 mb-2">No time reports found</h3>
          <p className="text-gray-500 text-center">
            Time reports will appear here once they are submitted.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">
                    {format(new Date(report.report_date), 'EEEE, MMMM d, yyyy')}
                  </span>
                  <Badge variant="secondary">
                    {report.hours_worked}h
                  </Badge>
                  {report.overtime_hours && report.overtime_hours > 0 && (
                    <Badge variant="destructive">
                      {report.overtime_hours}h OT
                    </Badge>
                  )}
                </div>

                {showStaffName && report.staff_members && (
                  <p className="text-sm text-gray-600 mb-1">
                    Staff: {report.staff_members.name}
                  </p>
                )}

                {showBookingInfo && report.bookings && (
                  <p className="text-sm text-gray-600 mb-1">
                    Job: {report.bookings.client}
                    {report.bookings.booking_number && ` (${report.bookings.booking_number})`}
                  </p>
                )}

                {(report.start_time || report.end_time) && (
                  <p className="text-sm text-gray-600 mb-1">
                    Time: {report.start_time || 'N/A'} - {report.end_time || 'N/A'}
                    {report.break_time && report.break_time > 0 && (
                      <span className="ml-2 text-gray-500">
                        (Break: {report.break_time}h)
                      </span>
                    )}
                  </p>
                )}

                {report.description && (
                  <p className="text-sm text-gray-700 mt-2">
                    {report.description}
                  </p>
                )}

                {report.staff_members?.hourly_rate && (
                  <div className="flex items-center gap-2 mt-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-600">
                      Labor Cost: {formatCurrency(calculateCost(report))}
                    </span>
                  </div>
                )}
              </div>

              {onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(report.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default TimeReportList;
