
import React from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';
import { TimeReport } from '@/types/timeReport';

interface TimeReportListViewProps {
  reports: TimeReport[];
  selectedDate: Date;
}

const TimeReportListView: React.FC<TimeReportListViewProps> = ({ reports, selectedDate }) => {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(selectedDate);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getReportsForDay = (day: Date) => {
    return reports.filter(report => 
      isSameDay(new Date(report.report_date), day)
    );
  };

  const getDayStats = (day: Date) => {
    const dayReports = getReportsForDay(day);
    const totalRegularHours = dayReports.reduce((total, report) => {
      return total + (report.hours_worked - (report.overtime_hours || 0));
    }, 0);
    const totalOvertimeHours = dayReports.reduce((total, report) => {
      return total + (report.overtime_hours || 0);
    }, 0);

    return { totalRegularHours, totalOvertimeHours };
  };

  const getDayName = (day: Date) => {
    return format(day, 'EEE');
  };

  const getDayNumber = (day: Date) => {
    return format(day, 'd');
  };

  return (
    <Card className="bg-white shadow-sm border border-gray-200">
      <CardContent className="p-0">
        <div className="space-y-0">
          {monthDays.map((day, index) => {
            const { totalRegularHours, totalOvertimeHours } = getDayStats(day);
            const dayReports = getReportsForDay(day);
            const hasReports = dayReports.length > 0;

            return (
              <div key={day.toISOString()}>
                <div className="flex items-center justify-between p-2 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="text-base font-medium text-gray-900 w-5">
                      {getDayNumber(day)}
                    </div>
                    <div className="text-gray-600 w-10 text-sm">
                      {getDayName(day)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Regular:</div>
                      <div className="font-medium text-sm">
                        {totalRegularHours.toFixed(2)}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Overtime:</div>
                      <div className={`font-medium text-sm ${totalOvertimeHours > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {totalOvertimeHours.toFixed(2)}
                      </div>
                    </div>

                    {hasReports && (
                      <ChevronDown className="h-3 w-3 text-[#82b6c6]" />
                    )}
                  </div>
                </div>

                {/* Expanded content for days with reports */}
                {hasReports && (
                  <div className="px-2 pb-2 border-l-2 border-blue-200 ml-2">
                    <div className="space-y-1">
                      {dayReports.map((report) => (
                        <div key={report.id} className="bg-gray-50 rounded p-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium text-xs">
                                {report.bookings?.client || 'Unknown Client'}
                              </div>
                              {report.start_time && report.end_time && (
                                <div className="text-xs text-gray-500">
                                  {report.start_time} - {report.end_time}
                                </div>
                              )}
                              {report.description && (
                                <div className="text-xs text-gray-600 mt-0.5">
                                  {report.description}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs py-0 px-1 h-4">
                                {report.hours_worked}h
                              </Badge>
                              {report.overtime_hours && report.overtime_hours > 0 && (
                                <Badge variant="destructive" className="text-xs py-0 px-1 h-4">
                                  {report.overtime_hours}h OT
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Divider line between days */}
                {index < monthDays.length - 1 && (
                  <div className="border-b border-gray-100" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default TimeReportListView;
